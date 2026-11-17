import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContributeForm } from "@/components/ContributeForm";
import { Frame } from "@/components/Frame";
import { SupportThanksBanner } from "@/components/SupportThanksBanner";
import { getEstate } from "@/db/queries";
import { estateDisplayTitle } from "@/lib/estate-display-name";
import { isAdmin } from "@/lib/admin";
import { isPredicateId, type PredicateId } from "@/lib/labels";

export const metadata: Metadata = { title: "Уточнение" };

export default async function ContributePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ field?: string; thanks?: string; published?: string; emailed?: string; error?: string }>;
}) {
  const { slug } = await params;
  const { field, thanks, published, emailed, error: errorRaw } = await searchParams;
  const formError = errorRaw?.trim() || null;
  const estate = await getEstate(slug);
  if (!estate) notFound();
  const { title: displayName } = estateDisplayTitle(estate.name, estate.wikipediaTitle);
  const predicate: PredicateId = field && isPredicateId(field) ? field : "owners";
  const editor = await isAdmin();

  return (
    <Frame
      crumb={
        <>
          <a href={`/estates/${estate.slug}`}>{displayName}</a>
          <span> &gt; Уточнение</span>
        </>
      }
      left={
        <div className="prose">
          <p className="kicker">Как писать</p>
          <p>
            Короткая справка и источник, по которому её можно проверить: книга и страница, статья или архивное
            дело.
          </p>
          <p>
            Имена владельцев до 1917 — каждое с новой строки. Так они попадут в список людей, а не одной простынёй.
          </p>
          {editor ? (
            <p>
              Вы вошли как редактор (<a href="/admin">/admin</a>): правка сразу попадёт в карточку, без очереди.
            </p>
          ) : (
            <p>
              Правка не публикуется сразу: очередь <a href="/admin">/admin</a> и письмо модератору, если настроен
              Resend.
            </p>
          )}
        </div>
      }
      center={
        <div>
          <p className="kicker">{estate.regionName}</p>
          <h1>{displayName}</h1>
          {thanks === "1" ? (
            <SupportThanksBanner
              detail={
                published === "1"
                  ? "Правка сразу опубликована на карточке (режим редактора)."
                  : emailed === "0"
                    ? "Правка сохранена в очереди. Письмо редактору не ушло — проверьте CONTACT_EMAIL/RESEND на сервере."
                    : "Правка в очереди на модерацию. После проверки она появится в карточке."
              }
            />
          ) : (
            <ContributeForm slug={estate.slug} initialPredicate={predicate} error={formError} />
          )}
          {thanks === "1" ? (
            <p className="muted" style={{ marginTop: "1rem" }}>
              <a className="text-link" href={`/estates/${estate.slug}`}>
                Вернуться к карточке
              </a>
            </p>
          ) : null}
        </div>
      }
      right={
        <div className="prose">
          <p className="kicker">Что не нужно</p>
          <p>Не копируйте главу книги целиком. Достаточно факта и точной ссылки.</p>
          <p>Нынешних частных владельцев сюда не пишем. Нужны те, кому усадьба принадлежала до 1917 года.</p>
        </div>
      }
    />
  );
}
