import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { contributions, estates, photos, sources, statements } from "@/db/schema";
import { commonsCategoryForQid, fetchCommonsCategoryFilenames } from "@/lib/commons-links";
import { photoFileKey, photoKind } from "@/lib/photo";

/** Действия редактора со снимками — пишутся в statements (predicate = photo). */
export type PhotoEditAction =
  | "hide"
  | "primary"
  | "ensemble"
  | "add_main"
  | "add_ensemble"
  | "fill_ensemble";

export type PhotoEditRecord = {
  v: 1;
  action: PhotoEditAction;
  photoId: string;
  url: string;
  /** Состояние до правки — нужно для «Отменить». */
  prev: {
    isPrimary: boolean;
    isEnsemblePart: boolean;
    isHidden: boolean;
    primaryId: string | null;
    primaryUrl: string | null;
  };
  /** Для fill_ensemble: какие id добавили пакетом (откат = скрыть их). */
  filledIds?: string[];
};

export function isPhotoEditPredicate(predicate: string) {
  return predicate === "photo";
}

export function parsePhotoEditRecord(text: string): PhotoEditRecord | null {
  try {
    const raw = JSON.parse(text) as Partial<PhotoEditRecord>;
    if (raw?.v !== 1 || !raw.action || !raw.photoId || !raw.url || !raw.prev) return null;
    return raw as PhotoEditRecord;
  } catch {
    return null;
  }
}

export function serializePhotoEditRecord(record: PhotoEditRecord) {
  return JSON.stringify(record);
}

const ACTION_LABELS: Record<PhotoEditAction, string> = {
  hide: "скрыто (мимо)",
  primary: "сделано главным",
  ensemble: "в ансамбль",
  add_main: "добавлено главное",
  add_ensemble: "добавлено в ансамбль",
  fill_ensemble: "добор ансамбля с Commons",
};

export function photoEditActionLabel(action: PhotoEditAction) {
  return ACTION_LABELS[action] ?? action;
}

/** Краткий текст для списка истории. */
export function readablePhotoEdit(text: string) {
  const record = parsePhotoEditRecord(text);
  if (!record) return text;
  if (record.action === "fill_ensemble") {
    const n = record.filledIds?.length ?? 0;
    return n > 0 ? `добор ансамбля с Commons · ${n} шт.` : photoEditActionLabel(record.action);
  }
  return photoEditActionLabel(record.action);
}

type PhotoFlags = {
  id: string;
  url: string;
  isPrimary: boolean;
  isEnsemblePart: boolean;
  isHidden: boolean;
};

async function loadEstateBySlug(slug: string) {
  const [estate] = await db
    .select({ id: estates.id, slug: estates.slug })
    .from(estates)
    .where(eq(estates.slug, slug))
    .limit(1);
  return estate ?? null;
}

async function loadPhoto(estateId: string, photoId: string): Promise<PhotoFlags | null> {
  const [row] = await db
    .select({
      id: photos.id,
      url: photos.url,
      isPrimary: photos.isPrimary,
      isEnsemblePart: photos.isEnsemblePart,
      isHidden: photos.isHidden,
    })
    .from(photos)
    .where(and(eq(photos.id, photoId), eq(photos.estateId, estateId)))
    .limit(1);
  return row ?? null;
}

async function currentPrimary(estateId: string): Promise<{ id: string; url: string } | null> {
  const [row] = await db
    .select({ id: photos.id, url: photos.url })
    .from(photos)
    .where(and(eq(photos.estateId, estateId), eq(photos.isPrimary, true), eq(photos.isHidden, false)))
    .limit(1);
  return row ?? null;
}

async function snapshotPrev(estateId: string, photo: PhotoFlags): Promise<PhotoEditRecord["prev"]> {
  const primary = await currentPrimary(estateId);
  return {
    isPrimary: photo.isPrimary,
    isEnsemblePart: photo.isEnsemblePart,
    isHidden: photo.isHidden,
    primaryId: primary?.id ?? null,
    primaryUrl: primary?.url ?? null,
  };
}

