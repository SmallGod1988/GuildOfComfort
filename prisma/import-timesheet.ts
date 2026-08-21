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
import { readFileSync } from "fs";
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

function parseFile(path: string): { rows: Row[]; skipped: string[] } {
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
  const path = process.argv[2] ?? "prisma/data/timesheet-2026-07-08.tsv";
  const { rows, skipped } = parseFile(path);

  if (rows.length === 0) {
    console.error(`В файле ${path} не найдено ни одной строки табеля.`);
    process.exit(1);
  }

  // ── люди ──
  const people = [...new Set(rows.map((r) => r.person))].sort();
  const created: string[] = [];
  const userIdByName = new Map<string, string>();

  for (const person of people) {
    const email = `${slug(person)}@guild.local`;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      userIdByName.set(person, existing.id);
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

  for (const name of siteNames) {
    const existing = await prisma.site.findFirst({ where: { name } });
    if (existing) {
      siteIdByName.set(name, existing.id);
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
  console.log(`Разобрано строк: ${rows.length}`);
  console.log(`Записей добавлено: ${inserted}, обновлено: ${updated}`);

  console.log(`\nЛюди (${people.length}):`);
  if (created.length) created.forEach((c) => console.log(`  + ${c}`));
  else console.log("  все уже были в базе");

  console.log(`\nОбъекты (${siteNames.length}):`);
  siteNames.forEach((n) =>
    console.log(`  ${newSites.includes(n) ? "+" : " "} ${n}`)
  );

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
