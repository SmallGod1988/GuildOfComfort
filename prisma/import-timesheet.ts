/**
 * Импорт табеля из TSV в базу.
 *
 * Формат строки: дата TAB фамилия TAB объект TAB часы TAB примечание
 * Часы принимаются с запятой («5,5») — как в таблице компании.
 *
 * Запуск:
 *   npx tsx prisma/import-timesheet.ts prisma/data/timesheet-2026-07-08.tsv
 *
 * Импорт идемпотентен: идентификатор записи считается из её содержимого и
 * порядкового номера повтора, поэтому повторный запуск не задваивает часы,
 * а настоящие дубли в исходной таблице сохраняются как две записи.
 *
 * Что скрипт НЕ делает: не чинит данные. Нулевые и отрицательные часы
 * переносятся как есть — они несут смысл (прогул, штраф), и молча их
 * выбрасывать нельзя. В конце печатается список того, что приложение
 * потом не даст отредактировать через форму.
 */

import "dotenv/config";
import { readFileSync, statSync } from "fs";
import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

type Row = {
  line: number;
  date: string;
  person: string;
  site: string;
  hours: number;
  note: string | null;
};

/** Латиница для адреса почты: людей в таблице зовут по фамилии. */
const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

function slug(name: string): string {
  return name
    .toLowerCase()
    .split("")
    .map((ch) => TRANSLIT[ch] ?? (/[a-z0-9]/.test(ch) ? ch : ""))
    .join("");
}

function parseHours(raw: string): number | null {
  const cleaned = raw.trim().replace(",", ".");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Проверяет, что по пути лежит непустой файл.
 *
 * Отдельная проверка нужна из-за Docker: при `-v /host/file:/app/file`, если
 * файла на хосте нет, Docker создаёт вместо него пустой КАТАЛОГ и монтирует
 * его. Дальше readFileSync падает с EISDIR, и по стектрейсу непонятно, что
 * на самом деле забыли положить файл.
 */
function assertReadableFile(path: string): void {
  let stat;
  try {
    stat = statSync(path);
  } catch {
    console.error(`Файл не найден: ${path}`);
    console.error("Положите табель по этому пути и запустите снова.");
    process.exit(1);
  }

  if (stat.isDirectory()) {
    console.error(`По пути ${path} лежит каталог, а не файл.`);
    console.error("");
    console.error("Так бывает, когда файл монтируют в контейнер через -v, а на");
    console.error("хосте его нет: Docker создаёт вместо него пустой каталог.");
    console.error("Проверьте, что файл существует и не пуст, затем повторите.");
    process.exit(1);
  }

  if (stat.size === 0) {
    console.error(`Файл пуст: ${path}`);
    process.exit(1);
  }
}

/**
 * Таблица соответствий: как имя из табеля называется в приложении.
 *
 * Нужна, потому что в табеле люди записаны по фамилии («Ценнер»), а в
 * приложении заведены полностью («Виктор Ценнер»); то же с объектами
 * («НПО ПОИСК 208 Аов» против «АовПоиск208»). Без соответствия импорт
 * создал бы рядом второго человека и второй объект, и часы разъехались бы
 * по двум карточкам.
 *
 * Формат строки: вид TAB какВТабеле TAB какВПриложении
 * где вид — «человек» или «объект». Пустые строки и строки с # пропускаются.
 */
type NameMap = { person: Map<string, string>; site: Map<string, string> };

function parseMap(path: string | null): NameMap {
  const map: NameMap = { person: new Map(), site: new Map() };
  if (!path) return map;

  assertReadableFile(path);
  readFileSync(path, "utf8")
    .split(/\r?\n/)
    .forEach((raw, i) => {
      const line = raw.trim();
      if (!line || line.startsWith("#")) return;

      const [kind, from, to] = raw.split("\t").map((s) => s?.trim() ?? "");
      if (!from || !to) {
        console.error(`Соответствия, строка ${i + 1}: нужно три поля через табуляцию.`);
        process.exit(1);
      }
      if (kind === "человек" || kind === "person") map.person.set(from, to);
      else if (kind === "объект" || kind === "site") map.site.set(from, to);
      else {
        console.error(`Соответствия, строка ${i + 1}: вид «${kind}» — ожидается «человек» или «объект».`);
        process.exit(1);
      }
    });

  return map;
}

function parseFile(path: string): { rows: Row[]; skipped: string[] } {
  assertReadableFile(path);

  const rows: Row[] = [];
  const skipped: string[] = [];

  readFileSync(path, "utf8")
    .split(/\r?\n/)
    .forEach((raw, i) => {
      const line = i + 1;
      if (!raw.trim()) return;

      const cells = raw.split("\t");
      const [date, person, site, hoursRaw, note] = cells;

      // Заголовок таблицы, если его скопировали вместе с данными.
      if (date?.trim() === "Дата") return;

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date?.trim() ?? "")) {
        skipped.push(`строка ${line}: не разобрана дата «${date ?? ""}»`);
        return;
      }
      const hours = parseHours(hoursRaw ?? "");
      if (hours === null) {
        skipped.push(`строка ${line}: не разобраны часы «${hoursRaw ?? ""}»`);
        return;
      }
      if (!person?.trim() || !site?.trim()) {
        skipped.push(`строка ${line}: пустая фамилия или объект`);
        return;
      }

      rows.push({
        line,
        date: date.trim(),
        person: person.trim(),
        // В таблице у «НПО ПОИСК 208 Аов » висит пробел на конце — иначе
        // это был бы отдельный объект.
        site: site.trim(),
        hours,
        note: note?.trim() ? note.trim() : null,
      });
    });

  return { rows, skipped };
}

