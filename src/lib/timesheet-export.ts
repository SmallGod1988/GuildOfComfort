import ExcelJS from "exceljs";

/** Строка табеля в том виде, в каком она попадает в книгу. */
export type TimesheetExportRow = {
  date: Date;
  installer: string;
  site: string | null;
  hours: number;
  note: string | null;
};

export type TimesheetExportOptions = {
  from: Date;
  to: Date;
};

const NO_SITE = "Без объекта";
const FONT = { name: "Arial", size: 10 };
const HEAD_FONT = { name: "Arial", size: 10, bold: true };
const TITLE_FONT = { name: "Arial", size: 12, bold: true };
const MONTHS = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Имя листа в формуле: кириллица и пробелы требуют кавычек. */
const ref = (sheet: string, range: string) => `'${sheet}'!${range}`;

function styleHeader(row: ExcelJS.Row) {
  row.font = HEAD_FONT;
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FFBFBFBF" } } };
  });
}

/**
 * Собирает книгу табеля по образцу, который компания ведёт вручную:
 * семь листов, сводки и отчёты — живые формулы, а не посчитанные числа,
 * поэтому дописанные вручную строки пересчитываются сами.
 *
 * Справочники и строки отчётов строятся из фактических данных выгрузки —
 * в исходном шаблоне они были захардкожены и расходились с табелем, из-за
 * чего SUMIFS ничего не находил.
 */
