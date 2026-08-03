"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export type ActionState = { error?: string };

const createSiteSchema = z.object({
  name: z.string().trim().min(2, "Укажите название объекта"),
  address: z.string().trim().min(3, "Укажите адрес"),
  customerId: z.string().optional(),
});

export async function createSiteAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole("ADMIN");
  const parsed = createSiteSchema.safeParse({
    name: formData.get("name"),
    address: formData.get("address"),
    customerId: formData.get("customerId") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Некорректные данные" };
  }

  const site = await prisma.site.create({
    data: {
      name: parsed.data.name,
      address: parsed.data.address,
      customerId: parsed.data.customerId || null,
      warehouse: { create: {} },
    },
  });
  revalidatePath("/admin");
  revalidatePath(`/admin/sites/${site.id}`);
  return {};
}

const assignCustomerSchema = z.object({
  siteId: z.string().min(1),
  customerId: z.string().min(1, "Выберите заказчика"),
});

export async function assignCustomerAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole("ADMIN");
  const parsed = assignCustomerSchema.safeParse({
    siteId: formData.get("siteId"),
    customerId: formData.get("customerId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Некорректные данные" };
  }
  await prisma.site.update({
    where: { id: parsed.data.siteId },
    data: { customerId: parsed.data.customerId },
  });
  revalidatePath(`/admin/sites/${parsed.data.siteId}`);
  revalidatePath("/admin");
  return {};
}

const assignInstallerSchema = z.object({
  siteId: z.string().min(1),
  installerId: z.string().min(1, "Выберите монтажника"),
});

export async function assignInstallerAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole("ADMIN");
  const parsed = assignInstallerSchema.safeParse({
    siteId: formData.get("siteId"),
    installerId: formData.get("installerId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Некорректные данные" };
  }
  await prisma.siteInstaller.upsert({
    where: {
      siteId_installerId: { siteId: parsed.data.siteId, installerId: parsed.data.installerId },
    },
    update: {},
    create: parsed.data,
  });
  revalidatePath(`/admin/sites/${parsed.data.siteId}`);
  return {};
}

export async function unassignInstallerAction(siteId: string, installerId: string) {
  await requireRole("ADMIN");
  await prisma.siteInstaller.deleteMany({ where: { siteId, installerId } });
  revalidatePath(`/admin/sites/${siteId}`);
}

export async function updateSiteStatusAction(siteId: string, status: "ACTIVE" | "ON_HOLD" | "COMPLETED") {
  await requireRole("ADMIN");
  await prisma.site.update({ where: { id: siteId }, data: { status } });
  revalidatePath(`/admin/sites/${siteId}`);
  revalidatePath("/admin");
}
