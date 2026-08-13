/**
 * Разбор рабочей книги по объекту: КП, дерево задач и граф блоков.
 *
 * Книга ведётся в Excel и остаётся источником правды при составлении объекта:
 * заводить полторы сотни строк руками в приложении никто не станет. Парсер
 * читает три листа и отдаёт структуру, из которой создаются задачи и блоки.
 *
 * Ожидаемые листы: «КП», «Задачи монтажа», «Зависимости».
 */

import ExcelJS from "exceljs";

export type KpPosition = {
  /** Номер позиции КП: «1», «9». */
  code: string;
  name: string;
  unit: string | null;
  quantity: number | null;
  unitPrice: number | null;
  /** Сумма позиции. null у строк «включено». */
  amount: number | null;
  note: string | null;
};

export type ParsedTask = {
  code: string;
  parentCode: string | null;
  title: string;
  system: string | null;
  unit: string | null;
  volume: number | null;
  /** Доля строки в готовности объекта по листу, 0..1. Только у корневых. */
  sheetShare: number | null;
  /** Вес среди соседей в процентах — для этапов внутри задачи. */
  weight: number | null;
  /** Сумма по КП, приходящаяся на строку. Только у корневых. */
  amount: number | null;
  unitPrice: number | null;
  blockCode: string | null;
  isSection: boolean;
  isFlexible: boolean;
  note: string | null;
  sortOrder: number;
};

export type ParsedBlock = {
  code: string;
  name: string;
  kpPositions: string | null;
  threshold: number;
  predecessorCodes: string[];
  customerNote: string | null;
  sortOrder: number;
};

export type ParsedWorkbook = {
  positions: KpPosition[];
  total: number;
  tasks: ParsedTask[];
  blocks: ParsedBlock[];
  /** Замечания разбора — показываются администратору перед импортом. */
  warnings: string[];
};

const TASK_CODE = /^\d+(\.\d+)*$/;
// Без \b: граница слова в JS считается по латинице, после кириллической «Л»
// она не срабатывает и заголовки разделов не распознаются.
const SECTION_PREFIX = /^РАЗДЕЛ[\s.:]/i;

function cellText(value: ExcelJS.CellValue): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    // Формула: {formula, result}. Богатый текст: {richText: [...]}.
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("richText" in value) {
      const rich = value.richText as { text: string }[];
      return rich.map((r) => r.text).join("").trim() || null;
    }
    if ("text" in value) return String((value as { text: unknown }).text).trim() || null;
  }
  return null;
}

