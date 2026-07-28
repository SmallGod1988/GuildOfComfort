"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export type ActionState = { error?: string };

const schema = z.object({
  siteId: z.string().min(1),
  name: z.string().trim().min(2, "Укажите название подпроекта"),
});

export async function createSubProjectAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole("ADMIN");
  const parsed = schema.safeParse({
    siteId: formData.get("siteId"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Некорректные данные" };
  }
  await prisma.subProject.create({ data: parsed.data });
  revalidatePath(`/admin/sites/${parsed.data.siteId}`);
  return {};
}
