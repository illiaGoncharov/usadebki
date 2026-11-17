"use client";

import { useEffect, useState } from "react";
import type { CatalogRow } from "@/db/queries";
import { SearchBox } from "@/components/SearchBox";
import { catalogHref, type CatalogLink } from "@/lib/catalog-url";
import { estateDisplayTitle } from "@/lib/estate-display-name";
import { conditionLabel } from "@/lib/labels";
import {
  formatCatalogDistance,
  guberniaByRegion,
  shortKind,
  shortRank,
  styleLabel,
} from "@/lib/reference";

const MEMORY = "usadebki-reel";

export function EstateReel({
  rows,
  filters,
  total,
  hasMore,
  empty,
}: {
  rows: CatalogRow[];
  filters: CatalogLink & { page: number };
  total: number;
  hasMore: boolean;
  empty: string;
}) {
  const [active, setActive] = useState(rows[0]?.slug ?? "");
  const current = rows.find((row) => row.slug === active) ?? rows[0];

  useEffect(() => {
    const slug = sessionStorage.getItem(MEMORY);
    if (!slug) return;
    const node = document.querySelector(`[data-slug="${CSS.escape(slug)}"]`);
    if (node instanceof HTMLElement) node.scrollIntoView();
  }, []);

  useEffect(() => {
    const root = document.querySelector(".reel");
    if (!root) return;
    const slides = [...root.querySelectorAll<HTMLElement>("[data-slug]")];
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const slug = visible?.target.getAttribute("data-slug");
        if (slug) setActive(slug);
      },
      { root, threshold: 0.6 },
    );
    for (const slide of slides) observer.observe(slide);
    return () => observer.disconnect();
  }, [rows]);

  return (
    <div className="reel-stage">
      <div className="reel-center">
        <div className="reel-quick">
          <form action="/" className="reel-search">
            <Keep filters={filters} except="q" />
            <SearchBox filters={filters} />
          </form>
          <a
            className={filters.photo ? "reel-quick__toggle is-active" : "reel-quick__toggle"}
            href={catalogHref({ ...filters, photo: !filters.photo, page: undefined })}
            aria-pressed={filters.photo}
          >
            с фото
          </a>
          <a
            className={filters.text ? "reel-quick__toggle is-active" : "reel-quick__toggle"}
            href={catalogHref({ ...filters, text: !filters.text, page: undefined })}
            aria-pressed={filters.text}
          >
            с историей
          </a>
          <span className="reel-quick__count">
            {total} {plural(total)}
          </span>
        </div>
        {rows.length === 0 ? (
          <p className="reel-empty">{empty}</p>
        ) : (
          <>
            <div className="reel">
              {rows.map((row) => {
                const { title } = estateDisplayTitle(row.name, row.wikipediaTitle);
                return (
                <a
                  key={row.slug}
                  data-slug={row.slug}
                  className="reel-slide"
                  href={`/estates/${row.slug}`}
                  onClick={() => sessionStorage.setItem(MEMORY, row.slug)}
                >
                  {row.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cardPhoto(row.photoUrl)} alt="" />
                  ) : (
                    <span className="reel-slide__empty">снимка пока нет</span>
                  )}
                  <span className="reel-slide__caption">
                    <span className="kicker">{row.regionName}</span>
                    <span className="reel-slide__name">{title}</span>
                    <span className="reel-slide__meta">
                      {row.objectType === "Ансамбль" ? "ансамбль · " : null}
                      открыть карточку
                    </span>
                  </span>
                </a>
              );
              })}
            </div>
            {filters.page > 1 || hasMore ? (
              <nav className="reel-pager" aria-label="Страницы ленты">
                {filters.page > 1 ? <a href={catalogHref({ ...filters, page: filters.page - 1 })}>Назад</a> : null}
                {hasMore ? <a href={catalogHref({ ...filters, page: filters.page + 1 })}>Дальше</a> : null}
              </nav>
            ) : null}
          </>
        )}
      </div>
      <aside className="reel-aside">
        {current ? <Glance row={current} /> : <p className="muted">В этом срезе пусто.</p>}
      </aside>
    </div>
  );
}

function Glance({ row }: { row: CatalogRow }) {
  const gubernia = guberniaByRegion(row.regionId);
  const { title } = estateDisplayTitle(row.name, row.wikipediaTitle);
  return (
    <div className="prose">
      <p className="kicker">{row.regionName}</p>
      <p className="reel-aside__name">{title}</p>
      <p className="muted">
        {[row.createdDateText, shortKind(row.objectType), shortRank(row.category)].filter(Boolean).join(" · ")}
      </p>
      {row.styleIds?.length ? <p>{row.styleIds.map((id) => styleLabel(id)).join(", ")}</p> : null}
      <p>
        {conditionLabel(row.condition)}
        {row.km != null && row.city
          ? ` · ${formatCatalogDistance(row.city, row.km)}`
          : ""}
      </p>
      {gubernia ? (
        <p>
          <span className="kicker">{gubernia.name}</span>
          {gubernia.note}
        </p>
      ) : null}
      <p className="muted">Клик по снимку открывает карточку. Назад в браузере возвращает к этому месту ленты.</p>
    </div>
  );
}

function Keep({ filters, except }: { filters: CatalogLink; except?: "q" }) {
  const hidden: [string, string | undefined][] = [
    ["region", filters.region],
    ["gubernia", filters.gubernia],
    ["era", filters.era],
    ["rank", filters.rank],
    ["kind", filters.kind],
    ["condition", filters.condition],
    ["style", filters.style],
    ["distance", filters.distance],
    ["q", except === "q" ? undefined : filters.q],
  ];
  return (
    <>
      {hidden.map(([name, value]) => (value ? <input key={name} type="hidden" name={name} value={value} /> : null))}
      {filters.photo ? <input type="hidden" name="photo" value="1" /> : null}
      {filters.text ? <input type="hidden" name="text" value="1" /> : null}
    </>
  );
}

function cardPhoto(url: string) {
  return url.includes("width=") ? url.replace(/width=\d+/, "width=1400") : url;
}

function plural(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "усадьба";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "усадьбы";
  return "усадеб";
}
