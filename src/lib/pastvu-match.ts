import { distanceMeters, pickClosestPastVuPhoto, type PastVuPhoto } from "@/lib/pastvu";
import { pastVuSubject } from "@/lib/pastvu-subjects";
import { addressRefs, compareAddress } from "@/lib/photo-match";

/** Контекст объекта для сопоставления подписи PastVu с памятником. */
export type PastVuEstateContext = {
  name: string;
  wikipediaTitle?: string | null;
  address?: string | null;
  displayTitle?: string | null;
  objectType?: string | null;
  /** Точка объекта: у большого ансамбля снимки рядом с ней принимаем и без топонима в подписи. */
  lat?: number | null;
  lng?: number | null;
};

const STOPWORDS = new Set([
  "основе",
  "основе",
  "часть",
  "объект",
  "ансамбль",
  "усадьба",
  "усадьбе",
  "здание",
  "здания",
  "главный",
  "главного",
  "москва",
  "москве",
  "город",
  "улица",
  "первая",
  "треть",
  "век",
  "века",
]);

const MONUMENT_PHRASES: Array<{ estate: RegExp; title: RegExp; points: number }> = [
  { estate: /почтамт/i, title: /почтамт|post\s*office/i, points: 14 },
  { estate: /демидов/i, title: /демидов|demidov/i, points: 14 },
  { estate: /усадьб/i, title: /усадьб|manor|estate/i, points: 10 },
];

const MIN_RELEVANCE_SCORE = 8;
const MIN_GALLERY_ENSEMBLE_SCORE = 6;

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[—–]/g, "-")
    .trim();
}

/** Номера строений из адреса реестра (стр.1, 5, 10 …). */
export function structureNumbersFromEstate(address: string | null | undefined, name: string) {
  const text = `${address ?? ""} ${name}`;
  const nums = new Set<number>();
  const afterStr = text.match(/стр\.?\s*([\d\s,()часть\-–]+)/i);
  if (afterStr) {
    for (const match of afterStr[1].matchAll(/\d+/g)) {
      nums.add(Number(match[0]));
    }
  }
  for (const match of text.matchAll(/(?:строени[ея])\s*(\d+)/gi)) {
    nums.add(Number(match[1]));
  }
  return nums;
}

/** Номер строения из подписи кадра PastVu («… дом 40 стр. 4»). */
export function structureNumberFromPastVuTitle(title: string | null | undefined) {
  if (!title) return null;
  const t = normalizeText(title);
  const patterns = [
    /(?:^|[^\d])стр\.?\s*(\d+)/,
    /строени[ея]\s*(\d+)/,
    /(?:^|[^\d])с\s*(\d+)(?:\s|$)/,
    /дом\s+\d+\s+стр\.?\s*(\d+)/,
    /д\.?\s*\d+\s+с\.?\s*(\d+)/,
  ];
  for (const pattern of patterns) {
    const match = t.match(pattern);
    if (match) return Number(match[1]);
  }
  return null;
}

function significantKeywords(...texts: (string | null | undefined)[]) {
  const words = new Set<string>();
  for (const raw of texts) {
    if (!raw) continue;
    for (const token of normalizeText(raw).split(/[^a-zа-я0-9]+/)) {
      if (!token) continue;
      if (token.length >= 5 && !STOPWORDS.has(token)) words.add(token);
      if (["почтамт", "демидов", "демидовых", "demidov"].includes(token)) words.add(token);
    }
  }
  return [...words];
}

function parseStreetAndHouse(address: string | null | undefined) {
  if (!address) return null;
  const street =
    address.match(/ул\.?\s*([^,]+)/i)?.[1]?.trim() ??
    address.match(/улиц[аы]\s+([^,]+)/i)?.[1]?.trim();
  const house =
    address.match(/д\.?\s*(\d+)/i)?.[1] ?? address.match(/дом\s+(\d+)/i)?.[1];
  if (!street && !house) return null;
  return {
    street: street ? normalizeText(street) : null,
    house: house ?? null,
  };
}

