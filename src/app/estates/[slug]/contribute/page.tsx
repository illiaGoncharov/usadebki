import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContributeForm } from "@/components/ContributeForm";
import { Frame } from "@/components/Frame";
import { getEstate } from "@/db/queries";
import { isPredicateId, type PredicateId } from "@/lib/labels";

export const metadata: Metadata = { title: "Уточнение" };

export default async function ContributePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ field?: string }>;
}) {
  const { slug } = await params;
  const { field } = await searchParams;
  const estate = await getEstate(slug);
  if (!estate) notFound();
  const predicate: PredicateId = field && isPredicateId(field) ? field : "owners";

  return (
    <Frame
      crumb={
        <>
          <a href={`/estates/${estate.slug}`}>{estate.name}</a>
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
          <p>Имена владельцев — каждое с новой строки. Так они попадут в список людей, а не одной простынёй.</p>
          <p>Правка не публикуется сразу. Сначала её смотрит редактор.</p>
        </div>
      }
      center={
        <div>
          <p className="kicker">{estate.regionName}</p>
          <h1>{estate.name}</h1>
          <ContributeForm slug={estate.slug} initialPredicate={predicate} />
        </div>
      }
      right={
        <div className="prose">
          <p className="kicker">Что не нужно</p>
          <p>Не копируйте главу книги целиком. Достаточно факта и точной ссылки.</p>
          <p>Нынешних частных владельцев сюда не пишем. Речь о людях, которым усадьба принадлежала раньше.</p>
        </div>
      }
    />
  );
}
