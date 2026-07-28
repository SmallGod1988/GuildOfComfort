import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@/generated/prisma/enums";

const encoder = new TextEncoder();

function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return encoder.encode(secret);
}

export type SessionPayload = {
  userId: string;
  role: Role;
  email: string;
  fullName: string;
};

export const SESSION_COOKIE_NAME = "goc_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 дней
export const SESSION_MAX_AGE = SESSION_TTL_SECONDS;

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(payload: SessionPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (
      typeof payload.userId === "string" &&
      typeof payload.role === "string" &&
      typeof payload.email === "string" &&
      typeof payload.fullName === "string"
    ) {
      return {
        userId: payload.userId,
        role: payload.role as Role,
        email: payload.email,
        fullName: payload.fullName,
      };
    }
    return null;
  } catch {
    return null;
  }
}
