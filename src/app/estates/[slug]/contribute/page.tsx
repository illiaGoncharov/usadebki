import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContributeForm } from "@/components/ContributeForm";
import { Frame } from "@/components/Frame";
import { HardNavLink } from "@/components/HardNavLink";
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
  searchParams: Promise<{ field?: string; error?: string }>;
}) {
  const { slug } = await params;
  const { field, error: errorRaw } = await searchParams;
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
          <HardNavLink href={`/estates/${estate.slug}`}>{displayName}</HardNavLink>
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
          <ContributeForm slug={estate.slug} initialPredicate={predicate} error={formError} />
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
