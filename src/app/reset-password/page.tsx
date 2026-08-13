"use client";

import { resetPasswordAction } from "@/app/actions/auth";
import ActionForm from "@/components/ActionForm";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-md">
          <h1 className="text-3xl font-bold text-center mb-4 text-gray-800">Ошибка</h1>
          <p className="text-center text-gray-600 mb-6">
            Ссылка для сброса пароля не найдена. Пожалуйста, запросите новую ссылку.
          </p>
          <div className="text-center">
            <Link
              href="/forgot-password"
              className="inline-block px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Вернуться к сбросу пароля
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-2 text-gray-800">Создать новый пароль</h1>
        <p className="text-center text-gray-600 mb-6">Введите новый пароль для вашей учётной записи</p>

        <ActionForm action={resetPasswordAction} submitLabel="Установить пароль">
          <input type="hidden" name="token" value={token} />
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Новый пароль
            </label>
            <input
              type="password"
              id="password"
              name="password"
              placeholder="••••••••"
              minLength={6}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-sm text-gray-500 mt-1">Минимум 6 символов</p>
          </div>
        </ActionForm>

        <div className="mt-6 text-center">
          <p className="text-gray-600">
            Вспомнили пароль?{" "}
            <Link href="/login" className="text-blue-500 hover:text-blue-700 font-medium">
              Войти
            </Link>
          </p>
        </div>

        <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
          <p className="text-sm text-gray-600">
            Ссылка действительна в течение 24 часов. Если ссылка истекла, запросите новую на странице сброса пароля.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-md">
            <h1 className="text-3xl font-bold text-center mb-4 text-gray-800">Загрузка...</h1>
          </div>
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
