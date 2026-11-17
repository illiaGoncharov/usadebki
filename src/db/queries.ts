import { and, desc, eq, sql } from "drizzle-orm";
import { PHOTO_KIND_SQL, photoFileKey, photoKind, photoRank } from "@/lib/photo";
import { AGGLOMERATIONS } from "@/lib/reference";
import { placeFromAddress } from "@/lib/search";
import { db, sql as pg } from "./index";
import {
  contributions,
  estateParts,
  estatePeople,
  estates,
  people,
  photos,
  sources,
  statements,
} from "./schema";

const PAGE_SIZE = 12;

let photoKindReady: Promise<void> | null = null;

function ensurePhotoKind() {
  photoKindReady ??= pg.unsafe(PHOTO_KIND_SQL).then(() => undefined).catch((error: unknown) => {
    photoKindReady = null;
    throw error;
  });
  return photoKindReady;
}

export type CatalogRow = {
  slug: string;
  name: string;
  wikipediaTitle: string | null;
  regionId: string;
  regionName: string;
  address: string | null;
  category: string | null;
  objectType: string | null;
  createdDateText: string | null;
  summary: string | null;
  condition: string;
  style: string | null;
  styleIds: string[] | null;
  photoUrl: string | null;
  km: number | null;
  city: string | null;
};

export type RegionRow = {
  regionId: string;
  regionName: string;
  count: number;
};

export async function listRegions() {
  const result = await db.execute<RegionRow>(sql`
    select region_id as "regionId",
           region_name as "regionName",
           count(*)::int as count
    from estates
    group by region_id, region_name
    order by count(*) desc, region_name
  `);
  return asRows<RegionRow>(result).map((row) => ({ ...row, count: Number(row.count) }));
}

