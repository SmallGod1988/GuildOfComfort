import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
  type SessionPayload,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/enums";

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export function homeForRole(role: Role) {
  switch (role) {
    case "ADMIN":
      return "/admin";
    case "INSTALLER":
      return "/installer";
    case "CUSTOMER":
      return "/customer";
  }
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { deactivatedAt: true },
  });
  if (!user) redirect("/logout");
  if (user.deactivatedAt) redirect("/logout?reason=deactivated");

  return session;
}

export async function requireRole(
  role: Role | Role[]
): Promise<SessionPayload> {
  const session = await requireSession();
  const roles = Array.isArray(role) ? role : [role];
  if (!roles.includes(session.role)) {
    redirect(homeForRole(session.role));
  }
  return session;
}
