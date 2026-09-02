import { requestPasswordResetAction } from "@/app/actions/auth";
import ActionForm from "@/components/ActionForm";
import Link from "next/link";

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-2 text-gray-800">Сброс пароля</h1>
        <p className="text-center text-gray-600 mb-6">
          Введите адрес электронной почты, связанный с вашей учётной записью
        </p>

        <ActionForm action={requestPasswordResetAction} submitLabel="Отправить ссылку">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email адрес
            </label>
            <input
              type="email"
              id="email"
              name="email"
              placeholder="you@example.com"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </ActionForm>

        <div className="mt-6 text-center">
          <p className="text-gray-600">
            Помните пароль?{" "}
            <Link href="/login" className="text-blue-500 hover:text-blue-700 font-medium">
              Войти
            </Link>
          </p>
        </div>

        <div className="mt-4 p-4 bg-blue-50 rounded-lg">
          <p className="text-sm text-gray-600">
            Если у вас есть учётная запись в системе, мы отправим вам ссылку для сброса пароля.
            Ссылка будет действительна в течение 24 часов.
          </p>
        </div>
      </div>
    </div>
  );
}
