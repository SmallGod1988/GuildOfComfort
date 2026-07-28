"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE,
  createSessionToken,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import { homeForRole } from "@/lib/session";

export type ActionState = { error?: string };

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Некорректный e-mail"),
  password: z.string().min(1, "Введите пароль"),
});

export async function loginAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Некорректные данные" };
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return { error: "Неверный e-mail или пароль" };
  }

  const token = await createSessionToken({
    userId: user.id,
    role: user.role,
    email: user.email,
    fullName: user.fullName,
  });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  redirect(homeForRole(user.role));
}

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("Некорректный e-mail"),
  password: z.string().min(6, "Пароль должен быть не короче 6 символов"),
  fullName: z.string().trim().min(2, "Укажите имя"),
  phone: z.string().trim().optional(),
  role: z.enum(["INSTALLER", "CUSTOMER"], { message: "Выберите роль" }),
});

export async function registerAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    fullName: formData.get("fullName"),
    phone: formData.get("phone") || undefined,
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Некорректные данные" };
  }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) {
    return { error: "Пользователь с таким e-mail уже зарегистрирован" };
  }

  const user = await prisma.user.create({
    data: {
      email: parsed.data.email,
      passwordHash: await hashPassword(parsed.data.password),
      fullName: parsed.data.fullName,
      phone: parsed.data.phone || null,
      role: parsed.data.role,
    },
  });

  const token = await createSessionToken({
    userId: user.id,
    role: user.role,
    email: user.email,
    fullName: user.fullName,
  });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  redirect(homeForRole(user.role));
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}
