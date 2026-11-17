import { distanceMeters, type PastVuPhoto } from "@/lib/pastvu";
import {
  estateToponymStems,
  filterPastVuGalleryPhotos,
  scorePastVuGalleryRelevance,
  type PastVuEstateContext,
} from "@/lib/pastvu-match";
import { isPeoplePastVuPhoto, pickDiversePastVuGallery } from "@/lib/pastvu-subjects";

export const PASTVU_GALLERY_TARGET = 4;

function normalize(title: string) {
  return title.toLowerCase().replace(/ё/g, "е");
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

  const titleKeys = new Set<string>();
  picked = picked.filter((p) => {
    const titleKey = normalize(p.title ?? "").replace(/\s+/g, " ").slice(0, 80);
    if (titleKey && titleKeys.has(titleKey)) return false;
    if (titleKey) titleKeys.add(titleKey);
    return true;
  });
  const add = (photo: PastVuPhoto) => {
    if (picked.length >= target || seen.has(photo.cid)) return;
    if (isPeoplePastVuPhoto(photo)) return;
    const titleKey = normalize(photo.title ?? "").replace(/\s+/g, " ").slice(0, 80);
    if (titleKey && titleKeys.has(titleKey)) return;
    seen.add(photo.cid);
    if (titleKey) titleKeys.add(titleKey);
    picked.push(photo);
  };

  for (const row of allPhotos
    .map((p) => ({ p, s: scorePastVuGalleryRelevance(p, ctx) }))
    .filter((row) => row.s >= 0)
    .sort((a, b) => b.s - a.s || a.p.cid - b.p.cid)) {
    add(row.p);
    if (picked.length >= target) break;
  }

  if (picked.length < target && ctx.lat != null && ctx.lng != null) {
    const hints = localityHints(ctx.address, ctx.name);
    for (const photo of allPhotos) {
      if (picked.length >= target) break;
      const title = normalize(photo.title ?? "");
      const near = distanceMeters(ctx.lat, ctx.lng, photo.lat, photo.lng) <= 600;
      const topical = hints.some((h) => title.includes(h));
      if (near && topical) add(photo);
    }
  }

  return picked.slice(0, target);
}