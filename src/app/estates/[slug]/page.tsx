import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackToReel } from "@/components/BackToReel";
import { EstateMap } from "@/components/EstateMap";
import { PhotoGallery } from "@/components/PhotoGallery";
import { Fact } from "@/components/Fact";
import { Frame } from "@/components/Frame";
import { RegistryNote } from "@/components/RegistryNote";
import { getEstate } from "@/db/queries";
import { cartoKey } from "@/lib/carto";
import { catalogHref } from "@/lib/catalog-url";
import { conditionLabel, roleLabel } from "@/lib/labels";
import { guberniaByRegion, nearestAgglomeration, styleLabel } from "@/lib/reference";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const estate = await getEstate(slug);
  return { title: estate?.name ?? "Усадьба" };
}

export default async function EstatePage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ sent?: string }>;
}) {
  const { slug } = await params;
  const { sent } = await searchParams;
  const estate = await getEstate(slug);
  if (!estate) notFound();

  const owners = estate.people.filter((person) => person.role !== "architect");
  const architects = estate.people.filter((person) => person.role === "architect");
  const dates = [estate.createdDateText, ...estate.yearNotes.map((note) => note.text)].filter(Boolean);
  const wikipedia = estate.summarySource === "wikipedia";
  const gubernia = guberniaByRegion(estate.regionId);
  const distance =
    estate.lat != null && estate.lng != null ? nearestAgglomeration(estate.lat, estate.lng) : null;

  return (
    <Frame
      crumb={
        <>
          <BackToReel href={catalogHref({ region: estate.regionId })} />
          <span> &gt; {estate.regionName}</span>
        </>
      }
      left={
        <div className="prose">
          {sent === "1" ? (
            <p className="banner">Правка отправлена. На карточке она появится после проверки.</p>
          ) : null}
          <p className="kicker">История</p>
          {estate.summary ? (
            <p>{estate.summary}</p>
          ) : (
            <p>
              История этого места ещё не собрана. Если она есть в книге или статье, её можно дописать со ссылкой
              на источник.
            </p>
          )}
          {estate.lat != null && estate.lng != null ? (
            <EstateMap
              place
              cartoKey={cartoKey()}
              points={[
                {
                  slug: estate.slug,
                  name: estate.name,
                  regionName: estate.regionName,
                  lat: estate.lat,
                  lng: estate.lng,
                },
              ]}
            />
          ) : null}
          {gubernia ? <p className="muted">{gubernia.note}</p> : null}
          {wikipedia && estate.wikipediaUrl ? (
            <p>
              <a className="text-link" href={estate.wikipediaUrl}>
                Статья в русской Википедии
              </a>
            </p>
          ) : null}
          <p>
            <a className="text-link" href={`/estates/${estate.slug}/contribute?field=note`}>
              Уточнить
            </a>
          </p>
          <RegistryNote wikipedia={wikipedia} />
        </div>
      }
      center={
        <article>
          {estate.photos.length === 0 ? (
            <>
              <div className="photo-empty">Фотографии пока нет</div>
              <p className="caption">Снимок ещё не привязан</p>
            </>
          ) : (
            <PhotoGallery name={estate.name} photos={estate.photos} />
          )}
          <p className="kicker">
            {estate.objectType ?? "Объект"} · {estate.regionName}
          </p>
          <h1>{estate.name}</h1>
          {estate.address ? <p className="muted">{estate.address}</p> : null}
          {estate.lat != null && estate.lng != null ? (
            <p>
              <a
                className="text-link"
                href={`https://pastvu.com/map/@${estate.lat},${estate.lng},17z`}
              >
                Как выглядело раньше — PastVu
              </a>
            </p>
          ) : null}
          <p className="kicker" style={{ marginTop: "1.6rem" }}>
            Состав
          </p>
          {estate.parts.length === 0 ? (
            <p className="muted">
              {estate.objectType === "Ансамбль"
                ? "В реестре ансамбль пока не разложен на отдельные объекты."
                : "В реестре это отдельный объект, не ансамбль."}
            </p>
          ) : (
            <ul className="parts">
              {estate.parts.map((part) => (
                <li key={part.id}>
                  <span>{part.name}</span>
                  <em>{part.objectType}</em>
                </li>
              ))}
            </ul>
          )}
        </article>
      }
      right={
        <div>
          <Fact label="Владельцы">
            {owners.length > 0 ? (
              <ul className="plain">
                {owners.map((person) => (
                  <li key={person.id}>
                    {person.name} <span className="muted">{roleLabel(person.role)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Unknown slug={estate.slug} field="owners" />
            )}
          </Fact>
          <Fact label="Архитекторы">
            {architects.length > 0 ? (
              architects.map((person) => person.name).join(", ")
            ) : (
              <Unknown slug={estate.slug} field="note" />
            )}
          </Fact>
          <Fact label="Даты">
            {dates.length > 0 ? dates.join(" · ") : <Unknown slug={estate.slug} field="year" />}
          </Fact>
          <Fact label="Стиль">
            {estate.styleIds.length > 0 ? (
              estate.styleIds.map((id) => styleLabel(id)).join(", ")
            ) : (
              <Unknown slug={estate.slug} field="style" />
            )}
          </Fact>
          <Fact label="Губерния">{gubernia?.name ?? "для этого региона справка ещё не написана"}</Fact>
          <Fact label="До города">
            {distance ? (
              `${distance.km} км от ${distance.name}`
            ) : (
              <span className="muted">нет точки</span>
            )}
          </Fact>
          <Fact label="Охрана">
            {estate.category ?? "категория не указана"}
            {estate.protectionYear ? `, с ${estate.protectionYear}` : ""}
          </Fact>
          <Fact label="Состояние">
            {conditionLabel(estate.condition)}
            {" · "}
            <a className="text-link" href={`/estates/${estate.slug}/contribute?field=condition`}>
              уточнить
            </a>
          </Fact>
          <Fact label="Реестр">{estate.egrknRegNumber}</Fact>
          {estate.notes.length > 0 ? (
            <Fact label="Заметки">
              {estate.notes.map((note) => (
                <p key={note.id} style={{ margin: "0 0 0.4rem" }}>
                  {note.text}
                </p>
              ))}
            </Fact>
          ) : null}
          <Fact label="Источники">
            {estate.sources.length === 0 && !wikipedia ? (
              <span className="muted">пока только реестр</span>
            ) : (
              <ul className="plain">
                <li>Минкультуры России, ЕГРОКН</li>
                {wikipedia && estate.wikipediaUrl ? (
                  <li>
                    <a className="text-link" href={estate.wikipediaUrl}>
                      Русская Википедия, CC BY-SA
                    </a>
                  </li>
                ) : null}
                {estate.sources.map((source) => (
                  <li key={source.id}>
                    {source.url ? (
                      <a className="text-link" href={source.url}>
                        {source.title}
                      </a>
                    ) : (
                      source.title
                    )}
                    {source.page ? `, ${source.page}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </Fact>
        </div>
      }
    />
  );
}

function Unknown({ slug, field }: { slug: string; field: string }) {
  return (
    <>
      <span className="muted">пока не известно</span>
      {" · "}
      <a className="text-link" href={`/estates/${slug}/contribute?field=${field}`}>
        уточнить
      </a>
    </>
  );
}
