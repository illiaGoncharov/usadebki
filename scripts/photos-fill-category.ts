/**
 * Добор снимков здания из узкой категории Commons, если P18 — только парк/аллея.
 * Запуск: npm run photos:fill-category
 *   npm run photos:fill-category -- --slug=ansambl-dachi-zinoveva-usadba-bogoslovka-xviii-x-52
 */
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { estates, photos } from "../src/db/schema";
import { photoKind, photoRank } from "../src/lib/photo";
import { estateNameStems, fetchCommonsCategoryFiles, filenameMatchesEstate } from "./sources/commons-category";

const USER_AGENT = "Usadebki/0.1 (research)";
const SLUG = process.argv.find((a) => a.startsWith("--slug="))?.split("=")[1];

function commonsFromName(filename: string) {
  return {
    url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=1600`,
    page: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(filename)}`,
  };
}

function isEstatePhoto(filename: string) {
  if (!/\.(jpe?g|png|webp)$/i.test(filename)) return false;
  return !/герб|coat[_ ]of[_ ]arms|флаг|flag of|карта|locator|план|схема|logo|signature|автограф|\bmap\b/i.test(
    filename,
  );
}

async function wikidataCategory(qid: string): Promise<string | null> {
  const q = `
    SELECT ?cat WHERE {
      wd:${qid} wdt:P373 ?cat .
    }
    LIMIT 1
  `;
  const res = await fetch("https://query.wikidata.org/sparql", {
    method: "POST",
    headers: {
      Accept: "application/sparql-results+json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: new URLSearchParams({ query: q }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { results?: { bindings?: Array<{ cat?: { value: string } }> } };
  const uri = data.results?.bindings?.[0]?.cat?.value;
  if (!uri) return null;
  return decodeURIComponent(uri.split("/").pop() ?? "").replace(/_/g, " ");
}

async function main() {
  const baseQuery = db.select({
    id: estates.id,
    slug: estates.slug,
    name: estates.name,
    qid: estates.wikidataQid,
  }).from(estates);
  const rows = SLUG ? await baseQuery.where(eq(estates.slug, SLUG)) : await baseQuery;

  let added = 0;
  for (const estate of rows) {
    if (!estate.qid) continue;
    const category = await wikidataCategory(estate.qid);
    if (!category) continue;
    const catFiles = await fetchCommonsCategoryFiles(category);
    if (catFiles.length === 0 || catFiles.length > 15) continue;

    const stems = estateNameStems(estate.name);
    const picks = catFiles.filter((f) => {
      if (!isEstatePhoto(f)) return false;
      const kind = photoKind(f);
      if (kind !== "house" && kind !== "other") return false;
      return catFiles.length <= 12 || filenameMatchesEstate(f, stems);
    });

    const existing = await db.select({ url: photos.url }).from(photos).where(eq(photos.estateId, estate.id));
    const keys = new Set(existing.map((r) => r.url.split("FilePath/")[1]?.split("?")[0]?.toLowerCase()));

    for (const filename of picks) {
      const file = commonsFromName(filename);
      const key = encodeURIComponent(filename).toLowerCase();
      if (keys.has(key) || [...keys].some((k) => k && decodeURIComponent(k).includes(filename.toLowerCase()))) continue;
      await db
        .insert(photos)
        .values({
          estateId: estate.id,
          url: file.url,
          sourceUrl: file.page,
          origin: "commons",
          isPrimary: false,
        })
        .onConflictDoNothing({ target: [photos.estateId, photos.url] });
      console.log(`+ ${estate.slug}: ${filename} (${photoKind(filename)})`);
      added += 1;
    }
  }
  console.log(`Добавлено файлов: ${added}. Дальше: npm run photos:audit -- --slug=... --apply`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});