function cellNumber(value: ExcelJS.CellValue): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value && typeof value === "object" && "result" in value) {
    return cellNumber((value as { result: ExcelJS.CellValue }).result);
  }
  const text = cellText(value);
  if (!text) return null;
  // «18 900», «21,», «1 500 ₽» — пробелы-разделители и запятая как точка.
  const cleaned = text.replace(/[\s ₽]/g, "").replace(",", ".").replace(/\.$/, "");
  if (!cleaned || !/^-?\d*\.?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Родитель по номеру: «2.1.1» → «2.1», «3» → null. */
function parentOf(code: string): string | null {
  const dot = code.lastIndexOf(".");
  return dot < 0 ? null : code.slice(0, dot);
}

function parseKpSheet(sheet: ExcelJS.Worksheet, warnings: string[]) {
  const positions: KpPosition[] = [];
  let total = 0;

  sheet.eachRow((row) => {
    const code = cellText(row.getCell(1).value);
    const name = cellText(row.getCell(2).value);

    if (code && /^ИТОГО/i.test(code)) return;
    if (!code && name && /^ИТОГО/i.test(name)) {
      total = cellNumber(row.getCell(6).value) ?? 0;
      return;
    }
    if (!code || !/^\d+$/.test(code) || !name) return;

    positions.push({
      code,
      name,
      unit: cellText(row.getCell(3).value),
      quantity: cellNumber(row.getCell(4).value),
      unitPrice: cellNumber(row.getCell(5).value),
      amount: cellNumber(row.getCell(6).value),
      note: cellText(row.getCell(7).value),
    });
  });

  if (total <= 0) {
    total = positions.reduce((sum, p) => sum + (p.amount ?? 0), 0);
    if (total > 0) warnings.push("В листе «КП» не найдено ИТОГО — сумма посчитана по позициям.");
  }

  return { positions, total };
}

function parseTaskSheet(
  sheet: ExcelJS.Worksheet,
  positions: KpPosition[],
  total: number,
  warnings: string[]
): ParsedTask[] {
  const byCode = new Map(positions.map((p) => [p.code, p]));
  const tasks: ParsedTask[] = [];
  let currentSection: string | null = null;
  let sectionIndex = 0;
  let order = 0;

  sheet.eachRow((row) => {
    const first = cellText(row.getCell(1).value);
    const title = cellText(row.getCell(2).value);
    if (!first) return;

    if (SECTION_PREFIX.test(first)) {
      sectionIndex += 1;
      currentSection = `Р${sectionIndex}`;
      tasks.push({
        code: currentSection,
        parentCode: null,
        title: first,
        system: null,
        unit: null,
        volume: null,
        sheetShare: null,
        weight: null,
        amount: null,
        unitPrice: null,
        blockCode: null,
        isSection: true,
        isFlexible: false,
        note: null,
        sortOrder: order++,
      });
      return;
    }

    if (!TASK_CODE.test(first) || !title) return;

    const parentCode = parentOf(first) ?? currentSection;
    const isRoot = parentOf(first) === null;
    const note = cellText(row.getCell(13).value);

    // Вес в листе — доля от всего объекта (доля стоимости позиции). У строк
    // ниже первого уровня он не проставлен: там доля берётся из объёма
    // или из явных процентов этапа.
    const sheetShare = isRoot ? cellNumber(row.getCell(6).value) : null;
    const rawWeight = isRoot ? null : cellNumber(row.getCell(6).value);

    // Сумма позиции: по КП, если номер совпал. Позиция 8 в листе задач имеет
    // вес, прибитый вручную, потому что в неё влита позиция 9 (термоконтакты)
    // — восстанавливаем сумму обратно из доли.
    const kp = isRoot ? byCode.get(first) : undefined;
    let amount: number | null = null;
    if (isRoot) {
      const fromShare = sheetShare !== null && total > 0 ? sheetShare * total : null;
      if (fromShare !== null) {
        amount = Math.round(fromShare * 100) / 100;
        if (kp?.amount != null && Math.abs(amount - kp.amount) > 1) {
          warnings.push(
            `Позиция ${first}: в листе задач вес соответствует ${amount.toLocaleString("ru")} ₽, ` +
              `в КП сумма ${kp.amount.toLocaleString("ru")} ₽ — взят вес из листа задач.`
          );
        }
      } else if (kp?.amount != null) {
        amount = kp.amount;
      }
    }

    tasks.push({
      code: first,
      parentCode,
      title,
      system: cellText(row.getCell(3).value),
      unit: cellText(row.getCell(4).value),
      volume: cellNumber(row.getCell(5).value),
      sheetShare,
      weight: rawWeight === null ? null : rawWeight * 100,
      amount,
      unitPrice: kp?.unitPrice ?? null,
      blockCode: cellText(row.getCell(14).value),
      isSection: false,
      // Гибкая: подзадачи заводит монтажник — в заготовках так и написано.
      isFlexible: /заполняется монтажником/i.test(title) || /гибк/i.test(note ?? ""),
      note,
      sortOrder: order++,
    });
  });

  // Раздел весит столько, сколько его содержимое: иначе доли внутри раздела
  // нормируются сами по себе и вклад раздела в объект теряется.
  const sumByParent = new Map<string, number>();
  for (const task of tasks) {
    if (task.parentCode === null || task.amount === null) continue;
    sumByParent.set(task.parentCode, (sumByParent.get(task.parentCode) ?? 0) + task.amount);
  }
  for (const task of tasks) {
    if (task.isSection) task.amount = sumByParent.get(task.code) ?? 0;
  }

  // Заготовки гибких подзадач без объёма — пустые строки «Подзадача 1.1»,
  // которые монтажник заполняет сам. В базе они не нужны: он создаст их сам.
  const placeholders = tasks.filter((t) => /^Подзадача\s/i.test(t.title) && !t.volume);
  if (placeholders.length > 0) {
    warnings.push(
      `Пропущено ${placeholders.length} пустых заготовок подзадач — монтажник заводит их сам.`
    );
  }
  const placeholderCodes = new Set(placeholders.map((t) => t.code));

  // Родитель заготовок — гибкая задача, даже если в примечании этого нет.
  for (const task of tasks) {
    if (!task.isFlexible && [...placeholderCodes].some((c) => parentOf(c) === task.code)) {
      task.isFlexible = true;
    }
  }

  return tasks.filter((t) => !placeholderCodes.has(t.code));
}

function parseDependencySheet(sheet: ExcelJS.Worksheet): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  let order = 0;

  sheet.eachRow((row) => {
    const code = cellText(row.getCell(1).value);
    const name = cellText(row.getCell(2).value);
    if (!code || !/^Б\d+$/i.test(code) || !name) return;

    const predecessorsText = cellText(row.getCell(4).value);
    const predecessorCodes =
      !predecessorsText || predecessorsText === "—"
        ? []
        : predecessorsText
            .split(/[,;]/)
            .map((s) => s.trim())
            .filter((s) => /^Б\d+$/i.test(s));

    const threshold = cellNumber(row.getCell(7).value);

    blocks.push({
      code,
      name,
      kpPositions: cellText(row.getCell(3).value),
      threshold: threshold !== null && threshold > 0 ? Math.min(threshold, 1) : 1,
      predecessorCodes,
      customerNote: cellText(row.getCell(10).value),
      sortOrder: order++,
    });
  });

  return blocks;
}

