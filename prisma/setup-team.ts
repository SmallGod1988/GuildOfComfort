/**
 * Заводит монтажников и объекты и печатает логины с паролями для раздачи.
 *
 * В приложении администратор не создаёт пользователей — они регистрируются
 * сами. Когда нужно выдать людям готовые доступы, это делается отсюда.
 *
 * Запуск:
 *   npx tsx prisma/setup-team.ts prisma/data/team.tsv
 *   npx tsx prisma/setup-team.ts prisma/data/team.tsv --dry-run
 *
 * Формат файла — строка на человека или объект, поля через табуляцию:
 *   монтажник<TAB>Виктор Ценнер<TAB>cenner@company.ru
 *   объект<TAB>АовПоиск208<TAB>СПб, Славянка
 *
 * Адрес объекта можно не указывать — подставится прочерк.
 *
 * Повторный запуск безопасен: у тех, кто уже заведён, пароль НЕ меняется —
 * иначе розданные доступы перестали бы работать. Такие строки помечаются
 * «уже был», и пароль для них не печатается: его знает только владелец.
 */

import "dotenv/config";
import { readFileSync, statSync } from "fs";
import { randomInt } from "crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

type Person = { fullName: string; email: string };
type Place = { name: string; address: string };

/**
 * Пароль для передачи на словах и на бумаге: без похожих друг на друга
 * символов (0 и O, 1 и l, I), чтобы не диктовать «эль маленькая».
 */
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

function makePassword(length = 10): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

function assertReadableFile(path: string): void {
  let stat;
  try {
    stat = statSync(path);
  } catch {
    console.error(`Файл не найден: ${path}`);
    process.exit(1);
  }
  if (stat.isDirectory()) {
    console.error(`По пути ${path} лежит каталог, а не файл.`);
    process.exit(1);
  }
  if (stat.size === 0) {
    console.error(`Файл пуст: ${path}`);
    process.exit(1);
  }
}

function parseFile(path: string): { people: Person[]; places: Place[] } {
  assertReadableFile(path);
  const people: Person[] = [];
  const places: Place[] = [];

  readFileSync(path, "utf8")
    .split(/\r?\n/)
    .forEach((raw, i) => {
      const line = raw.trim();
      if (!line || line.startsWith("#")) return;

      const [kind, a, b] = raw.split("\t").map((s) => s?.trim() ?? "");
      const at = `строка ${i + 1}`;

      if (kind === "монтажник") {
        if (!a || !b) {
          console.error(`${at}: нужно «монтажник TAB ФИО TAB почта».`);
          process.exit(1);
        }
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b)) {
          console.error(`${at}: «${b}» не похоже на адрес почты.`);
          process.exit(1);
        }
        people.push({ fullName: a, email: b.toLowerCase() });
      } else if (kind === "объект") {
        if (!a) {
          console.error(`${at}: у объекта не указано название.`);
          process.exit(1);
        }
        places.push({ name: a, address: b || "—" });
      } else {
        console.error(`${at}: вид «${kind}» — ожидается «монтажник» или «объект».`);
        process.exit(1);
      }
    });

  return { people, places };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const path = args.find((a) => !a.startsWith("--")) ?? "prisma/data/team.tsv";

  const { people, places } = parseFile(path);
  if (people.length === 0 && places.length === 0) {
    console.error("В файле нет ни монтажников, ни объектов.");
    process.exit(1);
  }

  const handout: { fullName: string; email: string; password: string }[] = [];
  const kept: string[] = [];

  for (const person of people) {
    const existing = await prisma.user.findUnique({ where: { email: person.email } });
    if (existing) {
      kept.push(`${existing.fullName} · ${existing.email}`);
      continue;
    }

    // Одно имя может быть заведено с другой почтой — тогда это второй
    // человек с тем же именем, и стоит убедиться, что так и задумано.
    const sameName = await prisma.user.findFirst({ where: { fullName: person.fullName } });
    if (sameName) {
      console.log(
        `  ! «${person.fullName}» уже есть с почтой ${sameName.email}; будет заведён ещё один с ${person.email}`
      );
    }

    const password = makePassword();
    if (!dryRun) {
      await prisma.user.create({
        data: {
          email: person.email,
          passwordHash: await bcrypt.hash(password, 10),
          role: "INSTALLER",
          fullName: person.fullName,
        },
      });
    }
    handout.push({ ...person, password });
  }

  const newPlaces: string[] = [];
  const keptPlaces: string[] = [];

  for (const place of places) {
    const existing = await prisma.site.findFirst({ where: { name: place.name } });
    if (existing) {
      keptPlaces.push(place.name);
      continue;
    }
    if (!dryRun) {
      // Склад заводится вместе с объектом, как и при создании через интерфейс:
      // без него монтажник не сможет завершить задачу.
      await prisma.site.create({
        data: { name: place.name, address: place.address, warehouse: { create: {} } },
      });
    }
    newPlaces.push(place.name);
  }

  // ── отчёт ──
  if (dryRun) console.log("\nРЕЖИМ ПРЕДПРОСМОТРА — в базу ничего не записано\n");

  if (handout.length) {
    console.log(dryRun ? "Будут заведены:" : "Заведены — раздайте эти доступы:");
    console.log("");
    const w = Math.max(...handout.map((h) => h.fullName.length), 3);
    const e = Math.max(...handout.map((h) => h.email.length), 5);
    console.log(`  ${"ФИО".padEnd(w)}  ${"Логин".padEnd(e)}  Пароль`);
    console.log(`  ${"─".repeat(w)}  ${"─".repeat(e)}  ${"─".repeat(10)}`);
    for (const h of handout) {
      console.log(`  ${h.fullName.padEnd(w)}  ${h.email.padEnd(e)}  ${h.password}`);
    }
    console.log("");
    console.log("  Пароли показываются ОДИН раз — в базе лежит только их хеш.");
    console.log("  Потеряются — заводите заново или сбрасывайте по почте.");
  }

  if (kept.length) {
    console.log(`\nУже были заведены (пароль не менялся):`);
    kept.forEach((k) => console.log(`  = ${k}`));
  }

  if (newPlaces.length) {
    console.log(`\nОбъекты ${dryRun ? "будут заведены" : "заведены"}:`);
    newPlaces.forEach((n) => console.log(`  + ${n}`));
  }
  if (keptPlaces.length) {
    console.log(`\nОбъекты уже были:`);
    keptPlaces.forEach((n) => console.log(`  = ${n}`));
  }

  console.log("");
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
