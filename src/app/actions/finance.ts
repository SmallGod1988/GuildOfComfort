"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export type ActionState = { error?: string };

const schema = z.object({
  participantId: z.string().min(1, "Выберите участника"),
  siteId: z.string().optional(),
  type: z.enum(["ACCRUAL", "PAYOUT"]),
  amount: z.coerce.number().positive("Укажите сумму больше нуля"),
  note: z.string().trim().optional(),
});

export async function createFinancialRecordAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireRole("ADMIN");
  const parsed = schema.safeParse({
    participantId: formData.get("participantId"),
    siteId: formData.get("siteId") || undefined,
    type: formData.get("type"),
    amount: formData.get("amount"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Некорректные данные" };
  }
  await prisma.financialRecord.create({
    data: {
      participantId: parsed.data.participantId,
      siteId: parsed.data.siteId || null,
      type: parsed.data.type,
      amount: parsed.data.amount,
      note: parsed.data.note,
      createdById: session.userId,
    },
  });
  revalidatePath("/admin/finance");
  return {};
}
