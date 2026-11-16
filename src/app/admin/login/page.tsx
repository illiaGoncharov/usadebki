import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Frame } from "@/components/Frame";
import { LoginForm } from "@/components/LoginForm";
import { isAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "Вход" };

export default async function LoginPage() {
  if (await isAdmin()) redirect("/admin");

  return (
    <Frame
      crumb={<span>Вход</span>}
      left={
        <div className="prose">
          <p className="kicker">Редактор</p>
          <p>Пароль задаётся в .env как ADMIN_PASSWORD. Это вход редактора, не публичная регистрация.</p>
        </div>
      }
      center={
        <div>
          <p className="kicker">Очередь правок</p>
          <h1>Вход</h1>
          <LoginForm />
        </div>
      }
      right={
        <p className="muted">Отсюда принимаются уточнения по усадьбам. Каталог без входа остаётся открытым.</p>
      }
    />
  );
}
