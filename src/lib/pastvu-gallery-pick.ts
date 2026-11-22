import { distanceMeters, type PastVuPhoto } from "@/lib/pastvu";
import {
  estateToponymStems,
  filterPastVuGalleryPhotos,
  scorePastVuGalleryRelevance,
  type PastVuEstateContext,
} from "@/lib/pastvu-match";
import { isPeoplePastVuPhoto, pickDiversePastVuGallery } from "@/lib/pastvu-subjects";

export const PASTVU_GALLERY_TARGET = 4;
/** Если после строгого отбора кадров меньше — включаем план Б и добираем всё ближайшее. */
export const PASTVU_GALLERY_MIN_FILL = 3;

function normalize(title: string) {
  return title.toLowerCase().replace(/ё/g, "е");
}

function titleKey(photo: PastVuPhoto) {
  return normalize(photo.title ?? "").replace(/\s+/g, " ").slice(0, 80);
}

/** Топоним из адреса и имени — для мягкого добора кадров. */
function localityHints(address: string | null | undefined, name: string) {
  const hints = new Set<string>();
  const place = address?.match(/(?:с\.|село|д\.|дер\.|деревня|п\.|пос\.)\s*([^,]+)/i)?.[1];
  if (place) {
    const low = normalize(place);
    if (low.length >= 4) hints.add(low.slice(0, Math.min(low.length, 8)));
  }
  for (const token of normalize(name).split(/[^a-zа-я0-9]+/)) {
    if (token.length >= 5 && !["ансамбль", "усадьба", "усадьбы", "объект", "объекта"].includes(token)) {
      hints.add(token.slice(0, 6));
    }
  }
  return [...hints];
}

/**
 * До target кадров в блоке PastVu: релевантные + разнообразие сюжетов + добор по рейтингу.
 * План Б: если после фильтров кадров меньше MIN_FILL — берём ближайшие из всей выборки,
 * даже с одинаковой подписью (иначе у редких усадеб остаётся один кадр из трёх хороших).
 */
export function pickPastVuForGallery(
  allPhotos: PastVuPhoto[],
  ctx: PastVuEstateContext,
  options: { target?: number; heroCid?: number | null } = {},
) {
  const target = options.target ?? PASTVU_GALLERY_TARGET;
  const heroCid = options.heroCid ?? null;
  const stems = estateToponymStems(ctx);

  const relevant = filterPastVuGalleryPhotos(allPhotos, ctx);
  let picked = pickDiversePastVuGallery(relevant, {
    max: target,
    minTiles: Math.min(target, relevant.length || 1),
    toponymStems: stems,
  }).filter((p) => p.cid !== heroCid);

  const seen = new Set(picked.map((p) => p.cid));
  if (heroCid != null) seen.add(heroCid);

  // Дедуп по подписи — только если после него останется достаточно кадров.
  // У Оболенских три разных снимка с одной подписью «Березичи. Усадьба Оболенских».
  const titleKeys = new Set<string>();
  const dedupedByTitle = picked.filter((p) => {
    const key = titleKey(p);
    if (key && titleKeys.has(key)) return false;
    if (key) titleKeys.add(key);
    return true;
  });
  if (dedupedByTitle.length >= PASTVU_GALLERY_MIN_FILL || dedupedByTitle.length === picked.length) {
    picked = dedupedByTitle;
  } else {
    for (const p of picked) {
      const key = titleKey(p);
      if (key) titleKeys.add(key);
    }
  }

  const add = (photo: PastVuPhoto, allowSameTitle = false) => {
    if (picked.length >= target || seen.has(photo.cid)) return;
    if (isPeoplePastVuPhoto(photo)) return;
    const key = titleKey(photo);
    if (!allowSameTitle && key && titleKeys.has(key)) return;
    seen.add(photo.cid);
    if (key) titleKeys.add(key);
    picked.push(photo);
  };

  for (const row of allPhotos
    .map((p) => ({ p, s: scorePastVuGalleryRelevance(p, ctx) }))
    .filter((row) => row.s >= 0)
    .sort((a, b) => b.s - a.s || a.p.cid - b.p.cid)) {
    add(row.p, false);
    if (picked.length >= target) break;
  }

  if (picked.length < target && ctx.lat != null && ctx.lng != null) {
    const hints = localityHints(ctx.address, ctx.name);
    for (const photo of allPhotos) {
      if (picked.length >= target) break;
      const title = normalize(photo.title ?? "");
      const near = distanceMeters(ctx.lat, ctx.lng, photo.lat, photo.lng) <= 600;
      const topical = hints.some((h) => title.includes(h));
      if (near && topical) add(photo, false);
    }
  }

  // План Б: строгий отбор дал мало кадров — добираем ближайшие из всей выборки.
  // Одинаковые подписи разрешены: это часто разные ракурсы одного здания.
  if (picked.length < PASTVU_GALLERY_MIN_FILL) {
    const fillTo = Math.min(target, allPhotos.length);
    const candidates =
      ctx.lat != null && ctx.lng != null
        ? [...allPhotos].sort(
            (a, b) =>
              distanceMeters(ctx.lat!, ctx.lng!, a.lat, a.lng) -
                distanceMeters(ctx.lat!, ctx.lng!, b.lat, b.lng) || a.cid - b.cid,
          )
        : allPhotos;
    for (const photo of candidates) {
      if (picked.length >= fillTo) break;
      add(photo, true);
    }
  }

  return picked.slice(0, target);
}
