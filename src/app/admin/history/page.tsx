import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { logout } from "@/app/actions";
import { AdminNav } from "@/components/AdminNav";
import { AdminStatementHistoryList } from "@/components/AdminStatementHistoryList";
import { Frame } from "@/components/Frame";
import { listStatementsHistory } from "@/db/queries";
import { isAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "История изменений" };

export default async function AdminHistoryPage() {
  if (!(await isAdmin())) redirect("/admin/login");

  const history = await listStatementsHistory();
  const activeCount = history.filter((item) => item.status === "accepted").length;
  const revokedCount = history.filter((item) => item.status === "revoked").length;

  return (
    <Frame
      crumb={
        <span>
          <AdminNav active="history" />
        </span>
      }
      left={
        <div className="prose">
          <p className="kicker">Редактор</p>
          <p>
            История всех утверждений, опубликованных в карточках (моментальные правки редактора и принятые из
            очереди).
          </p>
          <p>
            Чтобы работать только с одной усадьбой — откройте «история карточки» у записи или ссылку в блоке
            «Источники» на самой карточке.
          </p>
          <p className="muted">
            Активных: {activeCount} · Отозванных: {revokedCount}
          </p>
          <form action={logout}>
            <button className="text-button" type="submit">
              Выйти
            </button>
          </form>
        </div>
      }
      center={
        <div>
          <p className="kicker">История · {history.length}</p>
          <AdminStatementHistoryList items={history} returnTo="/admin/history" />
        </div>
      }
      right={
        <div className="prose">
          <p className="kicker">Как устроен откат</p>
          <p>
            Отмена не удаляет запись из базы, а меняет статус на <code>revoked</code>. Карточка усадьбы
            перестаёт её учитывать и возвращается к предыдущему утверждению или паспорту реестра.
          </p>
        </div>
      }
    />
  );
}
