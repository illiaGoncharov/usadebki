import type { Metadata } from "next";
import { FeedbackForm } from "@/components/FeedbackForm";
import { Frame } from "@/components/Frame";

export const metadata: Metadata = { title: "Написать нам" };

type Search = {
  topic?: string;
  slug?: string;
  name?: string;
  photo?: string;
};

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const topic = params.topic === "photo" ? "photo" : "general";
  const estateSlug = params.slug?.trim().slice(0, 120) || undefined;
  const estateName = params.name?.trim().slice(0, 300) || undefined;
  const wrongPhotoUrl = cleanHttpUrl(params.photo);

  return (
    <Frame
      crumb={<a href="/feedback">Написать нам</a>}
      left={
        <div className="prose">
          <p className="kicker">Обратная связь</p>
          <p>
            {topic === "photo"
              ? "Снимок мимо карточки: коротко напишите, почему так считаете, и по возможности дайте ссылку на верный кадр."
              : "Здесь можно сообщить о неточном снимке, пустой карточке или баге. Правки по фактам лучше через «уточнить» в карточке."}
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
          wrongPhotoUrl={wrongPhotoUrl}
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

function cleanHttpUrl(value: string | undefined) {
  const raw = value?.trim() ?? "";
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.toString().slice(0, 500);
  } catch {
    return undefined;
  }
}