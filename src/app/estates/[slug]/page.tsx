import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { removeEstatePerson, removeStatementFromEstate } from "@/app/actions";
import { AdminRemoveButton } from "@/components/AdminRemoveButton";
import { BackToReel } from "@/components/BackToReel";
import { EnsemblePartsGallery } from "@/components/EnsemblePartsGallery";
import { EstateHistory } from "@/components/EstateHistory";
import { EstateMap } from "@/components/EstateMap";
import { Fact } from "@/components/Fact";
import { Frame } from "@/components/Frame";
import { InstantEdit } from "@/components/InstantEdit";
import { OwnersList } from "@/components/OwnersList";
import { PastVuGallery } from "@/components/PastVuGallery";
import { PastVuHeroPlaceholder } from "@/components/PastVuHeroPlaceholder";
import { PhotoGallery } from "@/components/PhotoGallery";
import { RegistryNote } from "@/components/RegistryNote";
import { SupportThanksBanner } from "@/components/SupportThanksBanner";
import { canonicalSlugFor, getEstate, listStatementsHistory } from "@/db/queries";
import { isAdmin } from "@/lib/admin";
import { formatWhen, isEditorialSourceTitle, predicateLabel } from "@/lib/admin-history-format";
import { cartoKey } from "@/lib/carto";
import { catalogHref } from "@/lib/catalog-url";
import { estateDisplayTitle } from "@/lib/estate-display-name";
import { conditionLabel, type PredicateId } from "@/lib/labels";
import {
  formatAgglomerationDistance,
  guberniaByRegion,
  nearestAgglomeration,
  styleLabel,
} from "@/lib/reference";
import {
  pastVuSearchPages,
  pastVuSearchRadiusKm,
  filterRelevantPastVuPhotos,
  pickRelevantPastVuHero,
} from "@/lib/pastvu-match";
import { PASTVU_GALLERY_TARGET, pickPastVuForGallery } from "@/lib/pastvu-gallery-pick";
import { fetchNearbyHistoricalPhotosPaged } from "@/lib/pastvu";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const merged = await canonicalSlugFor(slug);
  if (merged) permanentRedirect(`/estates/${merged}`);
  const estate = await getEstate(slug);
  if (!estate) return { title: "Усадьба" };
  const { title } = estateDisplayTitle(estate.name, estate.wikipediaTitle);
  return { title };
}