export async function listEstates(options: {
  regionIds: string[] | null;
  era?: string;
  rank?: string;
  kind?: string;
  condition?: string;
  style?: string;
  distance?: string;
  photo?: boolean;
  text?: boolean;
  q?: string;
  page: number;
}) {
  await ensurePhotoKind();
  const regionIds = options.regionIds;
  const era = options.era ?? null;
  const rank = options.rank ?? null;
  const kind = options.kind ?? null;
  const condition = options.condition ?? null;
  const style = options.style ?? null;
  const distance = options.distance ?? null;
  const photo = options.photo ? true : null;
  const withText = options.text ? true : null;
  const q = options.q ?? null;
  const offset = (options.page - 1) * PAGE_SIZE;
  const cities = sql.join(
    AGGLOMERATIONS.map((city) => sql`(${city.name}::text, ${city.lat}::float8, ${city.lng}::float8)`),
    sql`, `,
  );
  // Арабский год точнее века. Римские номера проверяем от длинных к коротким:
  // иначе «XIX» ловится как «XI».
  const eraYear = sql`(
    coalesce(
      nullif(substring(e.created_date_text from '([12][0-9]{3})'), '')::int,
      case
        when e.created_date_text ~ 'XVIII' then 1701
        when e.created_date_text ~ 'XVII' then 1601
        when e.created_date_text ~ 'XVI' then 1501
        when e.created_date_text ~ 'XIX' then 1801
        when e.created_date_text ~ 'XIV' then 1301
        when e.created_date_text ~ 'XIII' then 1201
        when e.created_date_text ~ 'XII' then 1101
        when e.created_date_text ~ 'XV' then 1401
        when e.created_date_text ~ 'XI' then 1001
        when e.created_date_text ~ 'XX' then 1901
        when e.created_date_text ~ 'X' then 901
        else null
      end
    )
  )`;
  const base = sql`
    select e.slug,
           e.name,
           e.region_id as "regionId",
           e.region_name as "regionName",
           e.address,
           e.category,
           e.object_type as "objectType",
           e.created_date_text as "createdDateText",
           e.summary,
           e.wikipedia_title as "wikipediaTitle",
           e.lat,
           e.lng,
           coalesce(s.text, 'unknown') as condition,
           coalesce(st.text, e.wiki_style) as style,
           case
             when st.text is not null then array[st.text]
             when e.wiki_styles is not null then e.wiki_styles
             when e.wiki_style is not null then array[e.wiki_style]
             else null
           end as "styleIds",
           p.url as "photoUrl",
           n.km,
           n.city,
           ${eraYear} as era_year
    from estates e
    left join lateral (
      select text
      from statements
      where estate_id = e.id
        and predicate = 'condition'
        and status = 'accepted'
      order by created_at desc
      limit 1
    ) s on true
    left join lateral (
      select text
      from statements
      where estate_id = e.id
        and predicate = 'style'
        and status = 'accepted'
      order by created_at desc
      limit 1
    ) st on true
    left join lateral (
      select url
      from photos
      where estate_id = e.id
        and is_hidden = false
        and is_ensemble_part = false
      order by (photo_kind(url) >= 3), is_primary desc, photo_kind(url)
      limit 1
    ) p on true
    left join lateral (
      select c.name as city,
             (
               6371 * 2 * asin(least(1::float8, sqrt(
                 power(sin(radians(c.lat - e.lat) / 2), 2) +
                 cos(radians(e.lat)) * cos(radians(c.lat)) *
                 power(sin(radians(c.lng - e.lng) / 2), 2)
               )))
             ) as km
      from (values ${cities}) as c(name, lat, lng)
      where e.lat is not null and e.lng is not null
      order by km
      limit 1
    ) n on true
  `;
  const regionSql = regionIds
    ? sql`e."regionId" in (${sql.join(
        regionIds.map((id) => sql`${id}`),
        sql`, `,
      )})`
    : sql`true`;
  const where = sql`
    where ${regionSql}
      and (${rank}::text is null or e.category = ${rank})
      and (${kind}::text is null or e."objectType" = ${kind})
      and (
        ${q}::text is null
        or translate(e.name, '—–', '--') ilike translate(${q}, '—–', '--')
        or translate(e.summary, '—–', '--') ilike translate(${q}, '—–', '--')
        or translate(e."wikipediaTitle", '—–', '--') ilike translate(${q}, '—–', '--')
        or (e.address ilike ${q} and e."regionName" not ilike ${q})
        /* Рядом с найденным местом, до 10 км. Иначе Пущино не находится по запросу «Серпухов». */
        or (
          e.lat is not null
          and (
            select count(*)
            from estates anchor
            where anchor.address ilike ${q}
              and anchor.region_name not ilike ${q}
              and anchor.lat is not null
          ) between 1 and 40
          and exists (
            select 1
            from estates anchor
            where anchor.address ilike ${q}
              and anchor.region_name not ilike ${q}
              and anchor.lat is not null
              and (
                6371 * 2 * asin(least(1::float8, sqrt(
                  power(sin(radians(anchor.lat - e.lat) / 2), 2) +
                  cos(radians(e.lat)) * cos(radians(anchor.lat)) *
                  power(sin(radians(anchor.lng - e.lng) / 2), 2)
                )))
              ) < 10
          )
        )
      )
      and (${withText}::boolean is not true or e.summary is not null)
      and (${photo}::boolean is not true or e."photoUrl" is not null)
      and (
        ${condition}::text is null
        or (${condition} = 'poor' and e.condition in ('lost', 'ruins', 'neglect'))
        or (${condition} <> 'poor' and e.condition = ${condition})
      )
      and (
        ${style}::text is null
        or (${style} = 'unknown' and e."styleIds" is null)
        or ${style} = any(e."styleIds")
      )
      and (
        ${era}::text is null
        or (${era} = 'none' and e.era_year is null)
        or (${era} = 'pre' and e.era_year < 1700)
        or (${era} = '18' and e.era_year >= 1700 and e.era_year < 1800)
        or (${era} = '19' and e.era_year >= 1800 and e.era_year < 1900)
        or (${era} = '20' and e.era_year >= 1900 and e.era_year < 2100)
      )
      and (
        ${distance}::text is null
        or (${distance} = 'none' and e.km is null)
        or (${distance} = 'near' and e.km < 50)
        or (${distance} = 'mid' and e.km >= 50 and e.km < 150)
        or (${distance} = 'far' and e.km >= 150)
      )
  `;
  const [rowsResult, countResult] = await Promise.all([
    db.execute<CatalogRow & { era_year: number | null }>(sql`
      select slug, name, "wikipediaTitle", "regionId", "regionName", address, category, "objectType",
             "createdDateText", summary, condition, style, "styleIds", "photoUrl", km, city
      from (${base}) e
      ${where}
      order by (summary is null), ("photoUrl" is null), name
      limit ${PAGE_SIZE + 1}
      offset ${offset}
    `),
    db.execute<{ total: number }>(sql`
      select count(*)::int as total
      from (${base}) e
      ${where}
    `),
  ]);
  const fetched = asRows<CatalogRow>(rowsResult).map((row) => ({
    ...row,
    km: row.km == null ? null : Number(row.km),
  }));
  const totalRow = asRows<{ total: number }>(countResult)[0];
  return {
    rows: fetched.slice(0, PAGE_SIZE),
    hasMore: fetched.length > PAGE_SIZE,
    total: Number(totalRow?.total ?? 0),
    pageSize: PAGE_SIZE,
  };
}

export type FeaturedEstate = {
  slug: string;
  name: string;
  regionName: string;
  summary: string | null;
  address: string | null;
  category: string | null;
  photoUrl: string | null;
  photoAuthor: string | null;
  photoLicense: string | null;
};