/**
 * Устойчивый идентификатор записи. Считается из содержимого, поэтому
 * повторный запуск обновляет ту же строку. Порядковый номер повтора
 * различает одинаковые строки в исходной таблице — настоящий дубль
 * останется двумя записями, а не схлопнется в одну.
 */
function entryId(row: Row, occurrence: number): string {
  const key = [row.date, row.person, row.site, row.hours, row.note ?? "", occurrence].join("|");
  return "ts" + createHash("sha1").update(key).digest("hex").slice(0, 23);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const mapIndex = args.indexOf("--map");
  const mapPath = mapIndex >= 0 ? args[mapIndex + 1] : null;
  const path =
    args.find((a, i) => !a.startsWith("--") && i !== mapIndex + 1) ??
    "prisma/data/timesheet-2026-07-08.tsv";

  const { rows, skipped } = parseFile(path);

  if (rows.length === 0) {
    console.error(`В файле ${path} не найдено ни одной строки табеля.`);
    process.exit(1);
  }

  const nameMap = parseMap(mapPath);

  // ── люди ──
  const people = [...new Set(rows.map((r) => r.person))].sort();
  const created: string[] = [];
  const matched: string[] = [];
  const hints: string[] = [];
  const userIdByName = new Map<string, string>();

  const allInstallers = await prisma.user.findMany({
    where: { role: "INSTALLER" },
    select: { id: true, fullName: true, email: true },
  });

  for (const person of people) {
    const target = nameMap.person.get(person) ?? person;

    const byName = allInstallers.find((u) => u.fullName === target);
    if (byName) {
      userIdByName.set(person, byName.id);
      matched.push(`${person}${target !== person ? ` → ${target}` : ""}`);
      continue;
    }

    // Соответствие задано, но такого человека в приложении нет — это опечатка
    // в таблице соответствий, а не повод завести ещё одного.
    if (nameMap.person.has(person)) {
      console.error(`\nВ приложении нет монтажника «${target}» (соответствие для «${person}»).`);
      console.error("Заведённые монтажники:");
      allInstallers.forEach((u) => console.error(`  ${u.fullName}`));
      process.exit(1);
    }

    const email = `${slug(person)}@guild.local`;
    const byEmail = allInstallers.find((u) => u.email === email);
    if (byEmail) {
      userIdByName.set(person, byEmail.id);
      matched.push(person);
      continue;
    }

    // Фамилия из табеля встречается внутри уже заведённого имени — почти
    // наверняка это тот же человек, просто записан полностью.
    const looksLike = allInstallers.filter((u) =>
      u.fullName.toLowerCase().includes(person.toLowerCase())
    );
    if (looksLike.length > 0) {
      hints.push(
        `человек\t${person}\t${looksLike[0].fullName}` +
          (looksLike.length > 1 ? `   (ещё похожие: ${looksLike.slice(1).map((u) => u.fullName).join(", ")})` : "")
      );
    }

    if (dryRun) {
      userIdByName.set(person, "—");
      created.push(`${person} → ${email}`);
      continue;
    }

    // Пароль случайный: эти учётные записи заведены под исторические часы,
    // входить под ними пока некому. Понадобится вход — сброс по почте.
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(randomBytes(18).toString("base64url"), 10),
        role: "INSTALLER",
        fullName: person,
      },
    });
    userIdByName.set(person, user.id);
    created.push(`${person} → ${email}`);
  }

  // ── объекты ──
  const siteNames = [...new Set(rows.map((r) => r.site))].sort();
  const siteIdByName = new Map<string, string>();
  const newSites: string[] = [];

  const matchedSites: string[] = [];
  const allSites = await prisma.site.findMany({ select: { id: true, name: true } });

  /**
   * Разбивает название на слова, чтобы «НПО ПОИСК 208 Аов» и «АовПоиск208»
   * узнавались как один объект. Границы слов: пробелы, смена регистра
   * и переход между буквами и цифрами.
   */
  const tokens = (s: string): Set<string> =>
    new Set(
      s
        .replace(/([а-яa-z])([А-ЯA-Z])/g, "$1 $2")
        .replace(/([^\d\s])(\d)/g, "$1 $2")
        .replace(/(\d)([^\d\s])/g, "$1 $2")
        .toLowerCase()
        .split(/[^a-zа-я0-9]+/i)
        .filter(Boolean)
    );

  /** Одно название целиком «влезает» в другое по словам. */
  const looksSame = (a: string, b: string): boolean => {
    const ta = tokens(a);
    const tb = tokens(b);
    const [small, big] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
    if (small.size === 0) return false;
    return [...small].every((t) => big.has(t));
  };

  for (const name of siteNames) {
    const target = nameMap.site.get(name) ?? name;

    const existing = allSites.find((s) => s.name === target);
    if (existing) {
      siteIdByName.set(name, existing.id);
      matchedSites.push(`${name}${target !== name ? ` → ${target}` : ""}`);
      continue;
    }

    if (nameMap.site.has(name)) {
      console.error(`\nВ приложении нет объекта «${target}» (соответствие для «${name}»).`);
      console.error("Заведённые объекты:");
      allSites.forEach((s) => console.error(`  ${s.name}`));
      process.exit(1);
    }

    // Совпало бы, если убрать пробелы и регистр — почти наверняка тот же
    // объект, просто назван иначе.
    const looksLike = allSites.filter((s) => looksSame(s.name, name));
    if (looksLike.length > 0) {
      hints.push(`объект\t${name}\t${looksLike[0].name}`);
    }

    if (dryRun) {
      siteIdByName.set(name, "—");
      newSites.push(name);
      continue;
    }

    const site = await prisma.site.create({
      // Адреса в табеле нет — заполняется позже вручную. Склад заводится
      // сразу, как и при обычном создании объекта.
      data: { name, address: "—", warehouse: { create: {} } },
    });
    siteIdByName.set(name, site.id);
    newSites.push(name);
  }

  // ── записи ──
  const seen = new Map<string, number>();
  let inserted = 0;
  let updated = 0;

  for (const row of rows) {
    const base = [row.date, row.person, row.site, row.hours, row.note ?? ""].join("|");
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);

    const id = entryId(row, occurrence);
    const data = {
      installerId: userIdByName.get(row.person)!,
      siteId: siteIdByName.get(row.site)!,
      date: new Date(`${row.date}T00:00:00Z`),
      hours: row.hours,
      note: row.note,
    };

    const existing = await prisma.timesheetEntry.findUnique({ where: { id } });
    if (dryRun) {
      if (existing) updated++;
      else inserted++;
      continue;
    }
    if (existing) {
      await prisma.timesheetEntry.update({ where: { id }, data });
      updated++;
    } else {
      await prisma.timesheetEntry.create({ data: { id, ...data } });
      inserted++;
    }
  }

  // ── отчёт ──
  console.log(`\nФайл: ${path}`);
  if (mapPath) console.log(`Соответствия: ${mapPath}`);
  if (dryRun) console.log("РЕЖИМ ПРЕДПРОСМОТРА — в базу ничего не записано");
  console.log(`Разобрано строк: ${rows.length}`);
  console.log(
    dryRun
      ? `Записей будет добавлено: ${inserted}, обновлено: ${updated}`
      : `Записей добавлено: ${inserted}, обновлено: ${updated}`
  );

  console.log(`\nЛюди (${people.length}):`);
  matched.forEach((m) => console.log(`  = ${m}`));
  created.forEach((c) => console.log(`  ${dryRun ? "+ будет заведён" : "+ заведён"}: ${c}`));

  console.log(`\nОбъекты (${siteNames.length}):`);
  matchedSites.forEach((m) => console.log(`  = ${m}`));
  newSites.forEach((n) => console.log(`  ${dryRun ? "+ будет заведён" : "+ заведён"}: ${n}`));

  // Самое важное в предпросмотре: имя из табеля похоже на уже заведённое,
  // но не совпадает. Без соответствия появится двойник.
  if (hints.length) {
    console.log("\n─── похоже на двойников ───");
    console.log("Эти имена не совпали с заведёнными, но выглядят как те же.");
    console.log("Без таблицы соответствий появятся вторые карточки, и часы");
    console.log("разъедутся. Сохраните строки ниже в файл и передайте его");
    console.log("параметром --map:\n");
    hints.forEach((h) => console.log(h));
  }

  if (skipped.length) {
    console.log(`\nПропущено строк: ${skipped.length}`);
    skipped.forEach((s) => console.log(`  ! ${s}`));
  }

  // ── что приложение не примет обратно ──
  const nonPositive = rows.filter((r) => r.hours <= 0);
  const dupes = [...seen.entries()].filter(([, n]) => n > 1);

  if (nonPositive.length || dupes.length) {
    console.log("\n─── требует внимания ───");
  }
  if (nonPositive.length) {
    console.log(`\nЧасы ≤ 0: ${nonPositive.length} записей.`);
    console.log("Форма приложения принимает только часы больше нуля, поэтому");
    console.log("отредактировать такую строку через интерфейс не выйдет.");
    for (const r of nonPositive) {
      console.log(`  ${r.date}  ${r.person.padEnd(10)} ${String(r.hours).padStart(5)} ч  ${r.site}${r.note ? "  — " + r.note : ""}`);
    }
  }
  if (dupes.length) {
    console.log(`\nОдинаковые строки в исходной таблице: ${dupes.length}.`);
    console.log("Перенесены как есть — часы посчитаются дважды. Проверьте,");
    console.log("настоящая это вторая запись или задвоение при копировании.");
    for (const [key, n] of dupes) {
      const [date, person, site, hours] = key.split("|");
      console.log(`  ${date}  ${person.padEnd(10)} ${hours.padStart(5)} ч  ${site}  ×${n}`);
    }
  }

  // ── сводка часов ──
  const byPerson = new Map<string, number>();
  const bySite = new Map<string, number>();
  for (const r of rows) {
    byPerson.set(r.person, (byPerson.get(r.person) ?? 0) + r.hours);
    bySite.set(r.site, (bySite.get(r.site) ?? 0) + r.hours);
  }
  const total = rows.reduce((s, r) => s + r.hours, 0);

  console.log("\n─── часы по людям ───");
  [...byPerson.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([p, h]) => console.log(`  ${p.padEnd(12)} ${h.toFixed(1).padStart(7)}`));
  console.log("\n─── часы по объектам ───");
  [...bySite.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([s, h]) => console.log(`  ${s.padEnd(22)} ${h.toFixed(1).padStart(7)}`));
  console.log(`\n  ИТОГО ${total.toFixed(1)} ч`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
