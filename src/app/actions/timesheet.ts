"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export type ActionState = { error?: string };

const schema = z.object({
  installerId: z.string().optional(),
  siteId: z.string().optional(),
  date: z.string().min(1, "Укажите дату"),
  hours: z.coerce.number().positive("Укажите часы больше нуля").max(24, "Не может быть больше 24 часов"),
  note: z.string().trim().optional(),
});

async function checkAccess(
  session: Awaited<ReturnType<typeof requireRole>>,
  entryId: string
) {
  const entry = await prisma.timesheetEntry.findUnique({
    where: { id: entryId },
    select: { installerId: true, siteId: true },
  });
  if (!entry) return null;

  if (session.role === "ADMIN") return entry;

  if (entry.installerId === session.userId) return entry;

  if (entry.siteId) {
    const si = await prisma.siteInstaller.findUnique({
      where: { siteId_installerId: { siteId: entry.siteId, installerId: session.userId } },
    });
    if (si?.isForeman) return entry;
  }

  return null;
}

export async function addTimesheetEntryAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireRole("INSTALLER");
  const parsed = schema.safeParse({
    installerId: formData.get("installerId") || undefined,
    siteId: formData.get("siteId") || undefined,
    date: formData.get("date"),
    hours: formData.get("hours"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Некорректные данные" };
  }

  const siteId = parsed.data.siteId || null;
  const targetId = parsed.data.installerId || session.userId;

  if (targetId !== session.userId) {
    if (!siteId) {
      return { error: "Выберите объект, чтобы внести часы за другого монтажника" };
    }
    const [me, target] = await Promise.all([
      prisma.siteInstaller.findUnique({
        where: { siteId_installerId: { siteId, installerId: session.userId } },
      }),
      prisma.siteInstaller.findUnique({
        where: { siteId_installerId: { siteId, installerId: targetId } },
      }),
    ]);
    if (!me?.isForeman) {
      return { error: "Вы не бригадир на этом объекте" };
    }
    if (!target) {
      return { error: "Этот монтажник не назначен на объект" };
    }
  }

  await prisma.timesheetEntry.create({
    data: {
      installerId: targetId,
      siteId,
      date: new Date(parsed.data.date),
      hours: parsed.data.hours,
      note: parsed.data.note,
    },
  });
  revalidatePath("/installer/timesheet");
  revalidatePath("/admin/timesheet");
  return {};
}

export async function updateTimesheetEntryAction(
  entryId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireRole("INSTALLER");
  const entry = await checkAccess(session, entryId);
  if (!entry) {
    return { error: "Нет доступа к этой записи" };
  }

  const parsed = schema.safeParse({
    installerId: formData.get("installerId") || undefined,
    siteId: formData.get("siteId") || undefined,
    date: formData.get("date"),
    hours: formData.get("hours"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Некорректные данные" };
  }

  const siteId = parsed.data.siteId || null;

  await prisma.timesheetEntry.update({
    where: { id: entryId },
    data: {
      siteId,
      date: new Date(parsed.data.date),
      hours: parsed.data.hours,
      note: parsed.data.note,
    },
  });

  revalidatePath("/installer/timesheet");
  revalidatePath("/admin/timesheet");
  return {};
}

export async function deleteTimesheetEntryAction(entryId: string) {
  const session = await requireRole("INSTALLER");
  const entry = await checkAccess(session, entryId);
  if (!entry) return;

  await prisma.timesheetEntry.delete({ where: { id: entryId } });
  revalidatePath("/installer/timesheet");
  revalidatePath("/admin/timesheet");
}
