import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { logout } from "@/app/actions";
import { Frame } from "@/components/Frame";
import { listContributionsArchive, listInquiriesArchive, listPending, listStatementsHistory } from "@/db/queries";
import { isAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "Админ" };

export default async function AdminHomePage() {
  if (!(await isAdmin())) redirect("/admin/login");

  const [pending, history, contributions, inquiries] = await Promise.all([
    listPending(),
    listStatementsHistory(),
    listContributionsArchive(),
    listInquiriesArchive(),
  ]);

  const items = [
    {
      href: "/admin/queue",
      title: "Очередь правок",
      hint: "Принять или отклонить то, что прислали через «уточнить».",
      badge: pending.length > 0 ? `${pending.length} ждут` : null,
    },
    {
      href: "/admin/history",
      title: "История изменений",
      hint: "Все принятые и моментальные правки. Можно отменить, если была ошибка.",
      badge: history.length > 0 ? `${history.length} в истории` : null,
    },
    {
      href: "/admin/archive",
      title: "Архив краудсорса",
      hint: "Все правки и обращения с /feedback, включая принятые и отклонённые.",
      badge: `${contributions.length} правок · ${inquiries.length} писем`,
    },
    {
      href: "/",
      title: "Каталог",
      hint: "Вернуться к ленте усадеб.",
      badge: null,
    },
  ] as const;

  return (
    <Frame
      crumb={<span>Админ</span>}
      left={
        <div className="prose">
          <p className="kicker">Редактор</p>
          <p>После входа через эту страницу видны все служебные разделы. В шапке сайта тоже есть ссылка «Админ».</p>
          <form action={logout}>
            <button className="text-button" type="submit">
              Выйти
            </button>
          </form>
        </div>
      }
      center={
        <div>
          <p className="kicker">Разделы</p>
          <ul className="plain admin-hub">
            {items.map((item) => (
              <li key={item.href}>
                <p style={{ margin: "0 0 0.25rem" }}>
                  <Link className="text-link" href={item.href}>
                    {item.title}
                  </Link>
                  {item.badge ? <span className="muted"> · {item.badge}</span> : null}
                </p>
                <p className="muted" style={{ margin: "0 0 1.2rem", fontSize: "0.92rem" }}>
                  {item.hint}
                </p>
              </li>
            ))}
          </ul>
        </div>
      }
      right={
        <div className="prose">
          <p className="kicker">Локально</p>
          <p>
            Снимок архива на диск: <code>npm run crowdsource:archive</code>
          </p>
        </div>
      }
    />
  );
}