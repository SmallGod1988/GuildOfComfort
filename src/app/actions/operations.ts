"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export type ActionState = { error?: string };

const createOperationSchema = z.object({
  name: z.string().trim().min(2, "Укажите название операции"),
  description: z.string().trim().optional(),
  category: z.string().trim().optional(),
  tools: z.string().trim().optional(),
  unit: z.string().trim().min(1, "Укажите единицу измерения работ"),
  laborNorm: z.coerce.number().positive("Норма трудозатрат должна быть больше нуля").optional(),
});

export async function createOperationAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole("ADMIN");
  const parsed = createOperationSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    category: formData.get("category") || undefined,
    tools: formData.get("tools") || undefined,
    unit: formData.get("unit"),
    laborNorm: formData.get("laborNorm") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Некорректные данные" };
  }
  const tools = parsed.data.tools
    ? parsed.data.tools.split(",").map((t) => t.trim()).filter(Boolean)
    : [];
  await prisma.operation.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      category: parsed.data.category,
      tools,
      unit: parsed.data.unit,
      laborNorm: parsed.data.laborNorm,
    },
  });
  revalidatePath("/admin/operations");
  return {};
}

const techCardSchema = z.object({
  operationId: z.string().min(1),
  materialId: z.string().min(1, "Выберите материал"),
  quantity: z.coerce.number().positive("Укажите количество больше нуля"),
});

export async function addTechCardMaterialAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole("ADMIN");
  const parsed = techCardSchema.safeParse({
    operationId: formData.get("operationId"),
    materialId: formData.get("materialId"),
    quantity: formData.get("quantity"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Некорректные данные" };
  }
  await prisma.techCardMaterial.upsert({
    where: {
      operationId_materialId: {
        operationId: parsed.data.operationId,
        materialId: parsed.data.materialId,
      },
    },
    update: { quantity: parsed.data.quantity },
    create: parsed.data,
  });
  revalidatePath(`/admin/operations/${parsed.data.operationId}`);
  return {};
}

export async function removeTechCardMaterialAction(operationId: string, materialId: string) {
  await requireRole("ADMIN");
  await prisma.techCardMaterial.deleteMany({ where: { operationId, materialId } });
  revalidatePath(`/admin/operations/${operationId}`);
}
