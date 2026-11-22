import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { logout } from "@/app/actions";
import { AdminNav } from "@/components/AdminNav";
import { AdminStatementHistoryList } from "@/components/AdminStatementHistoryList";
import { Frame } from "@/components/Frame";
import { getEstate, listStatementsHistory } from "@/db/queries";
import { isAdmin } from "@/lib/admin";
import { estateDisplayTitle } from "@/lib/estate-display-name";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const estate = await getEstate(slug);
  if (!estate) return { title: "История карточки" };
  const { title } = estateDisplayTitle(estate.name, estate.wikipediaTitle, estate.titleOverride);
  return { title: `История · ${title}` };
}

export default async function EstateAdminHistoryPage({ params }: { params: Promise<Params> }) {
  if (!(await isAdmin())) redirect("/admin/login");

  const { slug } = await params;
  const estate = await getEstate(slug);
  if (!estate) notFound();

  const history = await listStatementsHistory(slug);
  const { title: displayName } = estateDisplayTitle(estate.name, estate.wikipediaTitle, estate.titleOverride);
  const activeCount = history.filter((item) => item.status === "accepted").length;
  const revokedCount = history.filter((item) => item.status === "revoked").length;
  const returnTo = `/admin/estates/${slug}/history`;

  return (
    <Frame
      crumb={
        <span>
          <AdminNav active="history" />
        </span>
      }
      left={
        <div className="prose">
          <p className="kicker">Карточка</p>
          <p>
            История правок:{" "}
            <Link className="text-link" href={`/estates/${slug}`}>
              {displayName}
            </Link>
          </p>
          <p className="muted">
            Активных: {activeCount} · Отозванных: {revokedCount}
          </p>
          <p>
            <Link className="text-link" href="/admin/history">
              вся история по сайту
            </Link>
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
          <p className="kicker">Правки этой усадьбы · {history.length}</p>
          <AdminStatementHistoryList items={history} showEstateLink={false} returnTo={returnTo} />
        </div>
      }
      right={
        <div className="prose">
          <p className="kicker">Что можно сделать</p>
          <p>
            <strong>Отменить</strong> — убрать ошибочную правку с карточки (для фото — вернуть прежний снимок).
          </p>
          <p>
            <strong>Править</strong> — сразу записать новое значение поверх (как «моментально» на карточке).
          </p>
          <p>
            <strong>Подгрузить снимок</strong> — у фото-правки вставить другой файл с Commons.
          </p>
          <p>
            <strong>Восстановить</strong> — вернуть отозванную правку обратно в показ.
          </p>
        </div>
      }
    />
  );
}
