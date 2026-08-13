-- Email verification
ALTER TABLE "users" ADD COLUMN "emailVerified" TIMESTAMP(3);

-- Mark existing users as verified (they already have accounts and can use the system)
UPDATE "users" SET "emailVerified" = NOW() WHERE "emailVerified" IS NULL;

-- Password reset tokens
CREATE TABLE "password_reset_tokens" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
  UNIQUE("userId", "tokenHash")
);

-- Email logs for debugging and audit
CREATE TABLE "email_logs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT,
  "email" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL
);

-- Create index for faster lookups
CREATE INDEX "email_logs_userId_idx" ON "email_logs"("userId");
CREATE INDEX "email_logs_type_idx" ON "email_logs"("type");
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");
