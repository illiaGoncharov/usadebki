/**
 * Сколько PastVu-кадров наберётся для галереи (цель — 4 на карточке).
 *
 *   npm run pastvu:gallery -- --slug=ansambl-usadby-belkinyh-xviii-xix-vv-2-obekta-s-401620727670005
 *   npm run pastvu:gallery -- --region=40 --limit=20
 */
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { estates } from "../src/db/schema";
import { estateDisplayTitle } from "../src/lib/estate-display-name";
import { PASTVU_GALLERY_TARGET, pickPastVuForGallery } from "../src/lib/pastvu-gallery-pick";
import { pastVuSearchPages, pastVuSearchRadiusKm } from "../src/lib/pastvu-match";
import { fetchNearbyHistoricalPhotosPaged } from "../src/lib/pastvu";

const slugArg = process.argv.find((a) => a.startsWith("--slug="))?.split("=")[1];
const regionArg = process.argv.find((a) => a.startsWith("--region="))?.split("=")[1];
const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 50);

async function runOne(row: typeof estates.$inferSelect) {
  if (row.lat == null || row.lng == null) {
    console.log(`— ${row.slug}: нет координат`);
    return;
  }
  const { title } = estateDisplayTitle(row.name, row.wikipediaTitle);
  const ctx = {
    name: row.name,
    wikipediaTitle: row.wikipediaTitle,
    address: row.address,
    displayTitle: title,
    objectType: row.objectType,
    lat: row.lat,
    lng: row.lng,
  };
  const radiusKm = pastVuSearchRadiusKm(ctx);
  const pages = pastVuSearchPages(ctx);
  const raw = await fetchNearbyHistoricalPhotosPaged(row.lat, row.lng, radiusKm, pages);
  const gallery = pickPastVuForGallery(raw, ctx, { target: PASTVU_GALLERY_TARGET });
  console.log(
    `${gallery.length}/${PASTVU_GALLERY_TARGET} · ${row.slug.slice(0, 48)} · API ${raw.length} · R=${Math.round(radiusKm * 1000)}m p${pages}`,
  );
  for (const p of gallery) {
    console.log(`    ${p.cid} ${p.year ?? "?"} — ${(p.title ?? "").slice(0, 70)}`);
  }
}

async function main() {
  const rows = slugArg
    ? await db.select().from(estates).where(eq(estates.slug, slugArg))
    : await db
        .select()
        .from(estates)
        .where(regionArg ? eq(estates.regionId, regionArg) : undefined)
        .limit(limit);

  const withCoords = rows.filter((r) => r.lat != null && r.lng != null && r.canonicalEstateId == null);
  console.log(`Объектов: ${withCoords.length}. Цель галереи: ${PASTVU_GALLERY_TARGET}.\n`);

  for (const row of withCoords) {
    await runOne(row);
    await new Promise((r) => setTimeout(r, 120));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});