/** Источник + contribution + statement — как у моментальных правок текста. */
async function insertPhotoEditStatement(estateId: string, record: PhotoEditRecord) {
  const body = serializePhotoEditRecord(record);
  const [source] = await db
    .insert(sources)
    .values({
      type: "editorial",
      title: "Правка редактора (фото)",
      author: "Редактор",
      url: record.url,
    })
    .returning();

  if (!source) throw new Error("Источник фото-правки не записался");

  const [contribution] = await db
    .insert(contributions)
    .values({
      estateId,
      predicate: "photo",
      text: body,
      authorName: "Редактор",
      sourceTitle: "Правка редактора (фото)",
      sourceUrl: record.url,
      status: "accepted",
    })
    .returning();

  await db.insert(statements).values({
    estateId,
    predicate: "photo",
    text: body,
    sourceId: source.id,
    status: "accepted",
    contributionId: contribution?.id ?? null,
  });
}

export async function hideEstatePhotoLogged(slug: string, photoId: string) {
  const estate = await loadEstateBySlug(slug);
  if (!estate) return null;
  const photo = await loadPhoto(estate.id, photoId);
  if (!photo) return null;

  const prev = await snapshotPrev(estate.id, photo);
  await db
    .update(photos)
    .set({ isHidden: true, isPrimary: false })
    .where(and(eq(photos.id, photoId), eq(photos.estateId, estate.id)));

  await insertPhotoEditStatement(estate.id, {
    v: 1,
    action: "hide",
    photoId,
    url: photo.url,
    prev,
  });
  return estate.slug;
}

export async function setPrimaryEstatePhotoLogged(slug: string, photoId: string) {
  const estate = await loadEstateBySlug(slug);
  if (!estate) return null;
  const photo = await loadPhoto(estate.id, photoId);
  if (!photo) return null;

  const prev = await snapshotPrev(estate.id, photo);
  await db.transaction(async (tx) => {
    await tx.update(photos).set({ isPrimary: false }).where(eq(photos.estateId, estate.id));
    await tx
      .update(photos)
      .set({ isPrimary: true, isEnsemblePart: false, isHidden: false })
      .where(and(eq(photos.id, photoId), eq(photos.estateId, estate.id)));
  });

  await insertPhotoEditStatement(estate.id, {
    v: 1,
    action: "primary",
    photoId,
    url: photo.url,
    prev,
  });
  return estate.slug;
}

export async function setEnsembleEstatePhotoLogged(slug: string, photoId: string) {
  const estate = await loadEstateBySlug(slug);
  if (!estate) return null;
  const photo = await loadPhoto(estate.id, photoId);
  if (!photo) return null;

  const prev = await snapshotPrev(estate.id, photo);
  await db
    .update(photos)
    .set({ isEnsemblePart: true, isPrimary: false, isHidden: false })
    .where(and(eq(photos.id, photoId), eq(photos.estateId, estate.id)));

  await insertPhotoEditStatement(estate.id, {
    v: 1,
    action: "ensemble",
    photoId,
    url: photo.url,
    prev,
  });
  return estate.slug;
}

