"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import type { Prisma } from "@/generated/prisma/client";

export type ActionState = { error?: string };

async function assertInstallerOnTask(taskId: string, installerId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { subProject: true },
  });
  if (!task) throw new Error("Задача не найдена");
  if (task.installerId !== installerId) {
    throw new Error("Задача закреплена не за вами");
  }
  return task;
}

function revalidateTask(taskId: string) {
  revalidatePath(`/installer/tasks/${taskId}`);
  revalidatePath(`/admin/tasks/review`);
  revalidatePath("/installer");
  revalidatePath("/customer", "layout");
}

const createTaskSchema = z.object({
  subProjectId: z.string().min(1),
  operationId: z.string().min(1),
  title: z.string().trim().min(2, "Укажите название задачи"),
  description: z.string().trim().optional(),
  volume: z.coerce.number().positive("Объём работ должен быть больше нуля"),
});

export async function createTaskAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole("ADMIN");
  const parsed = createTaskSchema.safeParse({
    subProjectId: formData.get("subProjectId"),
    operationId: formData.get("operationId"),
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    volume: formData.get("volume"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Некорректные данные" };
  }
  const task = await prisma.task.create({ data: parsed.data });
  const subProject = await prisma.subProject.findUnique({ where: { id: parsed.data.subProjectId } });
  if (subProject) {
    revalidatePath(`/admin/sites/${subProject.siteId}/sub-projects/${subProject.id}`);
  }
  revalidateTask(task.id);
  return {};
}

export async function takeTaskAction(taskId: string): Promise<ActionState> {
  const session = await requireRole("INSTALLER");
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { subProject: { include: { site: { include: { installers: true } } } } },
  });
  if (!task) return { error: "Задача не найдена" };
  if (task.status !== "FREE") return { error: "Задача уже закреплена за кем-то" };
  const onSite = task.subProject.site.installers.some((i) => i.installerId === session.userId);
  if (!onSite) return { error: "Вы не назначены на этот объект" };

  await prisma.$transaction([
    prisma.task.update({
      where: { id: taskId },
      data: { status: "ASSIGNED", installerId: session.userId, assignedAt: new Date() },
    }),
    prisma.taskStatusEvent.create({
      data: {
        taskId,
        fromStatus: "FREE",
        toStatus: "ASSIGNED",
        createdById: session.userId,
      },
    }),
  ]);
  revalidateTask(taskId);
  return {};
}

export async function startTaskAction(taskId: string): Promise<ActionState> {
  const session = await requireRole("INSTALLER");
  const task = await assertInstallerOnTask(taskId, session.userId);
  if (task.status !== "ASSIGNED") return { error: "Задачу можно начать только из статуса «Назначена»" };

  await prisma.$transaction([
    prisma.task.update({
      where: { id: taskId },
      data: { status: "IN_PROGRESS", startedAt: task.startedAt ?? new Date() },
    }),
    prisma.taskStatusEvent.create({
      data: { taskId, fromStatus: "ASSIGNED", toStatus: "IN_PROGRESS", createdById: session.userId },
    }),
  ]);
  revalidateTask(taskId);
  return {};
}

export async function resumeTaskAction(taskId: string): Promise<ActionState> {
  const session = await requireRole("INSTALLER");
  const task = await assertInstallerOnTask(taskId, session.userId);
  if (task.status !== "PAUSED" && task.status !== "BLOCKED") {
    return { error: "Возобновить можно только задачу на паузе или заблокированную" };
  }
  await prisma.$transaction([
    prisma.task.update({ where: { id: taskId }, data: { status: "IN_PROGRESS" } }),
    prisma.taskStatusEvent.create({
      data: { taskId, fromStatus: task.status, toStatus: "IN_PROGRESS", createdById: session.userId },
    }),
  ]);
  revalidateTask(taskId);
  return {};
}

const reasonSchema = z.object({
  reason: z.string().trim().min(3, "Укажите причину"),
});