export function buildTimesheetWorkbook(
  rows: TimesheetExportRow[],
  { from, to }: TimesheetExportOptions
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Гильдия Комфорта";
  wb.created = new Date();

  const installers = [...new Set(rows.map((r) => r.installer))].sort((a, b) =>
    a.localeCompare(b, "ru")
  );
  const sites = [...new Set(rows.map((r) => r.site ?? NO_SITE))].sort((a, b) =>
    a.localeCompare(b, "ru")
  );

  // Диапазоны данных листа «Табель». Пустая выгрузка — всё равно валидный
  // диапазон в одну пустую строку, иначе формулы ссылались бы на $D$2:$D$1.
  const lastRow = Math.max(2, rows.length + 1);
  const T = {
    date: ref("Табель", `$A$2:$A$${lastRow}`),
    who: ref("Табель", `$B$2:$B$${lastRow}`),
    site: ref("Табель", `$C$2:$C$${lastRow}`),
    hours: ref("Табель", `$D$2:$D$${lastRow}`),
  };

  // ---------- 1. Справочники ----------
  const sp = wb.addWorksheet("Справочники");
  sp.columns = [{ width: 34 }, { width: 34 }];
  styleHeader(sp.addRow(["ФИО / Сотрудники", "Проекты / Объекты"]));
  for (let i = 0; i < Math.max(installers.length, sites.length); i++) {
    sp.addRow([installers[i] ?? null, sites[i] ?? null]).font = FONT;
  }
  const spLast = Math.max(2, installers.length + 1);

  // ---------- 2. Табель ----------
  const tab = wb.addWorksheet("Табель");
  tab.columns = [{ width: 12 }, { width: 24 }, { width: 28 }, { width: 9 }, { width: 40 }];
  styleHeader(tab.addRow(["Дата", "ФИО", "Проект/Объект", "Часы", "Примечание"]));
  for (const r of rows) {
    const row = tab.addRow([r.date, r.installer, r.site ?? NO_SITE, r.hours, r.note ?? null]);
    row.font = FONT;
    row.getCell(1).numFmt = "dd.mm.yyyy";
    row.getCell(4).numFmt = "0.0";
  }
  tab.views = [{ state: "frozen", ySplit: 1 }];
  tab.autoFilter = { from: { row: 1, column: 1 }, to: { row: lastRow, column: 5 } };

  // ---------- 3. Сводка Сотрудник×Проект ----------
  const pivot = wb.addWorksheet("Сводка Сотрудник×Проект");
  pivot.getColumn(1).width = 26;
  sites.forEach((_, i) => (pivot.getColumn(i + 2).width = 18));
  pivot.getColumn(sites.length + 2).width = 12;

  pivot.addRow(["Сводка: часы сотрудника на объекте (автоматическая)"]).font = TITLE_FONT;
  pivot.addRow([]);
  styleHeader(pivot.addRow(["Сотрудник \\ Проект", ...sites, "ИТОГО"]));

  const totalCol = sites.length + 2; // A + объекты + ИТОГО
  const lastSiteCol = sites.length + 1;
  const colLetter = (n: number) => pivot.getColumn(n).letter;

  installers.forEach((name, i) => {
    const r = 4 + i;
    const row = pivot.addRow([name]);
    sites.forEach((_, j) => {
      const c = colLetter(j + 2);
      row.getCell(j + 2).value = {
        formula: `SUMIFS(${T.hours},${T.who},$A${r},${T.site},${c}$3)`,
      };
      row.getCell(j + 2).numFmt = "0.0";
    });
    row.getCell(totalCol).value = {
      formula: `SUM(${colLetter(2)}${r}:${colLetter(lastSiteCol)}${r})`,
    };
    row.getCell(totalCol).numFmt = "0.0";
    row.font = FONT;
    row.getCell(totalCol).font = HEAD_FONT;
  });

  const pivotTotalRow = pivot.addRow(["ИТОГО"]);
  const firstDataRow = 4;
  const lastDataRow = Math.max(firstDataRow, 3 + installers.length);
  for (let c = 2; c <= totalCol; c++) {
    const L = colLetter(c);
    pivotTotalRow.getCell(c).value = {
      formula: `SUM(${L}${firstDataRow}:${L}${lastDataRow})`,
    };
    pivotTotalRow.getCell(c).numFmt = "0.0";
  }
  pivotTotalRow.font = HEAD_FONT;

  // ---------- 4. Сводка по месяцам ----------
  const monthly = wb.addWorksheet("Сводка по месяцам");
  monthly.getColumn(1).width = 24;
  monthly.getColumn(2).width = 28;
  for (let c = 3; c <= 15; c++) monthly.getColumn(c).width = 9;

  monthly.addRow(["Сводка по месяцам и объектам (автоматическая)"]).font = TITLE_FONT;
  const yearRow = monthly.addRow([null, "Год:", from.getUTCFullYear()]);
  yearRow.getCell(2).font = HEAD_FONT;
  yearRow.getCell(3).font = HEAD_FONT;

  // Границы месяцев: 13 дат, чтобы каждый месяц закрывался следующей.
  const bounds = monthly.addRow([null, null]);
  for (let m = 1; m <= 12; m++) {
    bounds.getCell(m + 2).value = { formula: `DATE($C$2,${m},1)` };
    bounds.getCell(m + 2).numFmt = "dd.mm.yyyy";
  }
  bounds.getCell(15).value = { formula: `DATE($C$2+1,1,1)` };
  bounds.getCell(15).numFmt = "dd.mm.yyyy";
  bounds.font = { ...FONT, color: { argb: "FF999999" } };

  styleHeader(monthly.addRow(["ФИО", "Объект", ...MONTHS, "ИТОГО"]));

  // Строки — только реально встречающиеся пары «монтажник + объект».
  const pairs = [...new Set(rows.map((r) => `${r.installer}\u0000${r.site ?? NO_SITE}`))]
    .map((k) => k.split("\u0000") as [string, string])
    .sort((a, b) => a[0].localeCompare(b[0], "ru") || a[1].localeCompare(b[1], "ru"));

  pairs.forEach(([who, site], i) => {
    const r = 5 + i;
    const row = monthly.addRow([who, site]);
    for (let m = 0; m < 12; m++) {
      const cFrom = monthly.getColumn(m + 3).letter;
      const cTo = monthly.getColumn(m + 4).letter;
      row.getCell(m + 3).value = {
        formula:
          `SUMIFS(${T.hours},${T.who},$A${r},${T.site},$B${r},` +
          `${T.date},">="&${cFrom}$3,${T.date},"<"&${cTo}$3)`,
      };
      row.getCell(m + 3).numFmt = "0.0";
    }
    row.getCell(15).value = { formula: `SUM(C${r}:N${r})` };
    row.getCell(15).numFmt = "0.0";
    row.font = FONT;
    row.getCell(15).font = HEAD_FONT;
  });

  // ---------- 5. Отчет по сотрудникам ----------
  const byPerson = wb.addWorksheet("Отчет по сотрудникам");
  byPerson.columns = [{ width: 26 }, { width: 20 }, { width: 14 }, { width: 20 }];
  byPerson.addRow(["Отчёт по сотрудникам (автоматический)"]).font = TITLE_FONT;
  byPerson.addRow([]);
  styleHeader(byPerson.addRow(["ФИО", "Общее кол-во часов", "Кол-во дней", "Среднее часов/день"]));

  installers.forEach((name, i) => {
    const r = 4 + i;
    const row = byPerson.addRow([name]);
    row.getCell(2).value = { formula: `SUMIFS(${T.hours},${T.who},A${r})` };
    row.getCell(3).value = { formula: `COUNTIFS(${T.who},A${r},${T.hours},">0")` };
    row.getCell(4).value = { formula: `IF(C${r}>0,B${r}/C${r},0)` };
    row.getCell(2).numFmt = "0.0";
    row.getCell(4).numFmt = "0.00";
    row.font = FONT;
  });

  // ---------- 6. Отчет по проектам ----------
  const bySite = wb.addWorksheet("Отчет по проектам");
  bySite.columns = [{ width: 30 }, { width: 16 }, { width: 16 }, { width: 14 }, { width: 22 }];
  bySite.addRow(["Отчёт по проектам (автоматический)"]).font = TITLE_FONT;
  bySite.addRow([]);
  styleHeader(
    bySite.addRow([
      "Проект/Объект",
      "Общее часы",
      "Кол-во записей",
      "Участников",
      "Среднее часов/запись",
    ])
  );

  const spList = ref("Справочники", `$A$2:$A$${spLast}`);
  sites.forEach((name, i) => {
    const r = 4 + i;
    const row = bySite.addRow([name]);
    row.getCell(2).value = { formula: `SUMIFS(${T.hours},${T.site},A${r})` };
    row.getCell(3).value = { formula: `COUNTIFS(${T.site},A${r},${T.hours},">0")` };
    // Участников — сколько монтажников из справочника имеют часы по объекту.
    // В исходном шаблоне здесь было деление, дававшее #DIV/0! во всех строках.
    row.getCell(4).value = {
      formula: `SUMPRODUCT(--(COUNTIFS(${T.who},${spList},${T.site},A${r})>0))`,
    };
    row.getCell(5).value = { formula: `IF(C${r}>0,B${r}/C${r},0)` };
    row.getCell(2).numFmt = "0.0";
    row.getCell(5).numFmt = "0.00";
    row.font = FONT;
  });

  // ---------- 7. Инструкция ----------
  const help = wb.addWorksheet("Инструкция");
  help.getColumn(1).width = 100;
  const lines: Array<[string, boolean]> = [
    ["Табель учёта рабочего времени — выгрузка из «Гильдии Комфорта»", true],
    ["", false],
    [`Период выгрузки: с ${iso(from)} по ${iso(to)}`, false],
    [`Записей: ${rows.length} · монтажников: ${installers.length} · объектов: ${sites.length}`, false],
    [`Выгружено: ${new Date().toLocaleString("ru-RU")}`, false],
    ["", false],
    ["Что в книге", true],
    ["• «Табель» — сами записи. Это единственный лист с данными.", false],
    ["• Остальные листы считаются формулами от «Табеля» и обновляются сами.", false],
    ["• «Справочники» — списки монтажников и объектов, встретившихся в выгрузке.", false],
    ["", false],
    ["Можно дописывать строки вручную", true],
    ["1. Добавляйте строки в конец листа «Табель» в том же формате.", false],
    ["2. Сводки и отчёты пересчитаются автоматически — формулы живые.", false],
    ["3. Если добавили нового человека или объект, впишите их и в «Справочники»:", false],
    ["   от этого списка считается столбец «Участников» в отчёте по проектам.", false],
    ["", false],
    ["Импорт в Google Sheets", true],
    ["Файл → Импорт → Загрузка → выберите этот файл. Все листы и формулы перенесутся.", false],
    ["", false],
    ["Важно про часы", true],
    ["Приложение принимает только часы больше нуля и не больше 24 за запись.", false],
    ["Отрицательных значений в выгрузке не бывает — если нужен учёт штрафов", false],
    ["или прогулов, это отдельная механика, которой в системе пока нет.", false],
  ];
  for (const [text, bold] of lines) {
    const row = help.addRow([text]);
    row.font = bold ? HEAD_FONT : FONT;
  }

  return wb;
}

/** Имя файла выгрузки: tabel-2026-07-01_2026-07-31.xlsx */
export function timesheetFileName(from: Date, to: Date) {
  return `tabel-${iso(from)}_${iso(to)}.xlsx`;
}