/** Улицы и аллеи из длинного адреса ансамбля (не только первая запятая). */
export function streetNamesFromEstateAddress(address: string | null | undefined) {
  if (!address) return [];
  const norm = normalizeText(address);
  const streets = new Set<string>();
  for (const match of norm.matchAll(/(?:ул\.?|улиц[аы])\s*([^,;]+)/g)) {
    const name = match[1]?.trim();
    if (name && name.length >= 4) streets.add(name);
  }
  for (const match of norm.matchAll(/алле[яи]\s+([^,;]+)/g)) {
    const name = match[1]?.trim();
    if (name && name.length >= 4) streets.add(name);
  }
  return [...streets];
}

/**
 * Большой комплекс: в адресе реестра много домов. Тип «Ансамбль» сам по себе не считаем:
 * Почтамт — тоже ансамбль, но компактный, и соседние кадры там как раз опасны.
 */
export function isWideEstatePastVu(ctx: PastVuEstateContext) {
  const refs = addressRefs(ctx.address);
  return refs.houses.length >= 5 || (ctx.address?.length ?? 0) >= 100;
}

/** Рядом с точкой объекта снимок с конкретным сюжетом принимаем, даже если в подписи нет названия усадьбы. */
function nearMeters(ctx: PastVuEstateContext) {
  return isWideEstatePastVu(ctx) ? 300 : 150;
}

export function pastVuSearchRadiusKm(ctx: PastVuEstateContext) {
  return isWideEstatePastVu(ctx) ? 0.7 : 0.25;
}

/** Страниц по 30: у всех объектов смотрим дальше первой страницы, у большого комплекса — ещё дальше. */
export function pastVuSearchPages(ctx: PastVuEstateContext) {
  return isWideEstatePastVu(ctx) ? 3 : 2;
}

/** Все номера домов из реестрового адреса, в т.ч. «д. 2, 3, 4, 10». */
export function houseNumbersFromEstateAddress(address: string | null | undefined) {
  const houses = new Set(addressRefs(address).houses);
  const norm = (address ?? "").toLowerCase();
  for (const match of norm.matchAll(/(?:д\.?|дом)\s*([\d][\d\s,()часть\-–]*)/gi)) {
    for (const n of match[1].matchAll(/\d+/g)) houses.add(n[0]);
  }
  return [...houses];
}

function pastVuAddressMismatch(photo: PastVuPhoto, ctx: PastVuEstateContext) {
  if (isWideEstatePastVu(ctx)) {
    const photoRefs = addressRefs(photo.title);
    if (photoRefs.houses.length === 0) return false;
    const estateHouses = houseNumbersFromEstateAddress(ctx.address);
    if (estateHouses.length === 0) return false;
    return !photoRefs.houses.some((house) => estateHouses.includes(house));
  }
  return compareAddress(ctx.address ?? "", photo.title ?? "") === "mismatch";
}

/** Насколько подпись PastVu относится к нашему памятнику (шапка — строго). */
export function scorePastVuRelevance(photo: PastVuPhoto, ctx: PastVuEstateContext): number {
  const title = normalizeText(photo.title ?? "");
  if (!title) return -1;

  const corpus = normalizeText(
    [ctx.name, ctx.wikipediaTitle, ctx.displayTitle, ctx.address].filter(Boolean).join(" "),
  );

  if (pastVuAddressMismatch(photo, ctx)) return -1;

  const allowedStructs = structureNumbersFromEstate(ctx.address, ctx.name);
  const titleStruct = structureNumberFromPastVuTitle(photo.title);
  if (
    titleStruct !== null &&
    allowedStructs.size > 0 &&
    !isWideEstatePastVu(ctx) &&
    !allowedStructs.has(titleStruct)
  ) {
    return -1;
  }

  let score = 0;

  for (const rule of MONUMENT_PHRASES) {
    if (rule.estate.test(corpus) && rule.title.test(title)) score += rule.points;
  }

  for (const keyword of significantKeywords(ctx.name, ctx.wikipediaTitle, ctx.displayTitle)) {
    if (title.includes(keyword)) score += 10;
  }

  const loc = parseStreetAndHouse(ctx.address);
  if (loc?.street) {
    const streetStem = loc.street.replace(/(?:ская|ский|ская|ское)$/i, "").slice(0, 6);
    if (title.includes(loc.street) || (streetStem.length >= 4 && title.includes(streetStem))) {
      score += 4;
    }
  }
  if (loc?.house && title.includes(loc.house)) score += 6;

  if (titleStruct !== null && allowedStructs.has(titleStruct)) score += 16;

  if (ctx.wikipediaTitle) {
    const wiki = normalizeText(ctx.wikipediaTitle);
    if (wiki.length >= 6 && title.includes(wiki)) score += 12;
  }

  return score >= MIN_RELEVANCE_SCORE ? score : -1;
}

