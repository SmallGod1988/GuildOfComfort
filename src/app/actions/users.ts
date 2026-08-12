"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export async function deactivateUserAction(userId: string) {
  await requireRole("ADMIN");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role === "ADMIN") return;

  const session = await requireRole("ADMIN");
  if (session.userId === userId) return;

  await prisma.user.update({
    where: { id: userId },
    data: { deactivatedAt: new Date() },
  });

  revalidatePath("/admin/users");
}

export async function reactivateUserAction(userId: string) {
  await requireRole("ADMIN");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  await prisma.user.update({
    where: { id: userId },
    data: { deactivatedAt: null },
  });

  revalidatePath("/admin/users");
}

export async function deleteUserAction(userId: string) {
  await requireRole("ADMIN");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role === "ADMIN") return;

  const session = await requireRole("ADMIN");
  if (session.userId === userId) return;

  const counts = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      _count: {
        select: {
          assignedSites: true,
          taskStatusEvents: true,
          warehouseTransactions: true,
          timesheetEntries: true,
          financialRecordsAsParticipant: true,
          financialRecordsCreated: true,
        },
      },
    },
  });

  if (!counts) return;

  const total =
    counts._count.assignedSites +
    counts._count.taskStatusEvents +
    counts._count.warehouseTransactions +
    counts._count.timesheetEntries +
    counts._count.financialRecordsAsParticipant +
    counts._count.financialRecordsCreated;

  if (total > 0) return;

  await prisma.user.delete({ where: { id: userId } });

  revalidatePath("/admin/users");
}
