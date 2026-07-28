"use client";

import { useActionState } from "react";
import Link from "next/link";
import { registerAction, type ActionState } from "@/app/actions/auth";

const initialState: ActionState = {};

export default function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerAction, initialState);

  return (
    <form action={formAction} className="card">
      {state.error && <div className="error-banner">{state.error}</div>}
      <div className="field">
        <label htmlFor="role">Я — </label>
        <select id="role" name="role" defaultValue="INSTALLER" required>
          <option value="INSTALLER">Монтажник</option>
          <option value="CUSTOMER">Заказчик</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="fullName">Имя и фамилия</label>
        <input id="fullName" name="fullName" type="text" required />
      </div>
      <div className="field">
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="field">
        <label htmlFor="phone">Телефон (необязательно)</label>
        <input id="phone" name="phone" type="tel" />
      </div>
      <div className="field">
        <label htmlFor="password">Пароль</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
        />
      </div>
      <button type="submit" disabled={pending}>
        {pending ? "Регистрируем..." : "Зарегистрироваться"}
      </button>
      <p className="hint">
        Уже есть аккаунт? <Link href="/login">Войти</Link>
      </p>
    </form>
  );
}