/** Сетка у всех объектов: дом и улица из адреса, название памятника или конкретный сюжет рядом с точкой. */
export function scorePastVuGalleryRelevance(photo: PastVuPhoto, ctx: PastVuEstateContext): number {
  const title = normalizeText(photo.title ?? "");
  if (!title) return -1;
  if (pastVuAddressMismatch(photo, ctx)) return -1;

  const corpus = normalizeText(
    [ctx.name, ctx.wikipediaTitle, ctx.displayTitle, ctx.address].filter(Boolean).join(" "),
  );

  let score = 0;
  const addr = compareAddress(ctx.address ?? "", photo.title ?? "");
  if (addr === "match" || addr === "match-structure") score += 14;

  const estateHouses = houseNumbersFromEstateAddress(ctx.address);
  if (estateHouses.some((house) => new RegExp(`(?:^|[^\\d])${house}(?:[^\\d]|$)`).test(title))) {
    score += 10;
  }

  for (const street of streetNamesFromEstateAddress(ctx.address)) {
    const stem = street.replace(/(?:ская|ские|ский|ское)$/i, "").slice(0, 10);
    if (title.includes(street) || (stem.length >= 6 && title.includes(stem))) score += 9;
  }

  for (const keyword of significantKeywords(ctx.name, ctx.wikipediaTitle, ctx.displayTitle)) {
    if (title.includes(keyword)) score += 8;
  }

  for (const rule of MONUMENT_PHRASES) {
    if (rule.estate.test(corpus) && rule.title.test(title)) score += rule.points;
  }

  if (score >= MIN_GALLERY_ENSEMBLE_SCORE) return score;

  // Конкретный сюжет (флигель, мост, пруд) без названия усадьбы — только если снимок снят рядом.
  const subject = pastVuSubject(photo.title);
  const concrete = subject !== "people" && subject !== "general" && !subject.startsWith("other:");
  if (concrete && ctx.lat != null && ctx.lng != null) {
    if (distanceMeters(ctx.lat, ctx.lng, photo.lat, photo.lng) <= nearMeters(ctx)) return 1;
  }
  return -1;
}

function filterPastVuByScore(
  photos: PastVuPhoto[],
  ctx: PastVuEstateContext,
  scoreFn: (photo: PastVuPhoto, ctx: PastVuEstateContext) => number,
) {
  return photos
    .map((photo) => ({ photo, score: scoreFn(photo, ctx) }))
    .filter((row) => row.score >= 0)
    .sort((a, b) => b.score - a.score || a.photo.cid - b.photo.cid)
    .map((row) => row.photo);
}

export function filterPastVuGalleryPhotos(photos: PastVuPhoto[], ctx: PastVuEstateContext) {
  return filterPastVuByScore(photos, ctx, scorePastVuGalleryRelevance);
}

export function filterRelevantPastVuPhotos(photos: PastVuPhoto[], ctx: PastVuEstateContext) {
  return filterPastVuByScore(photos, ctx, scorePastVuRelevance);
}

/** Для шапки: подпись должна совпасть с памятником; среди таких — ближайший к точке. */
export function pickRelevantPastVuHero(
  photos: PastVuPhoto[],
  lat: number,
  lng: number,
  ctx: PastVuEstateContext,
) {
  const relevant = filterRelevantPastVuPhotos(photos, ctx);
  return pickClosestPastVuPhoto(relevant, lat, lng);
}

/** Основы слов из названия объекта («кузьм»): в подписях сюжета они ничего не значат. */
export function estateToponymStems(ctx: PastVuEstateContext) {
  return significantKeywords(ctx.name, ctx.wikipediaTitle, ctx.displayTitle).map((word) => word.slice(0, 5));
}