export async function addEstatePhotoLogged(
  slug: string,
  parsed: { url: string; sourceUrl: string },
  role: "main" | "ensemble",
) {
  const estate = await loadEstateBySlug(slug);
  if (!estate) return null;

  const asPrimary = role === "main";
  const asEnsemble = role === "ensemble";
  const primaryBefore = await currentPrimary(estate.id);

  let photoId = "";
  let url = parsed.url;
  let prevFlags: PhotoEditRecord["prev"] = {
    isPrimary: false,
    isEnsemblePart: false,
    isHidden: true,
    primaryId: primaryBefore?.id ?? null,
    primaryUrl: primaryBefore?.url ?? null,
  };

  await db.transaction(async (tx) => {
    if (asPrimary) {
      await tx.update(photos).set({ isPrimary: false }).where(eq(photos.estateId, estate.id));
    }

    const [existing] = await tx
      .select({
        id: photos.id,
        url: photos.url,
        isPrimary: photos.isPrimary,
        isEnsemblePart: photos.isEnsemblePart,
        isHidden: photos.isHidden,
      })
      .from(photos)
      .where(and(eq(photos.estateId, estate.id), eq(photos.url, parsed.url)))
      .limit(1);

    if (existing) {
      prevFlags = {
        isPrimary: existing.isPrimary,
        isEnsemblePart: existing.isEnsemblePart,
        isHidden: existing.isHidden,
        primaryId: primaryBefore?.id ?? null,
        primaryUrl: primaryBefore?.url ?? null,
      };
      await tx
        .update(photos)
        .set({
          isHidden: false,
          isPrimary: asPrimary,
          isEnsemblePart: asEnsemble,
          sourceUrl: parsed.sourceUrl,
          origin: "editorial",
        })
        .where(eq(photos.id, existing.id));
      photoId = existing.id;
      url = existing.url;
      return;
    }

    const [inserted] = await tx
      .insert(photos)
      .values({
        estateId: estate.id,
        url: parsed.url,
        sourceUrl: parsed.sourceUrl,
        isPrimary: asPrimary,
        isEnsemblePart: asEnsemble,
        isHidden: false,
        origin: "editorial",
      })
      .returning({ id: photos.id, url: photos.url });

    if (!inserted) throw new Error("Фото не записалось");
    photoId = inserted.id;
    url = inserted.url;
  });

  await insertPhotoEditStatement(estate.id, {
    v: 1,
    action: asEnsemble ? "add_ensemble" : "add_main",
    photoId,
    url,
    prev: prevFlags,
  });
  return estate.slug;
}

/** Откат фото-правки: вернуть флаги как до действия. */
export async function undoPhotoEdit(statementId: string) {
  const [statement] = await db.select().from(statements).where(eq(statements.id, statementId)).limit(1);
  if (!statement || !isPhotoEditPredicate(statement.predicate)) return null;

  const record = parsePhotoEditRecord(statement.text);
  if (!record) {
    await db.update(statements).set({ status: "revoked" }).where(eq(statements.id, statementId));
    return estateSlugById(statement.estateId);
  }

  await db.transaction(async (tx) => {
    await tx.update(statements).set({ status: "revoked" }).where(eq(statements.id, statementId));

    const { action, photoId, prev, filledIds } = record;

    // Пакетный добор: просто снова скрываем все добавленные id.
    if (action === "fill_ensemble" && filledIds && filledIds.length > 0) {
      for (const id of filledIds) {
        await tx
          .update(photos)
          .set({ isHidden: true, isPrimary: false })
          .where(and(eq(photos.id, id), eq(photos.estateId, statement.estateId)));
      }
      return;
    }

    // Снимок — в состояние до правки (без isPrimary: его выставит restorePrimary).
    await tx
      .update(photos)
      .set({
        isHidden: prev.isHidden,
        isPrimary: false,
        isEnsemblePart: prev.isEnsemblePart,
      })
      .where(and(eq(photos.id, photoId), eq(photos.estateId, statement.estateId)));

    await tx.update(photos).set({ isPrimary: false }).where(eq(photos.estateId, statement.estateId));

    if (prev.primaryId) {
      await tx
        .update(photos)
        .set({ isPrimary: true, isHidden: false, isEnsemblePart: false })
        .where(and(eq(photos.id, prev.primaryId), eq(photos.estateId, statement.estateId)));
    }
  });

  return estateSlugById(statement.estateId);
}