export async function getFeatured() {
  const preferred = await featuredInRegion("50");
  if (preferred) return preferred;
  return featuredInRegion(null);
}

async function featuredInRegion(regionId: string | null) {
  await ensurePhotoKind();
  const result = await db.execute<FeaturedEstate>(sql`
    select e.slug,
           e.name,
           e.region_name as "regionName",
           e.summary,
           e.address,
           e.category,
           p.url as "photoUrl",
           p.author as "photoAuthor",
           p.license as "photoLicense"
    from estates e
    left join lateral (
      select url, author, license
      from photos
      where estate_id = e.id
        and is_hidden = false
        and is_ensemble_part = false
      order by (photo_kind(url) >= 3), is_primary desc, photo_kind(url)
      limit 1
    ) p on true
    where (${regionId}::text is null or e.region_id = ${regionId})
    order by (p.url is not null) desc, (e.summary is not null) desc, e.name
    limit 1
  `);
  return asRows<FeaturedEstate>(result)[0] ?? null;
}

export async function getEstate(slug: string) {
  const [estate] = await db.select().from(estates).where(eq(estates.slug, slug)).limit(1);
  if (!estate) return null;

  const [parts, photoRows, ensemblePhotoRows, links, statementRows] = await Promise.all([
    db.select().from(estateParts).where(eq(estateParts.estateId, estate.id)),
    db.select().from(photos).where(and(
      eq(photos.estateId, estate.id),
      eq(photos.isHidden, false),
      eq(photos.isEnsemblePart, false)
    )),
    db.select().from(photos).where(and(
      eq(photos.estateId, estate.id),
      eq(photos.isHidden, false),
      eq(photos.isEnsemblePart, true)
    )),
    db
      .select({
        id: estatePeople.id,
        role: estatePeople.role,
        name: people.name,
        years: people.years,
        sourceTitle: sources.title,
        sourcePage: sources.page,
        sourceUrl: sources.url,
        sourceId: sources.id,
      })
      .from(estatePeople)
      .innerJoin(people, eq(people.id, estatePeople.personId))
      .leftJoin(sources, eq(sources.id, estatePeople.sourceId))
      .where(eq(estatePeople.estateId, estate.id)),
    db
      .select({
        id: statements.id,
        predicate: statements.predicate,
        text: statements.text,
        createdAt: statements.createdAt,
        sourceId: sources.id,
        sourceTitle: sources.title,
        sourcePage: sources.page,
        sourceUrl: sources.url,
      })
      .from(statements)
      .leftJoin(sources, eq(sources.id, statements.sourceId))
      .where(and(eq(statements.estateId, estate.id), eq(statements.status, "accepted")))
      .orderBy(desc(statements.createdAt)),
  ]);

  const conditions = statementRows.filter((row) => row.predicate === "condition");
  const latestCondition = conditions[0];
  const latestStyle = statementRows.find((row) => row.predicate === "style");
  const sourceMap = new Map<string, { id: string; title: string; page: string | null; url: string | null }>();
  const remember = (source: {
    sourceId: string | null;
    sourceTitle: string | null;
    sourcePage: string | null;
    sourceUrl: string | null;
  }) => {
    if (!source.sourceId || !source.sourceTitle) return;
    sourceMap.set(source.sourceId, {
      id: source.sourceId,
      title: source.sourceTitle,
      page: source.sourcePage,
      url: source.sourceUrl,
    });
  };
  if (latestCondition) remember(latestCondition);
  for (const row of statementRows) {
    if (row.predicate !== "condition") remember(row);
  }
  for (const link of links) remember(link);

  const roleOrder = (role: string) => (role === "last_owner" ? 0 : role === "owner" ? 1 : 2);

  const primaryPhotos = photoRows.filter((row) => row.isPrimary);
  const dedupedPrimary = new Map<string, (typeof photoRows)[number]>();
  for (const row of primaryPhotos) {
    const key = photoFileKey(row.url);
    const existing = dedupedPrimary.get(key);
    if (!existing || (!existing.isPrimary && row.isPrimary)) dedupedPrimary.set(key, row);
  }
  const galleryPhotos = [...dedupedPrimary.values()]
    .sort(
      (a, b) =>
        photoRank(photoKind(a.url)) - photoRank(photoKind(b.url)) ||
        a.url.localeCompare(b.url, "ru"),
    )
    .slice(0, 1);

  return {
    ...estate,
    parts: parts.sort((a, b) => a.name.localeCompare(b.name, "ru")),
    photos: galleryPhotos,
    ensemblePhotos: ensemblePhotoRows.sort(
      (a, b) => photoRank(photoKind(a.url)) - photoRank(photoKind(b.url)),
    ),
    people: links
      .map((link) => ({
        id: link.id,
        role: link.role,
        name: link.name,
        years: link.years,
      }))
      .sort((a, b) => roleOrder(a.role) - roleOrder(b.role) || a.name.localeCompare(b.name, "ru")),
    condition: latestCondition?.text ?? "unknown",
    style: latestStyle?.text ?? estate.wikiStyle ?? null,
    styleIds: latestStyle?.text
      ? [latestStyle.text]
      : estate.wikiStyles?.length
        ? estate.wikiStyles
        : estate.wikiStyle
          ? [estate.wikiStyle]
          : [],
    yearNotes: statementRows.filter((row) => row.predicate === "year"),
    notes: statementRows.filter((row) => row.predicate === "note"),
    sources: [...sourceMap.values()],
  };
}

