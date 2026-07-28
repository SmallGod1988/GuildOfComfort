"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export type ActionState = { error?: string };

const schema = z.object({
  name: z.string().trim().min(1, "Укажите название материала"),
  unit: z.string().trim().min(1, "Укажите единицу измерения"),
});

export async function createMaterialAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole("ADMIN");
  const parsed = schema.safeParse({
    name: formData.get("name"),
    unit: formData.get("unit"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Некорректные данные" };
  }
  await prisma.material.create({ data: parsed.data });
  revalidatePath("/admin/materials");
  revalidatePath("/admin/operations");
  return {};
}
