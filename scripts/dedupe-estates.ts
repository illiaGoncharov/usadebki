/**
 * Склейка дублей ЕГРОКН: один fingerprint → одна карточка в каталоге.
 *
 *   npm run dedupe:estates           — что изменится
 *   npm run dedupe:estates -- --apply
 *   npm run dedupe:estates -- --clear  — сбросить все canonical_estate_id
 */
import { eq, isNull, sql } from "drizzle-orm";
import { db } from "../src/db";
import { estates } from "../src/db/schema";
import { clusterDuplicateEstates, dedupeFingerprint, type EstateDedupeRow } from "../src/lib/estate-dedupe";

const APPLY = process.argv.includes("--apply");
const CLEAR = process.argv.includes("--clear");

async function main() {
  if (CLEAR && APPLY) {
    await db.update(estates).set({ canonicalEstateId: null }).where(sql`${estates.canonicalEstateId} is not null`);
    console.log("Сброшены все слияния (canonical_estate_id = null).");
    return;
  }

  const rows = await db
    .select({
      id: estates.id,
      slug: estates.slug,
      name: estates.name,
      regionId: estates.regionId,
      address: estates.address,
      lat: estates.lat,
      lng: estates.lng,
      wikipediaTitle: estates.wikipediaTitle,
      summary: estates.summary,
      wikidataQid: estates.wikidataQid,
      egrknRegNumber: estates.egrknRegNumber,
      canonicalEstateId: estates.canonicalEstateId,
    })
    .from(estates)
    .where(isNull(estates.canonicalEstateId));

  const active: EstateDedupeRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    regionId: r.regionId,
    address: r.address,
    lat: r.lat,
    lng: r.lng,
    wikipediaTitle: r.wikipediaTitle,
    summary: r.summary,
    wikidataQid: r.wikidataQid,
    egrknRegNumber: r.egrknRegNumber,
  }));

  const merges = clusterDuplicateEstates(active);
  const byCanon = new Map<string, { canon: (typeof rows)[number]; dups: (typeof rows)[number][] }>();

  for (const merge of merges) {
    const dup = rows.find((r) => r.id === merge.duplicateId);
    const canon = rows.find((r) => r.id === merge.canonicalId);
    if (!dup || !canon) continue;
    const bucket = byCanon.get(canon.slug) ?? { canon, dups: [] };
    bucket.dups.push(dup);
    byCanon.set(canon.slug, bucket);
  }

  console.log(`Групп слияния: ${byCanon.size}, дублей: ${merges.length}\n`);

  for (const { canon, dups } of byCanon.values()) {
    const fp = dedupeFingerprint(canon.regionId, canon.name, canon.address);
    console.log(`Каноническая: ${canon.name}`);
    console.log(`  slug: ${canon.slug} · рег. ${canon.egrknRegNumber}`);
    if (fp) console.log(`  fingerprint: ${fp}`);
    for (const d of dups) {
      console.log(`  → дубль: ${d.name}`);
      console.log(`    slug: ${d.slug} · рег. ${d.egrknRegNumber}`);
    }
    console.log("");
  }

  if (!APPLY) {
    console.log("Пробный запуск. Для записи в БД: npm run dedupe:estates -- --apply");
    return;
  }

  for (const merge of merges) {
    await db.update(estates).set({ canonicalEstateId: merge.canonicalId }).where(eq(estates.id, merge.duplicateId));
  }
  console.log(`Применено: ${merges.length} дублей помечены canonical_estate_id.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});