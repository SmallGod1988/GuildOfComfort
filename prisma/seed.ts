import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@guildofcomfort.local";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 10),
      role: "ADMIN",
      fullName: "Администратор",
    },
  });
  console.log(`Admin: ${admin.email} (пароль по умолчанию: ${adminPassword}, смените после первого входа)`);

  const materials: Array<{ name: string; unit: string }> = [
    { name: "Саморез 3.5x25", unit: "шт" },
    { name: "Саморез 4x40", unit: "шт" },
    { name: "Гайка М8", unit: "шт" },
    { name: "Болт М8x40", unit: "шт" },
    { name: "Дюбель 6x40", unit: "шт" },
    { name: "Кабель ВВГнг 3x2.5", unit: "м" },
    { name: "Гофра ПВХ 20мм", unit: "м" },
    { name: "Воздуховод оцинкованный d125", unit: "м" },
    { name: "Хомут стяжной 200мм", unit: "шт" },
    { name: "Фреон R410A", unit: "кг" },
  ];

  for (const material of materials) {
    const existing = await prisma.material.findFirst({ where: { name: material.name } });
    if (!existing) {
      await prisma.material.create({ data: material });
    }
  }
  console.log(`Материалы: ${materials.length} позиций`);
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
