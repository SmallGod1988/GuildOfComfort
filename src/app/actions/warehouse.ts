"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export type ActionState = { error?: string };

const schema = z.object({
  siteId: z.string().min(1),
  materialId: z.string().min(1, "Выберите материал"),
  quantity: z.coerce.number().positive("Укажите количество больше нуля"),
  note: z.string().trim().optional(),
});

export async function addStockAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireRole("ADMIN");
  const parsed = schema.safeParse({
    siteId: formData.get("siteId"),
    materialId: formData.get("materialId"),
    quantity: formData.get("quantity"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Некорректные данные" };
  }

  const warehouse = await prisma.warehouse.findUnique({ where: { siteId: parsed.data.siteId } });
  if (!warehouse) return { error: "На объекте не настроен склад" };

  await prisma.$transaction([
    prisma.warehouseStock.upsert({
      where: {
        warehouseId_materialId: { warehouseId: warehouse.id, materialId: parsed.data.materialId },
      },
      update: { quantity: { increment: parsed.data.quantity } },
      create: {
        warehouseId: warehouse.id,
        materialId: parsed.data.materialId,
        quantity: parsed.data.quantity,
      },
    }),
    prisma.warehouseTransaction.create({
      data: {
        warehouseId: warehouse.id,
        materialId: parsed.data.materialId,
        type: "IN",
        quantity: parsed.data.quantity,
        note: parsed.data.note,
        createdById: session.userId,
      },
    }),
  ]);
  revalidatePath(`/admin/sites/${parsed.data.siteId}`);
  return {};
}
