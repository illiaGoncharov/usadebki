import Link from "next/link";
import { CatalogFilters } from "@/components/CatalogFilters";
import { EstateReel } from "@/components/EstateReel";
import { catalogHref, type CatalogLink } from "@/lib/catalog-url";
import { isConditionId } from "@/lib/labels";
import { guberniaById, isDistanceId, isEraId, isKindId, isRankId, isStyleId, KINDS, RANKS } from "@/lib/reference";
import { listEstates, listRegions } from "@/db/queries";
import { loosenPlace } from "@/lib/search";

type Search = {
  region?: string;
  gubernia?: string;
  era?: string;
  rank?: string;
  kind?: string;
  condition?: string;
  style?: string;
  distance?: string;
  photo?: string;
  text?: string;
  q?: string;
  page?: string;
  view?: string;
};

export default async function HomePage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const filters = readFilters(params);
  const regionIds = regionIdsFor(filters.region, filters.gubernia);
  const [regions, list] = await Promise.all([
    listRegions(),
    listEstates({
      regionIds,
      era: filters.era,
      rank: RANKS.find((item) => item.id === filters.rank)?.value,
      kind: KINDS.find((item) => item.id === filters.kind)?.value,
      condition: filters.condition,
      style: filters.style,
      distance: filters.distance,
      photo: filters.photo,
      text: filters.text,
      q: filters.q ? `%${loosenPlace(filters.q)}%` : undefined,
      page: filters.page,
    }),
  ]);
  const regionName = regions.find((item) => item.regionId === filters.region)?.regionName;
  const byName = [...regions].sort((a, b) => a.regionName.localeCompare(b.regionName, "ru"));

  return (
    <div className="shell shell--catalog">
      <div className="shell__head">
        <Link href="/">Усадьбы</Link>
      </div>
      <div className="shell__head shell__crumb">
        <span>Отбор</span>
        <span> · {regionName ?? "все"}</span>
      </div>
      <div className="shell__head shell__head-right">
        <Link href="/about">О проекте</Link>
      </div>
      <CatalogFilters regions={regions} value={filters} />
      <nav className="reel-regions">
        <a className={!filters.region ? "is-active" : ""} href={catalogHref({ ...filters, region: undefined, page: undefined })}>
          Все
        </a>
        {byName.map((item) => (
          <a
            key={item.regionId}
            className={filters.region === item.regionId ? "is-active" : ""}
            href={catalogHref({ ...filters, region: item.regionId, gubernia: undefined, page: undefined })}
          >
            <span>{item.regionName}</span>
            <span>{item.count}</span>
          </a>
        ))}
      </nav>
      <EstateReel
        rows={list.rows}
        filters={filters}
        total={list.total}
        hasMore={list.hasMore}
        empty={emptyCopy(filters)}
      />
    </div>
  );
}

function readFilters(params: Search): CatalogLink & { page: number; view: "columns" | "list" } {
  const region = params.region && /^\d{1,3}$/.test(params.region) ? params.region.padStart(2, "0") : undefined;
  const condition =
    params.condition === "poor" || (params.condition && isConditionId(params.condition))
      ? params.condition
      : undefined;
  return {
    region,
    gubernia: guberniaById(params.gubernia) ? params.gubernia : undefined,
    era: params.era && isEraId(params.era) ? params.era : undefined,
    rank: params.rank && isRankId(params.rank) ? params.rank : undefined,
    kind: params.kind && isKindId(params.kind) ? params.kind : undefined,
    condition,
    style: params.style === "unknown" || (params.style && isStyleId(params.style)) ? params.style : undefined,
    distance: params.distance && isDistanceId(params.distance) ? params.distance : undefined,
    photo: params.photo === "1",
    text: params.text === "1",
    q: params.q?.trim().replace(/[%_]/g, "").slice(0, 80) || undefined,
    page: Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1),
    view: params.view === "list" ? "list" : "columns",
  };
}

function regionIdsFor(region: string | undefined, guberniaId: string | undefined) {
  const gubernia = guberniaById(guberniaId);
  if (gubernia && region) return gubernia.regions.includes(region) ? [region] : ["__none__"];
  if (gubernia) return gubernia.regions;
  if (region) return [region];
  return null;
}

function emptyCopy(filters: CatalogLink) {
  if (filters.style && filters.style !== "unknown") {
    return "Такого стиля в реестре нет. Он появится, когда правку со ссылкой на источник примут.";
  }
  if (filters.condition && filters.condition !== "unknown") {
    return "В этом срезе пока ничего нет. Состояние появится, когда его отметят в карточке.";
  }
  return "В этом срезе пока ничего нет.";
}

