import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

const TOKEN_LENGTH = 32;
const VERIFICATION_EXPIRES_IN = 7 * 24 * 60 * 60 * 1000; // 7 days
const PASSWORD_RESET_EXPIRES_IN = 24 * 60 * 60 * 1000; // 24 hours

function hashToken(token: string): string {
  return require("crypto").createHash("sha256").update(token).digest("hex");
}

export function generateToken(): string {
  return randomBytes(TOKEN_LENGTH).toString("hex");
}

export async function generateVerificationToken(): Promise<string> {
  return generateToken();
}

export async function generateResetToken(userId: string): Promise<string> {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRES_IN);

  // Удалить старые токены этого пользователя
  await prisma.passwordResetToken.deleteMany({
    where: { userId },
  });

  // Создать новый токен
  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  return token;
}

export async function verifyResetToken(userId: string, token: string): Promise<boolean> {
  const tokenHash = hashToken(token);

  const record = await prisma.passwordResetToken.findFirst({
    where: {
      userId,
      tokenHash,
      expiresAt: {
        gt: new Date(),
      },
    },
  });

  return !!record;
}

export async function deleteResetToken(userId: string, token: string): Promise<void> {
  const tokenHash = hashToken(token);

  await prisma.passwordResetToken.deleteMany({
    where: {
      userId,
      tokenHash,
    },
  });
}

export async function deleteAllResetTokens(userId: string): Promise<void> {
  await prisma.passwordResetToken.deleteMany({
    where: { userId },
  });
}
