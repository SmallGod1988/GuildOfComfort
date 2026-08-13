"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  COOKIE_SECURE,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE,
  createSessionToken,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import { homeForRole } from "@/lib/session";
import { sendPasswordResetEmail } from "@/lib/email-service";
import { generateResetToken, deleteAllResetTokens, hashToken } from "@/lib/tokens";

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

  if (user.deactivatedAt) {
    return { error: "Учётная запись отключена. Обратитесь к администратору." };
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
    secure: COOKIE_SECURE,
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
    secure: COOKIE_SECURE,
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

// Верификация e-mail при регистрации пока не реализована: под неё нужна
// таблица токенов, как password_reset_tokens. Экшена нет намеренно —
// предыдущая версия подтверждала первого попавшегося пользователя, не сверяя
// токен, и была доступна прямым POST-запросом.

const requestPasswordResetSchema = z.object({
  email: z.string().trim().toLowerCase().email("Некорректный e-mail"),
});

export async function requestPasswordResetAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = requestPasswordResetSchema.safeParse({
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Некорректные данные" };
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });

  // Всегда возвращаем успех (безопасность: не раскрываем наличие email)
  if (user && !user.deactivatedAt) {
    try {
      const token = await generateResetToken(user.id);
      const resetUrl = `${process.env.NODE_ENV === "production" ? "https" : "http"}://${
        process.env.VERCEL_URL || "localhost:3000"
      }/reset-password?token=${token}`;

      await sendPasswordResetEmail(user, resetUrl);
    } catch (error) {
      console.error("Failed to send password reset email:", error);
    }
  }

  return {};
}

const resetPasswordSchema = z.object({
  token: z.string().min(1, "Недействительная ссылка"),
  password: z.string().min(6, "Пароль должен быть не короче 6 символов"),
});

export async function resetPasswordAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Некорректные данные" };
  }

  try {
    // Find the reset token in the database
    const resetTokenRecord = await prisma.passwordResetToken.findFirst({
      where: {
        tokenHash: hashToken(parsed.data.token),
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        user: true,
      },
    });

    if (!resetTokenRecord || !resetTokenRecord.user) {
      return { error: "Ссылка для сброса пароля недействительна или истекла" };
    }

    // Update the user's password
    const passwordHash = await hashPassword(parsed.data.password);
    await prisma.user.update({
      where: { id: resetTokenRecord.user.id },
      data: { passwordHash },
    });

    // Delete all reset tokens for this user
    await deleteAllResetTokens(resetTokenRecord.user.id);

    redirect("/login");
  } catch (error) {
    console.error("Password reset error:", error);
    return { error: "Ошибка при сбросе пароля" };
  }
}