/** Разбирает книгу целиком. Бросает, если нет обязательных листов. */
export async function parseKpWorkbook(data: ArrayBuffer | Buffer): Promise<ParsedWorkbook> {
  const workbook = new ExcelJS.Workbook();
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(new Uint8Array(data));
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const warnings: string[] = [];
  const kpSheet = workbook.getWorksheet("КП");
  const taskSheet = workbook.getWorksheet("Задачи монтажа");
  const depSheet = workbook.getWorksheet("Зависимости");

  if (!kpSheet) throw new Error("В книге нет листа «КП»");
  if (!taskSheet) throw new Error("В книге нет листа «Задачи монтажа»");

  const { positions, total } = parseKpSheet(kpSheet, warnings);
  if (positions.length === 0) throw new Error("В листе «КП» не найдено ни одной позиции");

  const tasks = parseTaskSheet(taskSheet, positions, total, warnings);
  if (tasks.length === 0) throw new Error("В листе «Задачи монтажа» не найдено ни одной задачи");

  const blocks = depSheet ? parseDependencySheet(depSheet) : [];
  if (!depSheet) warnings.push("Листа «Зависимости» нет — блоки работ не созданы.");

  // Задача ссылается на блок, которого нет в графе: связь молча потерялась бы.
  const blockCodes = new Set(blocks.map((b) => b.code));
  const missing = new Set(
    tasks.map((t) => t.blockCode).filter((c): c is string => !!c && !blockCodes.has(c))
  );
  if (missing.size > 0) {
    warnings.push(`Задачи ссылаются на блоки, которых нет в «Зависимостях»: ${[...missing].join(", ")}`);
  }

  return { positions, total, tasks, blocks, warnings };
}
