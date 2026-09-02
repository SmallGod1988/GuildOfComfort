import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { buildTimesheetWorkbook, timesheetFileName } from "@/lib/timesheet-export";

/** Разбирает ГГГГ-ММ-ДД в дату UTC; null, если формат неверный. */
function parseDate(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(request: Request) {
  // В маршруте нужен честный ответ 403, а не редирект, поэтому здесь
  // getSession, а не requireRole.
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return new Response("Выгрузка табеля доступна только администратору", { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const from = parseDate(params.get("from"));
  const to = parseDate(params.get("to"));
  if (!from || !to) {
    return new Response("Укажите период в формате ГГГГ-ММ-ДД", { status: 400 });
  }
  if (from > to) {
    return new Response("Дата начала периода позже даты окончания", { status: 400 });
  }

  const entries = await prisma.timesheetEntry.findMany({
    where: { date: { gte: from, lte: to } },
    include: { installer: true, site: true },
    orderBy: [{ date: "asc" }, { installer: { fullName: "asc" } }],
  });

  const workbook = buildTimesheetWorkbook(
    entries.map((e) => ({
      date: e.date,
      installer: e.installer.fullName,
      site: e.site?.name ?? null,
      hours: Number(e.hours),
      note: e.note,
    })),
    { from, to }
  );

  const buffer = await workbook.xlsx.writeBuffer();
  const name = timesheetFileName(from, to);

  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