export async function listPending() {
  return db
    .select({
      id: contributions.id,
      predicate: contributions.predicate,
      text: contributions.text,
      authorName: contributions.authorName,
      contact: contributions.contact,
      sourceTitle: contributions.sourceTitle,
      sourcePage: contributions.sourcePage,
      sourceUrl: contributions.sourceUrl,
      createdAt: contributions.createdAt,
      estateName: estates.name,
      estateSlug: estates.slug,
    })
    .from(contributions)
    .innerJoin(estates, eq(estates.id, contributions.estateId))
    .where(eq(contributions.status, "pending"))
    .orderBy(desc(contributions.createdAt));
}

export async function mapOverview() {
  const points = await db.execute<{
    slug: string;
    name: string;
    regionName: string;
    lat: number;
    lng: number;
  }>(sql`
    select slug, name, region_name as "regionName", lat, lng
    from estates
    where lat is not null and lng is not null
  `);
  const totals = await db.execute<{ total: number; mapped: number }>(sql`
    select count(*)::int as total,
           count(*) filter (where lat is not null and lng is not null)::int as mapped
    from estates
  `);
  const totalRow = asRows<{ total: number; mapped: number }>(totals)[0];
  return {
    points: asRows<{ slug: string; name: string; regionName: string; lat: number; lng: number }>(points).map(
      (point) => ({
        ...point,
        lat: Number(point.lat),
        lng: Number(point.lng),
      }),
    ),
    total: Number(totalRow?.total ?? 0),
    mapped: Number(totalRow?.mapped ?? 0),
  };
}

export type SuggestEstate = {
  slug: string;
  title: string;
  note: string;
};

export async function suggestCatalog(query: string) {
  const like = `%${query}%`;
  const [estateResult, placeResult] = await Promise.all([
    db.execute<{ slug: string; name: string; title: string | null; address: string | null; regionName: string }>(sql`
      select slug,
             name,
             wikipedia_title as title,
             address,
             region_name as "regionName"
      from estates
      where translate(name, '—–', '--') ilike translate(${like}, '—–', '--')
         or translate(wikipedia_title, '—–', '--') ilike translate(${like}, '—–', '--')
         or translate(summary, '—–', '--') ilike translate(${like}, '—–', '--')
         or (address ilike ${like} and region_name not ilike ${like})
      order by
        case
          when translate(wikipedia_title, '—–', '--') ilike translate(${query} || '%', '—–', '--')
            or translate(name, '—–', '--') ilike translate(${query} || '%', '—–', '--') then 0
          when translate(wikipedia_title, '—–', '--') ilike translate(${like}, '—–', '--')
            or translate(name, '—–', '--') ilike translate(${like}, '—–', '--') then 1
          when address ilike ${like} then 2
          else 3
        end,
        name
      limit 6
    `),
    db.execute<{ address: string; regionName: string }>(sql`
      select address, region_name as "regionName"
      from estates
      where address ilike ${like}
        and region_name not ilike ${like}
      limit 80
    `),
  ]);
  const places: string[] = [];
  const seen = new Set<string>();
  for (const row of asRows<{ address: string; regionName: string }>(placeResult)) {
    const label = placeFromAddress(row.address, row.regionName, query);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    places.push(label);
    if (places.length === 4) break;
  }
  const estates = asRows<{ slug: string; name: string; title: string | null; address: string | null; regionName: string }>(
    estateResult,
  ).map((row) => {
    const familiar = row.title?.trim();
    const place = row.address ? placeFromAddress(row.address, row.regionName, query) : null;
    const where = place ?? row.regionName;
    const bare = row.name.replace(/^усадьба\s+/i, "").replace(/[«»"]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
    const known = familiar?.toLowerCase();
    const same = Boolean(known && (known === bare || known.includes(bare) || bare.includes(known ?? "")));
    return {
      slug: row.slug,
      title: familiar || row.name,
      note: familiar && !same ? `${row.name} · ${where}` : where,
    };
  });
  return { places, estates };
}

function asRows<T>(result: unknown): T[] {
  return Array.isArray(result) ? (result as T[]) : [];
}