export async function pauseTaskAction(
  taskId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireRole("INSTALLER");
  const task = await assertInstallerOnTask(taskId, session.userId);
  if (task.status !== "IN_PROGRESS") return { error: "Поставить на паузу можно только задачу в работе" };
  const parsed = reasonSchema.safeParse({ reason: formData.get("reason") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Укажите причину" };

  await prisma.$transaction([
    prisma.task.update({ where: { id: taskId }, data: { status: "PAUSED" } }),
    prisma.taskStatusEvent.create({
      data: {
        taskId,
        fromStatus: "IN_PROGRESS",
        toStatus: "PAUSED",
        reason: parsed.data.reason,
        createdById: session.userId,
      },
    }),
  ]);
  revalidateTask(taskId);
  return {};
}

export async function blockTaskAction(
  taskId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireRole("INSTALLER");
  const task = await assertInstallerOnTask(taskId, session.userId);
  if (task.status !== "IN_PROGRESS") return { error: "Заблокировать можно только задачу в работе" };
  const parsed = reasonSchema.safeParse({ reason: formData.get("reason") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Укажите причину" };

  await prisma.$transaction([
    prisma.task.update({ where: { id: taskId }, data: { status: "BLOCKED" } }),
    prisma.taskStatusEvent.create({
      data: {
        taskId,
        fromStatus: "IN_PROGRESS",
        toStatus: "BLOCKED",
        reason: parsed.data.reason,
        createdById: session.userId,
      },
    }),
  ]);
  revalidateTask(taskId);
  return {};
}

export async function finishTaskAction(
  taskId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireRole("INSTALLER");
  const task = await assertInstallerOnTask(taskId, session.userId);
  if (task.status !== "IN_PROGRESS") return { error: "Завершить можно только задачу в работе" };

  const site = await prisma.site.findFirst({
    where: { subProjects: { some: { id: task.subProjectId } } },
    include: { warehouse: true },
  });
  if (!site?.warehouse) return { error: "На объекте не настроен склад" };
  const warehouseId = site.warehouse.id;

  // Списывать можно только материалы из техкарты операции: форма приходит от
  // клиента, поэтому её состав проверяется заново.
  const techCard = await prisma.techCardMaterial.findMany({
    where: { operationId: task.operationId },
    select: { materialId: true },
  });
  const allowed = new Set(techCard.map((t) => t.materialId));

  const materialIds = formData.getAll("materialId").map(String);
  const quantities = formData.getAll("quantity").map(String);
  const usages: { materialId: string; quantity: Prisma.Decimal | number }[] = [];
  for (let i = 0; i < materialIds.length; i++) {
    const qty = Number(quantities[i]);
    if (!(qty > 0)) continue;
    if (!allowed.has(materialIds[i])) {
      return { error: "Материал не входит в техкарту операции" };
    }
    usages.push({ materialId: materialIds[i], quantity: qty });
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (const usage of usages) {
        const stock = await tx.warehouseStock.findUnique({
          where: { warehouseId_materialId: { warehouseId, materialId: usage.materialId } },
        });
        const available = stock ? Number(stock.quantity) : 0;
        if (available < Number(usage.quantity)) {
          const material = await tx.material.findUnique({ where: { id: usage.materialId } });
          throw new Error(
            `Недостаточно материала «${material?.name ?? usage.materialId}» на складе: доступно ${available}, требуется ${usage.quantity}`
          );
        }
        await tx.warehouseStock.update({
          where: { warehouseId_materialId: { warehouseId, materialId: usage.materialId } },
          data: { quantity: { decrement: usage.quantity } },
        });
        await tx.warehouseTransaction.create({
          data: {
            warehouseId,
            materialId: usage.materialId,
            type: "OUT",
            quantity: usage.quantity,
            taskId,
            createdById: session.userId,
          },
        });
      }
      await tx.task.update({
        where: { id: taskId },
        data: { status: "IN_REVIEW", completedAt: new Date() },
      });
      await tx.taskStatusEvent.create({
        data: { taskId, fromStatus: "IN_PROGRESS", toStatus: "IN_REVIEW", createdById: session.userId },
      });
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Не удалось завершить задачу" };
  }

  revalidateTask(taskId);
  revalidatePath(`/installer/sites/${site.id}`);
  return {};
}

export async function acceptTaskAction(taskId: string): Promise<ActionState> {
  const session = await requireRole("ADMIN");
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return { error: "Задача не найдена" };
  if (task.status !== "IN_REVIEW") return { error: "Принять можно только задачу на проверке" };

  await prisma.$transaction([
    prisma.task.update({ where: { id: taskId }, data: { status: "DONE", reviewedAt: new Date() } }),
    prisma.taskStatusEvent.create({
      data: { taskId, fromStatus: "IN_REVIEW", toStatus: "DONE", createdById: session.userId },
    }),
  ]);
  revalidateTask(taskId);
  return {};
}

export async function rejectTaskAction(
  taskId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireRole("ADMIN");
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return { error: "Задача не найдена" };
  if (task.status !== "IN_REVIEW") return { error: "Вернуть в работу можно только задачу на проверке" };
  const parsed = reasonSchema.safeParse({ reason: formData.get("reason") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Укажите причину возврата" };

  await prisma.$transaction([
    prisma.task.update({ where: { id: taskId }, data: { status: "IN_PROGRESS", reviewedAt: new Date() } }),
    prisma.taskStatusEvent.create({
      data: {
        taskId,
        fromStatus: "IN_REVIEW",
        toStatus: "IN_PROGRESS",
        reason: parsed.data.reason,
        createdById: session.userId,
      },
    }),
  ]);
  revalidateTask(taskId);
  return {};
}
