"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export type ActionState = { error?: string };

const schema = z.object({
  siteId: z.string().optional(),
  date: z.string().min(1, "Укажите дату"),
  hours: z.coerce.number().positive("Укажите часы больше нуля").max(24, "Не может быть больше 24 часов"),
  note: z.string().trim().optional(),
});

export async function addTimesheetEntryAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireRole("INSTALLER");
  const parsed = schema.safeParse({
    siteId: formData.get("siteId") || undefined,
    date: formData.get("date"),
    hours: formData.get("hours"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Некорректные данные" };
  }
  await prisma.timesheetEntry.create({
    data: {
      installerId: session.userId,
      siteId: parsed.data.siteId || null,
      date: new Date(parsed.data.date),
      hours: parsed.data.hours,
      note: parsed.data.note,
    },
  });
  revalidatePath("/installer/timesheet");
  return {};
}
