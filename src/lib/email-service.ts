import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

let transporter: nodemailer.Transporter | null = null;

export async function initEmailService() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!host || !user || !pass) {
    throw new Error("SMTP configuration missing: SMTP_HOST, SMTP_USER, SMTP_PASSWORD required");
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return transporter;
}

async function logEmail(
  userId: string | null,
  email: string,
  type: string,
  status: "sent" | "failed",
  error?: string
) {
  try {
    await prisma.emailLog.create({
      data: {
        userId,
        email,
        type,
        status,
        error,
      },
    });
  } catch (err) {
    console.error("Failed to log email:", err);
  }
}

export async function sendEmail(options: EmailOptions, userId?: string) {
  try {
    const transport = await initEmailService();
    const from = process.env.SMTP_FROM || "noreply@example.com";

    await transport.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });

    await logEmail(userId || null, options.to, "custom", "sent");
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await logEmail(userId || null, options.to, "custom", "failed", errorMessage);
    console.error("Email send failed:", error);
    return { success: false, error: errorMessage };
  }
}

export async function sendVerificationEmail(user: { id: string; email: string; fullName: string }, verificationUrl: string) {
  const html = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2>Подтвердите ваш email адрес</h2>
        <p>Привет, ${user.fullName}!</p>
        <p>Спасибо за регистрацию. Пожалуйста, подтвердите ваш email адрес, кликнув на ссылку ниже:</p>
        <p><a href="${verificationUrl}" style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Подтвердить email</a></p>
        <p>Или скопируйте и вставьте эту ссылку в браузер:</p>
        <p><code>${verificationUrl}</code></p>
        <p style="color: #666; font-size: 12px;">Ссылка действительна 7 дней.</p>
      </body>
    </html>
  `;

  return sendEmail(
    {
      to: user.email,
      subject: "Подтвердите ваш email адрес",
      html,
    },
    user.id
  );
}

export async function sendPasswordResetEmail(user: { id: string; email: string; fullName: string }, resetUrl: string) {
  const html = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2>Сброс пароля</h2>
        <p>Привет, ${user.fullName}!</p>
        <p>Мы получили запрос на сброс пароля вашей учётной записи. Кликните на ссылку ниже для создания нового пароля:</p>
        <p><a href="${resetUrl}" style="background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Сбросить пароль</a></p>
        <p>Или скопируйте и вставьте эту ссылку в браузер:</p>
        <p><code>${resetUrl}</code></p>
        <p style="color: #666; font-size: 12px;">Ссылка действительна 24 часа.</p>
        <p style="color: #999; font-size: 12px;">Если вы не запрашивали сброс пароля, проигнорируйте это письмо.</p>
      </body>
    </html>
  `;

  return sendEmail(
    {
      to: user.email,
      subject: "Сброс пароля",
      html,
    },
    user.id
  );
}

export async function sendWorkReportEmail(
  user: { id: string; email: string; fullName: string },
  type: "employee" | "admin",
  data: unknown
) {
  let html = "";
  let subject = "";

  if (type === "employee") {
    const { hours, month } = data as { hours: number; month: string };
    html = `
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"></head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2>Отчёт по вашим часам</h2>
          <p>Привет, ${user.fullName}!</p>
          <p>Ваш отчёт за период <strong>${month}</strong>:</p>
          <p style="font-size: 18px; font-weight: bold;">Всего часов: <span style="color: #007bff;">${hours}</span></p>
          <p>Спасибо за вашу работу!</p>
        </body>
      </html>
    `;
    subject = `Отчёт по часам за ${month}`;
  } else {
    const { summary } = data as { summary: string };
    html = `
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"></head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2>Сводка по работе сотрудников</h2>
          <p>Привет, администратор!</p>
          <p>Сводка по всем сотрудникам:</p>
          <div style="background: #f5f5f5; padding: 16px; border-radius: 4px;">
            ${summary}
          </div>
        </body>
      </html>
    `;
    subject = "Сводка по работе сотрудников";
  }

  return sendEmail(
    {
      to: user.email,
      subject,
      html,
    },
    user.id
  );
}

export async function sendPayoutNotificationEmail(user: { id: string; email: string; fullName: string }, balance: number) {
  const html = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2>Уведомление о расчётке</h2>
        <p>Привет, ${user.fullName}!</p>
        <p>Ваш текущий баланс (начислено − выплачено):</p>
        <p style="font-size: 24px; font-weight: bold; color: ${balance > 0 ? "#28a745" : "#6c757d"};">
          ${balance.toFixed(2)} ₽
        </p>
        ${balance > 0 ? "<p>Выплата ожидается в ближайшее время.</p>" : "<p>Спасибо за вашу работу!</p>"}
      </body>
    </html>
  `;

  return sendEmail(
    {
      to: user.email,
      subject: "Уведомление о расчётке",
      html,
    },
    user.id
  );
}

export async function sendCustomMessageEmail(user: { id: string; email: string; fullName: string }, message: string, senderName: string) {
  const html = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2>Сообщение от компании</h2>
        <p>Привет, ${user.fullName}!</p>
        <div style="background: #f5f5f5; padding: 16px; border-radius: 4px; margin: 16px 0;">
          ${message.split("\n").map((line) => `<p>${line}</p>`).join("")}
        </div>
        <p style="color: #666; font-size: 12px;">От: ${senderName}</p>
      </body>
    </html>
  `;

  return sendEmail(
    {
      to: user.email,
      subject: "Сообщение от компании",
      html,
    },
    user.id
  );
}
