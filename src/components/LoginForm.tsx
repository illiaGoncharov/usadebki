"use client";

import { useActionState } from "react";
import { login, type FormState } from "@/app/actions";

const initial: FormState = { error: null };

export function LoginForm() {
  const [state, action, pending] = useActionState(login, initial);

  return (
    <form action={action}>
      <label className="kicker" htmlFor="password">
        Пароль редактора
      </label>
      <input id="password" name="password" type="password" className="field" required />
      {state.error ? <p className="banner">{state.error}</p> : null}
      <button className="text-button" type="submit" disabled={pending}>
        {pending ? "Проверяем" : "Войти"}
      </button>
    </form>
  );
}