export default async function EstatePage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ sent?: string; published?: string }>;
}) {
  const { slug } = await params;
  const { sent, published } = await searchParams;
  const merged = await canonicalSlugFor(slug);
  if (merged) permanentRedirect(`/estates/${merged}`);
  const estate = await getEstate(slug);
  if (!estate) notFound();

  const editor = await isAdmin();
  // Админу в «Источниках» — следы моментальных правок и ссылка на историю карточки.
  const editHistory = editor ? await listStatementsHistory(slug) : [];
  const editorialByField = new Map<string, (typeof editHistory)[number]>();
  for (const item of editHistory) {
    if (item.status !== "accepted" || !isEditorialSourceTitle(item.sourceTitle)) continue;
    // Список уже отсортирован по убыванию даты — берём последнее по каждому полю.
    if (!editorialByField.has(item.predicate)) editorialByField.set(item.predicate, item);
  }
  const editorialEdits = [...editorialByField.values()];
  const { title: displayName, registryNote } = estateDisplayTitle(estate.name, estate.wikipediaTitle);

  const owners = estate.people.filter((person) => person.role !== "architect");
  const architects = estate.people.filter((person) => person.role === "architect");
  const dates = [estate.createdDateText, ...estate.yearNotes.map((note) => note.text)].filter(Boolean);
  const wikipedia = estate.summarySource === "wikipedia";
  const gubernia = guberniaByRegion(estate.regionId);
  const distance =
    estate.lat != null && estate.lng != null ? nearestAgglomeration(estate.lat, estate.lng) : null;

  const hasCoords = estate.lat != null && estate.lng != null;
  const pastvuContext = {
    name: estate.name,
    wikipediaTitle: estate.wikipediaTitle,
    address: estate.address,
    displayTitle: displayName,
    objectType: estate.objectType,
    lat: estate.lat,
    lng: estate.lng,
  };
  const pastvuPhotos = hasCoords
    ? await fetchNearbyHistoricalPhotosPaged(
        estate.lat!,
        estate.lng!,
        pastVuSearchRadiusKm(pastvuContext),
        pastVuSearchPages(pastvuContext),
      )
    : [];
  // Для любого объекта: чужое отсекаем по подписи, из оставшегося — по одному кадру на сюжет.
  const pastvuHero =
    estate.photos.length === 0 && hasCoords
      ? pickRelevantPastVuHero(pastvuPhotos, estate.lat!, estate.lng!, pastvuContext)
      : null;
  const pastvuForGallery = hasCoords
    ? pickPastVuForGallery(pastvuPhotos, pastvuContext, {
        target: PASTVU_GALLERY_TARGET,
        heroCid: pastvuHero?.cid ?? null,
      })
    : [];

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
            <SupportThanksBanner
              detail={
                published === "1"
                  ? "Правка сразу опубликована на карточке (режим редактора)."
                  : "Правка в очереди на модерацию. После проверки она появится в карточке."
              }
            />
          ) : null}
          <p className="kicker">История</p>
          <EstateHistory
            summary={estate.summary}
            summarySource={estate.summarySource}
            historyOverride={estate.history}
            wikipediaTitle={estate.wikipediaTitle}
            wikipediaUrl={estate.wikipediaUrl}
            registryNameNote={registryNote}
            architects={architects}
            styleIds={estate.styleIds}
            createdDateText={estate.createdDateText}
            slug={estate.slug}
            editor={editor}
          />
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
          <RegistryNote summarySource={estate.summarySource} />
        </div>
      }
      center={
        <article>
          {estate.photos.length > 0 ? (
            <PhotoGallery
              name={displayName}
              photos={estate.photos}
              slug={estate.slug}
              editor={editor}
              wikipediaTitle={estate.wikipediaTitle}
              wikipediaUrl={estate.wikipediaUrl}
              wikidataQid={estate.wikidataQid}
            />
          ) : pastvuHero ? (
            <PastVuHeroPlaceholder
              photo={pastvuHero}
              alternatives={filterRelevantPastVuPhotos(pastvuPhotos, pastvuContext).filter(
                (item) => item.cid !== pastvuHero.cid,
              )}
              estateName={displayName}
              slug={estate.slug}
              editor={editor}
              wikipediaTitle={estate.wikipediaTitle}
              wikipediaUrl={estate.wikipediaUrl}
              wikidataQid={estate.wikidataQid}
            />
          ) : (
            <>
              <div className="photo-empty">Подтверждённого снимка пока нет</div>
              <p className="caption">
                {estate.ensemblePhotos && estate.ensemblePhotos.length > 0
                  ? "Ниже — фото других частей ансамбля."
                  : hasCoords
                    ? "Рядом с объектом на PastVu тоже нет снимков в радиусе 250 м."
                    : "После проверки снимков из Commons здесь появится одно фото главного здания."}
              </p>
            </>
          )}
          <p className="kicker">
            {estate.objectType ?? "Объект"} · {estate.regionName}
          </p>
          <h1>{displayName}</h1>
          {estate.address ? <p className="muted">{estate.address}</p> : null}
          <p className="kicker" style={{ marginTop: "1.6rem" }}>
            Состав
          </p>
          {estate.parts.length === 0 ? (
            <p className="muted">
              {estate.objectType === "Ансамбль"
                ? estate.registryDuplicates.length > 0
                  ? "Отдельные строения в состав ансамбля в базе пока не привязаны. В ЕГРОКН на один объект заведено несколько паспортов — они перечислены справа, это не список зданий."
                  : "В реестре ансамбль пока не разложен на отдельные объекты."
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
          {estate.ensemblePhotos && estate.ensemblePhotos.length > 0 ? (
            <EnsemblePartsGallery photos={estate.ensemblePhotos} parts={estate.parts} />
          ) : null}
          {hasCoords && pastvuForGallery.length > 0 ? (
            <PastVuGallery
              lat={estate.lat!}
              lng={estate.lng!}
              estateName={displayName}
              radiusMeters={Math.round(pastVuSearchRadiusKm(pastvuContext) * 1000)}
              photos={pastvuForGallery}
            />
          ) : null}
        </article>
      }
      right={
        <div>
          <Fact
            label={
              <>
                Владельцы
                <br />
                до 1917
              </>
            }
          >
            {owners.length > 0 ? (
              <OwnersList owners={owners} slug={estate.slug} editor={editor} />
            ) : (
              <Unknown slug={estate.slug} field="owners" editor={editor} />
            )}
          </Fact>
          <Fact label="Архитектор(ы)">
            {architects.length > 0 ? (
              <>
                <ul className="plain">
                  {architects.map((person) => (
                    <li key={person.id}>
                      {person.name}
                      {editor ? (
                        <AdminRemoveButton
                          action={removeEstatePerson}
                          id={person.id}
                          slug={estate.slug}
                          label={`Убрать архитектора ${person.name}`}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
                <FieldActions
                  slug={estate.slug}
                  field="architects"
                  editor={editor}
                  instantCurrent={architects.map((person) => person.name).join("\n")}
                  instantLabel="моментально добавить"
                  block
                />
              </>
            ) : (
              <Unknown slug={estate.slug} field="architects" editor={editor} />
            )}
          </Fact>
          <Fact label="Даты">
            {dates.length > 0 ? (
              <>
                {dates.join(" · ")}
                <FieldActions slug={estate.slug} field="year" editor={editor} />
              </>
            ) : (
              <Unknown slug={estate.slug} field="year" editor={editor} />
            )}
          </Fact>
          <Fact label="Стиль">
            {estate.styleIds.length > 0 ? (
              <>
                {estate.styleIds.map((id) => styleLabel(id)).join(", ")}
                <FieldActions
                  slug={estate.slug}
                  field="style"
                  editor={editor}
                  instantCurrent={estate.styleIds.join(", ")}
                />
              </>
            ) : (
              <Unknown slug={estate.slug} field="style" editor={editor} />
            )}
          </Fact>
          <Fact label="Губерния">{gubernia?.name ?? "для этого региона справка ещё не написана"}</Fact>
          <Fact label="До города">
            {distance ? (
              formatAgglomerationDistance(distance) ?? <span className="muted">нет точки</span>
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
            <FieldActions
              slug={estate.slug}
              field="condition"
              editor={editor}
              instantCurrent={estate.condition}
            />
          </Fact>
          <Fact label="Реестр">
            <div>
              <div>{estate.egrknRegNumber}</div>
              {estate.registryDuplicates.length > 0 ? (
                <>
                  <p className="fact__hint">Повторные паспорта ЕГРОКН (тот же объект):</p>
                  <ul className="plain">
                    {estate.registryDuplicates.map((reg) => (
                      <li key={reg}>{reg}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          </Fact>
          {estate.notes.length > 0 || editor ? (
            <Fact label="Заметки">
              {estate.notes.map((note) => (
                <p key={note.id} style={{ margin: "0 0 0.4rem" }}>
                  {note.text}
                  {editor ? (
                    <AdminRemoveButton
                      action={removeStatementFromEstate}
                      id={note.id}
                      slug={estate.slug}
                      label="Удалить заметку"
                    />
                  ) : null}
                </p>
              ))}
              <FieldActions
                slug={estate.slug}
                field="note"
                editor={editor}
                instantLabel="моментально добавить"
                block
              />
            </Fact>
          ) : null}
          <Fact label="Источники">
            {estate.sources.length === 0 && !wikipedia && editorialEdits.length === 0 ? (
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
                    <a className="text-link" href={source.url}>
                      {source.title}
                    </a>
                    {source.page ? `, ${source.page}` : ""}
                  </li>
                ))}
                {editorialEdits.map((item) => (
                  <li key={item.id} className="muted">
                    Правка редактора: {predicateLabel(item.predicate)} · {formatWhen(item.createdAt)}
                  </li>
                ))}
              </ul>
            )}
            {editor ? (
              <p style={{ margin: "0.45rem 0 0" }}>
                <Link className="text-link" href={`/admin/estates/${estate.slug}/history`}>
                  история изменений карточки
                  {editHistory.length > 0 ? ` · ${editHistory.length}` : ""}
                </Link>
              </p>
            ) : null}
          </Fact>
        </div>
      }
    />
  );
}

/** Пользователю — «уточнить», редактору — только «моментально». */
function FieldActions({
  slug,
  field,
  editor,
  instantCurrent,
  instantLabel = "моментально",
  block = false,
}: {
  slug: string;
  field: PredicateId;
  editor?: boolean;
  instantCurrent?: string | null;
  instantLabel?: string;
  block?: boolean;
}) {
  const links = editor ? (
    <InstantEdit
      slug={slug}
      predicate={field}
      currentValue={instantCurrent}
      label={instantLabel}
    />
  ) : (
    <a className="text-link" href={`/estates/${slug}/contribute?field=${field}`}>
      уточнить
    </a>
  );

  if (block) {
    return <p style={{ margin: "0.35rem 0 0" }}>{links}</p>;
  }

  return (
    <>
      {" · "}
      {links}
    </>
  );
}

function Unknown({
  slug,
  field,
  editor,
}: {
  slug: string;
  field: PredicateId;
  editor?: boolean;
}) {
  return (
    <>
      <span className="muted">пока не известно</span>
      <FieldActions slug={slug} field={field} editor={editor} />
    </>
  );
}
