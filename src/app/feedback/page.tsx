import type { Metadata } from "next";
import { FeedbackForm } from "@/components/FeedbackForm";
import { Frame } from "@/components/Frame";

export const metadata: Metadata = { title: "Написать нам" };

type Search = {
  topic?: string;
  slug?: string;
  name?: string;
};

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const topic = params.topic === "photo" ? "photo" : "general";
  const estateSlug = params.slug?.trim().slice(0, 120) || undefined;
  const estateName = params.name?.trim().slice(0, 300) || undefined;

  return (
    <Frame
      crumb={<a href="/feedback">Написать нам</a>}
      left={
        <div className="prose">
          <p className="kicker">Обратная связь</p>
          <p>
            Здесь можно сообщить о неточном снимке (текст, ссылка на Commons/PastVu или свой файл), пустой карточке или
            баге. Правки по фактам в усадьбе по-прежнему лучше через «уточнить» в карточке со ссылкой на источник.
          </p>
          {topic === "photo" && estateName ? (
            <p className="muted">Усадьба: {estateName}</p>
          ) : null}
        </div>
      }
      center={
        <FeedbackForm
          topic={topic}
          estateSlug={estateSlug}
          estateName={estateName}
          pageUrl={
            estateSlug ? `/estates/${estateSlug}` : undefined
          }
        />
      }
      right={
        <div className="prose">
          <p className="kicker">Конфиденциальность</p>
          <p className="muted">Почту используем только чтобы ответить. В каталог она не попадает.</p>
          <p>
            <a className="text-link" href="/">
              Лента
            </a>
          </p>
        </div>
      }
    />
  );
}