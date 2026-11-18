"use client";

import { loginFromForm } from "@/app/actions";

export function LoginForm({ error }: { error?: string | null }) {
  return (
    <form action={loginFromForm}>
      <label className="kicker" htmlFor="password">
        Пароль редактора
      </label>
      <input id="password" name="password" type="password" className="field" required autoComplete="current-password" />
      {error ? <p className="banner">{error}</p> : null}
      <button className="text-button" type="submit">
        Войти
      </button>
    </form>
  );
}