/** Повторно применить отозванную фото-правку. */
export async function redoPhotoEdit(statementId: string) {
  const [statement] = await db.select().from(statements).where(eq(statements.id, statementId)).limit(1);
  if (!statement || !isPhotoEditPredicate(statement.predicate)) return null;

  const record = parsePhotoEditRecord(statement.text);
  if (!record) {
    await db.update(statements).set({ status: "accepted" }).where(eq(statements.id, statementId));
    return estateSlugById(statement.estateId);
  }

  await db.transaction(async (tx) => {
    await tx.update(statements).set({ status: "accepted" }).where(eq(statements.id, statementId));
    const { action, photoId } = record;

    if (action === "hide") {
      await tx
        .update(photos)
        .set({ isHidden: true, isPrimary: false })
        .where(and(eq(photos.id, photoId), eq(photos.estateId, statement.estateId)));
      return;
    }

    if (action === "ensemble") {
      await tx
        .update(photos)
        .set({ isEnsemblePart: true, isPrimary: false, isHidden: false })
        .where(and(eq(photos.id, photoId), eq(photos.estateId, statement.estateId)));
      return;
    }

    if (action === "primary" || action === "add_main") {
      await tx.update(photos).set({ isPrimary: false }).where(eq(photos.estateId, statement.estateId));
      await tx
        .update(photos)
        .set({
          isPrimary: true,
          isEnsemblePart: false,
          isHidden: false,
        })
        .where(and(eq(photos.id, photoId), eq(photos.estateId, statement.estateId)));
      return;
    }

    if (action === "add_ensemble") {
      await tx
        .update(photos)
        .set({ isEnsemblePart: true, isPrimary: false, isHidden: false })
        .where(and(eq(photos.id, photoId), eq(photos.estateId, statement.estateId)));
      return;
    }

    if (action === "fill_ensemble" && record.filledIds) {
      for (const id of record.filledIds) {
        await tx
          .update(photos)
          .set({ isHidden: false, isEnsemblePart: true, isPrimary: false })
          .where(and(eq(photos.id, id), eq(photos.estateId, statement.estateId)));
      }
    }
  });

  return estateSlugById(statement.estateId);
}

async function estateSlugById(estateId: string) {
  const [estate] = await db.select({ slug: estates.slug }).from(estates).where(eq(estates.id, estateId)).limit(1);
  return estate?.slug ?? null;
}

const SKIP_CATEGORY_FILE =
  /герб|coat[_ ]of[_ ]arms|флаг|flag of|карта|locator|план|схема|logo|signature|автограф|\bmap\b/i;

/**
 * Добрать снимки частей ансамбля из категории Commons (P373 / sitelink).
 * Уже лежащие в карточке не трогаем; новые — в блок «части ансамбля».
 */
export async function fillEnsembleFromCommonsLogged(slug: string): Promise<{ slug: string; added: number } | null> {
  const [estate] = await db
    .select({ id: estates.id, slug: estates.slug, wikidataQid: estates.wikidataQid })
    .from(estates)
    .where(eq(estates.slug, slug))
    .limit(1);
  if (!estate?.wikidataQid) return null;

  const category = await commonsCategoryForQid(estate.wikidataQid);
  if (!category) return { slug: estate.slug, added: 0 };

  const filenames = await fetchCommonsCategoryFilenames(category);
  const existing = await db
    .select({ id: photos.id, url: photos.url })
    .from(photos)
    .where(eq(photos.estateId, estate.id));
  const known = new Set(existing.map((row) => photoFileKey(row.url)));

  const filledIds: string[] = [];
  let firstUrl = "";
  for (const filename of filenames) {
    if (SKIP_CATEGORY_FILE.test(filename)) continue;
    const kind = photoKind(filename);
    // В ансамбль — всё, кроме явного «сценного» мусора.
    if (kind === "scene") continue;
    const key = photoFileKey(filename);
    if (known.has(key)) continue;

    const encoded = encodeURIComponent(filename.replace(/ /g, "_"));
    const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encoded}?width=1600`;
    const sourceUrl = `https://commons.wikimedia.org/wiki/File:${encoded}`;

    const [inserted] = await db
      .insert(photos)
      .values({
        estateId: estate.id,
        url,
        sourceUrl,
        isPrimary: false,
        isEnsemblePart: true,
        isHidden: false,
        origin: "commons-ensemble",
      })
      .onConflictDoNothing({ target: [photos.estateId, photos.url] })
      .returning({ id: photos.id, url: photos.url });

    if (!inserted) continue;
    known.add(key);
    filledIds.push(inserted.id);
    if (!firstUrl) firstUrl = inserted.url;
  }

  if (filledIds.length > 0) {
    await insertPhotoEditStatement(estate.id, {
      v: 1,
      action: "fill_ensemble",
      photoId: filledIds[0]!,
      url: firstUrl,
      filledIds,
      prev: {
        isPrimary: false,
        isEnsemblePart: false,
        isHidden: true,
        primaryId: null,
        primaryUrl: null,
      },
    });
  }

  return { slug: estate.slug, added: filledIds.length };
}
