/**
 * Улучшенный скрипт обогащения усадеб фотографиями и текстами.
 * 
 * Источники фото (в порядке приоритета):
 * 1. Wikidata (P18) - прямые фото объектов
 * 2. Wikivoyage RU - списки наследия с изображениями и категориями
 * 3. Commons categories - дополнительные фото из категорий
 * 4. ЕГРОКН raw_json - официальные фото из реестра
 * 5. Фото частей ансамбля (fallback для объектов без фото)
 * 
 * Источники текста:
 * 1. Wikipedia RU (через Wikidata sitelinks)
 * 2. ЕГРОКН паспортные данные (краткая справка)
 * 
 * Поддержка всех регионов + rate limiting.
 */
import { and, eq, isNull, isNotNull, notExists, or } from "drizzle-orm";
import { db, sql as pg } from "../src/db";
import { estatePeople, estates, estateParts, people, photos, sources } from "../src/db/schema";
import { photoKind, photoRank } from "../src/lib/photo";
import { stylesFromText, wikiStyleIds } from "../src/lib/reference";
import { extractEgrknPassportData, generateReferenceText } from "./sources/egrkn-photos";
import { fetchWikivoyageHeritage } from "./sources/wikivoyage";

const USER_AGENT = "Usadebki/0.1 (local estate catalog; research)";
const REGION = process.env.ENRICH_REGION;
const PHOTO_CAP = 8;

type Hit = {
  qid: string;
  coord: { lat: number; lng: number } | null;
  images: string[];
  article: string | null;
  year: string | null;
  architects: PersonRef[];
  owners: PersonRef[];
};

type PersonRef = { qid: string | null; name: string };

async function main() {
  console.log("=== Обогащение усадеб: все источники ===\n");

  // Определяем регионы для обработки
  const regionFilter = REGION && REGION !== "all" ? REGION : null;
  const regions = regionFilter
    ? [{ id: regionFilter }]
    : await db
        .selectDistinct({ id: estates.regionId, name: estates.regionName })
        .from(estates)
        .orderBy(estates.regionId);

  console.log(`Регионов для обработки: ${regions.length}`);
  if (regionFilter) {
    console.log(`Фильтр: регион ${regionFilter}`);
  } else {
    console.log("Обрабатываются ВСЕ регионы");
  }
  console.log("");

  let totalWithPhoto = 0;
  let totalWithText = 0;
  let totalProcessed = 0;

  for (const region of regions) {
    console.log(`\n--- Регион ${region.id} ---`);
    
    const rows = await db
      .select()
      .from(estates)
      .where(eq(estates.regionId, region.id));

    if (rows.length === 0) {
      console.log("  Нет усадеб в регионе");
      continue;
    }

    console.log(`  Усадеб: ${rows.length}`);
    totalProcessed += rows.length;

    // 1. Обогащение из Wikidata
    const { withPhoto, withText } = await enrichFromWikidata(rows);
    totalWithPhoto += withPhoto;
    totalWithText += withText;

    // 2. Обогащение из Wikivoyage
    if (process.env.ENRICH_WIKIVOYAGE === "1") {
      const regionName = await db
        .select({ name: estates.regionName })
        .from(estates)
        .where(eq(estates.regionId, region.id))
        .limit(1);
      if (regionName[0]) {
        await enrichFromWikivoyage(rows, regionName[0].name);
      }
    }

    // 3. Обогащение из ЕГРОКН raw_json
    await enrichFromEgrkn(region.id);

    // 4. Дополнительные тексты из sitelinks (если есть QID, но нет статьи)
    await fillFromSitelinks(region.id);

    await sleep(500); // Пауза между регионами
  }

  console.log(`\n=== Итого ===`);
  console.log(`Обработано усадеб: ${totalProcessed}`);
  console.log(`Обогащено фотографиями: ${totalWithPhoto}`);
  console.log(`Обогащено текстами: ${totalWithText}`);

  // Финальные этапы для всех регионов
  console.log("\n--- Fallback: фото частей ансамблей ---");
  await enrichFromEnsembleParts();

  console.log("\n--- Дополнительные фото из категорий Commons ---");
  await fillMorePhotos();

  console.log("\n--- Стили из Wikidata ---");
  await fillStyles(regionFilter);

  console.log("\n--- Извлечение стилей из текстов ---");
  await fillStylesFromText();
}

/**
 * Обогащение из Wikidata: координаты, фото, статьи, архитекторы, владельцы.
 */
async function enrichFromWikidata(rows: Array<typeof estates.$inferSelect>) {
  const byReg = new Map(rows.map((row) => [row.egrknRegNumber, row]));
  const hits = new Map<string, Hit>();
  const numbers = [...byReg.keys()];

  console.log("  Запрос к Wikidata...");
  
  for (let offset = 0; offset < numbers.length; offset += 25) {
    const batch = numbers.slice(offset, offset + 25);
    try {
      mergeHits(hits, await askWikidata(batch));
    } catch (error) {
      console.warn(`    Пакет ${offset} не ответил:`, error instanceof Error ? error.message : error);
    }
    if ((offset + 25) % 100 === 0 || offset + 25 >= numbers.length) {
      console.log(`    ${Math.min(offset + 25, numbers.length)} / ${numbers.length}, совпало ${hits.size}`);
    }
    await sleep(300);
  }

  const wikidataSource = await sourceId("wikidata", "Wikidata", "https://www.wikidata.org/");
  let withPhoto = 0;
  let withText = 0;

  for (const [regNumber, hit] of hits) {
    const estate = byReg.get(regNumber);
    if (!estate) continue;

    const patch: Partial<typeof estates.$inferInsert> = {
      wikidataQid: hit.qid,
      updatedAt: new Date(),
    };

    if (estate.lat == null && hit.coord) {
      patch.lat = hit.coord.lat;
      patch.lng = hit.coord.lng;
    }

    if (!estate.createdDateText && hit.year) {
      patch.createdDateText = hit.year;
    }

    if (hit.article && (estate.summarySource == null || estate.summarySource === "wikipedia")) {
      const summary = await wikiSummary(hit.article);
      if (summary) {
        patch.summary = summary.extract;
        patch.summarySource = "wikipedia";
        patch.wikipediaTitle = summary.title;
        patch.wikipediaUrl = summary.url;
        withText += 1;
      }
      await sleep(120);
    }

    await db.update(estates).set(patch).where(eq(estates.id, estate.id));
    const added = await savePhotos(estate.id, hit.images, "commons");
    if (added) withPhoto += 1;
    await savePeople(estate.id, hit, wikidataSource);
  }

  console.log(`  Wikidata: ${hits.size} совпадений, ${withPhoto} фото, ${withText} текстов`);
  return { withPhoto, withText };
}

/**
 * Обогащение из Wikivoyage RU списков наследия.
 */
async function enrichFromWikivoyage(rows: Array<typeof estates.$inferSelect>, regionName: string) {
  console.log(`  Загрузка списка Wikivoyage для ${regionName}...`);
  
  let photosAdded = 0;
  
  try {
    const heritage = await fetchWikivoyageHeritage(regionName);
    
    if (heritage.size === 0) {
      console.log(`  Wikivoyage: страница не найдена или пустая`);
      return;
    }
    
    console.log(`  Wikivoyage: найдено ${heritage.size} объектов`);
    
    for (const estate of rows) {
      const item = heritage.get(estate.egrknRegNumber);
      if (!item) continue;
      
      // Проверяем, есть ли уже фото
      const hasPhoto = await db
        .select({ id: photos.id })
        .from(photos)
        .where(eq(photos.estateId, estate.id))
        .limit(1);
      
      if (hasPhoto.length > 0) continue;
      
      // Добавляем фото из Wikivoyage
      if (item.image) {
        const file = commonsFromName(item.image);
        const meta = await commonsMeta(file.filename);
        
        try {
          await db.insert(photos).values({
            estateId: estate.id,
            url: file.display,
            author: meta.author,
            license: meta.license,
            isPrimary: true,
            sourceUrl: file.page,
            origin: "wikivoyage",
          }).onConflictDoNothing({ target: [photos.estateId, photos.url] });
          photosAdded += 1;
        } catch {
          // Игнорируем ошибки
        }
        
        await sleep(100);
      }
    }
    
    if (photosAdded > 0) {
      console.log(`  Wikivoyage: ${photosAdded} фото`);
    }
  } catch (error) {
    console.warn(`  Wikivoyage ошибка:`, error instanceof Error ? error.message : error);
  }
}

/**
 * Обогащение из raw_json ЕГРОКН: главное фото и генерация справочного текста.
 */
async function enrichFromEgrkn(regionId: string) {
  let photosAdded = 0;
  let textsAdded = 0;

  // Перечитываем данные из БД, чтобы не затереть только что добавленные Wikipedia-тексты
  const rows = await db
    .select()
    .from(estates)
    .where(eq(estates.regionId, regionId));

  for (const estate of rows) {
    if (!estate.rawJson) continue;

    // Извлекаем паспортные данные
    const passportData = extractEgrknPassportData(estate.rawJson);

    // Добавляем фото, если его ещё нет
    const hasPhoto = await db
      .select({ id: photos.id })
      .from(photos)
      .where(eq(photos.estateId, estate.id))
      .limit(1);

    if (hasPhoto.length === 0 && passportData.mainPhoto) {
      try {
        await db.insert(photos).values({
          estateId: estate.id,
          url: passportData.mainPhoto.url,
          author: "ЕГРОКН",
          license: "Публичное достояние",
          isPrimary: true,
          sourceUrl: `https://opendata.mkrf.ru/opendata/7705851331-egrkn/`,
          origin: "egrkn",
        }).onConflictDoNothing({ target: [photos.estateId, photos.url] });
        photosAdded += 1;
      } catch {
        // Игнорируем другие ошибки
      }
    }

    // Генерируем справочный текст только если нет summary из других источников
    if (!estate.summary || estate.summarySource === null) {
      const refText = generateReferenceText(passportData);
      if (refText) {
        await db
          .update(estates)
          .set({
            summary: refText,
            summarySource: "egrkn-passport",
            updatedAt: new Date(),
          })
          .where(and(
            eq(estates.id, estate.id),
            or(isNull(estates.summary), isNull(estates.summarySource))
          ));
        textsAdded += 1;
      }
    }
  }

  if (photosAdded > 0 || textsAdded > 0) {
    console.log(`  ЕГРОКН: ${photosAdded} фото, ${textsAdded} справочных текстов`);
  }
}

/**
 * Fallback: использование фото частей ансамбля для усадеб без фото.
 */
async function enrichFromEnsembleParts() {
  const estatesWithoutPhotos = await db
    .select({
      estateId: estates.id,
      estateReg: estates.egrknRegNumber,
    })
    .from(estates)
    .where(
      notExists(
        db.select({ id: photos.id }).from(photos).where(eq(photos.estateId, estates.id))
      )
    );

  if (estatesWithoutPhotos.length === 0) return;

  console.log(`  Усадеб без фото: ${estatesWithoutPhotos.length}`);
  console.log("  Ищем фото частей ансамблей...");

  let inherited = 0;

  for (const estate of estatesWithoutPhotos) {
    // Находим части этого ансамбля
    const parts = await db
      .select({ egrknRegNumber: estateParts.egrknRegNumber })
      .from(estateParts)
      .where(eq(estateParts.estateId, estate.estateId));

    if (parts.length === 0) continue;

    const partRegs = parts.map((p) => p.egrknRegNumber);

    // Ищем фото частей в Wikidata
    for (let offset = 0; offset < partRegs.length; offset += 10) {
      const batch = partRegs.slice(offset, offset + 10);
      try {
        const bindings = await askWikidataImages(batch);
        for (const row of bindings) {
          const image = row.image?.value;
          if (!image) continue;

          const file = commonsFile(image);
          if (!file) continue;

          const meta = await commonsMeta(file.filename);
          
          try {
            await db.insert(photos).values({
              estateId: estate.estateId,
              url: file.display,
              author: meta.author,
              license: meta.license,
              isPrimary: true,
              sourceUrl: file.page,
              origin: "commons-ensemble",
              isEnsemblePart: true, // Помечаем как фото части ансамбля
              depictsEgrknNumber: row.egrkn?.value ?? null, // Сохраняем номер части
            });
            inherited += 1;
            break; // Хватит одного фото от части
          } catch {
            // Игнорируем дубликаты
          }
        }
      } catch (error) {
        console.warn(`    Ошибка при поиске фото частей:`, error instanceof Error ? error.message : error);
      }
      await sleep(300);
    }
  }

  if (inherited > 0) {
    console.log(`  Унаследовано фото от частей ансамблей: ${inherited}`);
  }
}

/**
 * Дополнительные фото из категорий Commons (из оригинального скрипта).
 */
async function fillMorePhotos() {
  const rows = await db
    .select({ id: estates.id, reg: estates.egrknRegNumber })
    .from(estates);
  
  const byReg = new Map(rows.map((row) => [row.reg, row]));
  const bags = new Map<string, { files: string[]; category: string | null }>();
  
  const remember = (reg: string) => {
    const bag = bags.get(reg) ?? { files: [], category: null };
    bags.set(reg, bag);
    return bag;
  };

  for (const row of await askPhotoClaims()) {
    const reg = row.egrkn?.value;
    if (!reg || !byReg.has(reg)) continue;
    const bag = remember(reg);
    const image = row.image?.value;
    if (image && !bag.files.includes(image)) bag.files.push(image);
    const category = row.cat?.value?.trim();
    if (category && !bag.category) bag.category = category;
  }

  console.log(`  Объектов с категориями Commons: ${bags.size}`);

  const stored = await db.select({ estateId: photos.estateId, url: photos.url }).from(photos);
  const have = new Map<string, Set<string>>();
  for (const row of stored) {
    const keys = have.get(row.estateId) ?? new Set<string>();
    keys.add(fileKey(row.url));
    have.set(row.estateId, keys);
  }

  const fresh: { estateId: string; file: NonNullable<ReturnType<typeof commonsFile>>; primary: boolean }[] = [];

  for (const [reg, bag] of bags) {
    const estate = byReg.get(reg);
    if (!estate) continue;
    const known = have.get(estate.id) ?? new Set<string>();
    const room = PHOTO_CAP - known.size;
    if (room <= 0) continue;
    const hadPhoto = known.size > 0;
    
    // ТОЛЬКО прямые P18 фото из Wikidata, НЕ берём все из категории
    // (категория может быть для ансамбля и содержать фото других объектов)
    const names = bag.files.flatMap((item) => {
      const file = commonsFile(item);
      return file ? [file.filename] : [];
    });

    // УДАЛЕНО: categoryFiles(bag.category) - это небезопасно!
    // Если нужны фото из категории, они должны быть отфильтрованы по depicts/coordinates

    const ranked = [...names]
      .filter(isEstatePhoto)
      .sort((a, b) => photoRank(photoKind(a)) - photoRank(photoKind(b)));
    
    for (const filename of ranked) {
      if (known.size >= PHOTO_CAP) break;
      const key = fileKey(filename);
      if (known.has(key)) continue;
      const file = commonsFromName(filename);
      known.add(key);
      fresh.push({
        estateId: estate.id,
        file,
        primary: !hadPhoto && photoKind(filename) !== "scene" && !fresh.some((item) => item.estateId === estate.id && item.primary),
      });
    }
    have.set(estate.id, known);
  }

  const meta = await commonsMetaBatch(fresh.map((item) => item.file.filename));
  let saved = 0;

  for (let offset = 0; offset < fresh.length; offset += 40) {
    const batch = fresh.slice(offset, offset + 40).map((item) => {
      const about = meta.get(normalizeFile(item.file.filename)) ?? fallbackMeta();
      return {
        estateId: item.estateId,
        url: item.file.display,
        author: about.author,
        license: about.license,
        isPrimary: item.primary,
        sourceUrl: item.file.page,
        origin: "commons",
      };
    });
    if (batch.length > 0) {
      await db.insert(photos).values(batch).onConflictDoNothing({ target: [photos.estateId, photos.url] });
      saved += batch.length;
    }
  }

  console.log(`  Дополнительных фото из категорий: ${saved}`);
}

async function fillFromSitelinks(regionId: string | null) {
  const rows = await db
    .select({
      id: estates.id,
      qid: estates.wikidataQid,
      summary: estates.summary,
      summarySource: estates.summarySource,
    })
    .from(estates)
    .where(
      and(
        regionId ? eq(estates.regionId, regionId) : undefined,
        isNotNull(estates.wikidataQid),
        or(isNull(estates.summary), eq(estates.summarySource, "wikipedia"))
      )
    );

  const todo = rows.filter((row) => row.qid && !row.summary);
  if (todo.length === 0) return;

  let filled = 0;
  for (let offset = 0; offset < todo.length; offset += 40) {
    const batch = todo.slice(offset, offset + 40);
    const sitelinkUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${batch.map((row) => row.qid).join("|")}&props=sitelinks&sitefilter=ruwiki&format=json`;
    const response = await fetchRetry(sitelinkUrl, { headers: { "User-Agent": USER_AGENT } });
    if (!response || !response.ok) {
      console.warn(`  Ссылки на статьи не отдались: ${response?.status ?? "нет ответа"}`);
      continue;
    }
    const json = (await response.json()) as {
      entities?: Record<string, { sitelinks?: { ruwiki?: { title?: string } } }>;
    };
    for (const row of batch) {
      const title = row.qid ? json.entities?.[row.qid]?.sitelinks?.ruwiki?.title : undefined;
      if (!title) continue;
      const summary = await wikiSummaryTitle(title);
      if (!summary) continue;
      await db
        .update(estates)
        .set({
          summary: summary.extract,
          summarySource: "wikipedia",
          wikipediaTitle: summary.title,
          wikipediaUrl: summary.url,
          updatedAt: new Date(),
        })
        .where(eq(estates.id, row.id));
      filled += 1;
      await sleep(250);
    }
    if ((offset + 40) % 200 === 0 || offset + 40 >= todo.length) {
      console.log(`    ${Math.min(offset + 40, todo.length)} / ${todo.length}, текстов ${filled}`);
    }
  }
  if (filled > 0) {
    console.log(`  Вступлений Википедии через sitelinks: ${filled}`);
  }
}

async function fillStyles(regionId: string | null) {
  const rows = await db
    .select({ id: estates.id, reg: estates.egrknRegNumber, qid: estates.wikidataQid })
    .from(estates)
    .where(regionId ? eq(estates.regionId, regionId) : undefined);

  const byReg = new Map(rows.map((row) => [row.reg, row]));
  const found = new Map<string, { qid: string; styles: string[]; labels: string[] }>();

  console.log(`  Запрос стилей из Wikidata...`);
  for (const row of await askAllStyles()) {
    const reg = row.egrkn?.value;
    const item = row.item?.value;
    const style = row.style?.value;
    if (!reg || !item || !style || !byReg.has(reg)) continue;
    const hit = found.get(reg) ?? { qid: qidOf(item), styles: [], labels: [] };
    const qid = qidOf(style);
    if (!hit.styles.includes(qid)) hit.styles.push(qid);
    const label = row.styleLabel?.value;
    if (label && !label.startsWith("Q") && !hit.labels.includes(label)) hit.labels.push(label);
    found.set(reg, hit);
  }

  console.log(`  Wikidata знает стиль у ${found.size} усадеб`);
  let saved = 0;

  for (const [reg, hit] of found) {
    const estate = byReg.get(reg);
    const styleIds = wikiStyleIds(hit.styles, hit.labels);
    const styleId = styleIds[0];
    if (!estate || !styleId) continue;

    await db
      .update(estates)
      .set({
        wikiStyle: styleId,
        wikiStyles: styleIds,
        ...(estate.qid ? {} : { wikidataQid: hit.qid }),
        updatedAt: new Date(),
      })
      .where(eq(estates.id, estate.id));
    saved += 1;
  }

  if (saved > 0) {
    console.log(`  Стилей из Wikidata записано: ${saved}`);
  }
}

async function askAllStyles() {
  const query = `
    SELECT ?item ?egrkn ?style ?styleLabel WHERE {
      ?item wdt:P5381 ?egrkn ;
            wdt:P149 ?style .
      SERVICE wikibase:label { bd:serviceParam wikibase:language "ru,en". }
    }
  `;
  let response: Response | null = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    response = await fetch("https://query.wikidata.org/sparql", {
      method: "POST",
      headers: {
        Accept: "application/sparql-results+json",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
      },
      body: new URLSearchParams({ query }),
    });
    if (response.status !== 429 && response.status !== 502 && response.status !== 503) break;
    const retryAfter = Number(response.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 8000 * (attempt + 1));
  }
  if (!response || !response.ok) throw new Error(`Wikidata ${response?.status ?? "нет ответа"}`);
  const json = (await response.json()) as {
    results?: { bindings?: Record<string, { value?: string }>[] };
  };
  return json.results?.bindings ?? [];
}

async function fillStylesFromText() {
  const rows = await db
    .select({ id: estates.id, summary: estates.summary, wikiStyle: estates.wikiStyle })
    .from(estates)
    .where(and(isNull(estates.wikiStyle), isNotNull(estates.summary)));
  
  let saved = 0;
  for (const row of rows) {
    if (!row.summary) continue;
    const styleIds = stylesFromText(row.summary);
    const styleId = styleIds[0];
    if (!styleId) continue;
    await db
      .update(estates)
      .set({ wikiStyle: styleId, wikiStyles: styleIds, updatedAt: new Date() })
      .where(eq(estates.id, row.id));
    saved += 1;
  }
  if (saved > 0) {
    console.log(`  Стилей извлечено из текстов: ${saved}`);
  }
}

// ===== Вспомогательные функции из оригинального скрипта =====

async function askPhotoClaims() {
  const query = `
    SELECT ?egrkn ?image ?cat WHERE {
      ?item wdt:P5381 ?egrkn .
      OPTIONAL { ?item wdt:P18 ?image }
      OPTIONAL { ?item wdt:P373 ?cat }
      FILTER(BOUND(?image) || BOUND(?cat))
    }
  `;
  const response = await fetchRetry("https://query.wikidata.org/sparql", {
    method: "POST",
    headers: {
      Accept: "application/sparql-results+json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: new URLSearchParams({ query }),
  });
  if (!response?.ok) throw new Error(`Wikidata ${response?.status ?? "нет ответа"}`);
  const json = (await response.json()) as {
    results?: { bindings?: Record<string, { value?: string }>[] };
  };
  return json.results?.bindings ?? [];
}

// УДАЛЕНО: categoryFiles брал все фото из категории без проверки depicts
// Это приводило к прикреплению фото других объектов (баг с желтым зданием)
// Для безопасного использования категорий нужна проверка через SDC (depicts/coordinates)
// см. scripts/sources/commons-structured-data.ts

function commonsFromName(filename: string) {
  return {
    filename,
    display: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=1600`,
    page: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(filename)}`,
  };
}

function fileKey(value: string) {
  const raw = value.includes("Special:FilePath/") ? (value.split("Special:FilePath/")[1]?.split("?")[0] ?? value) : value;
  return decodeURIComponent(raw).replace(/_/g, " ").trim().toLowerCase();
}

function isEstatePhoto(filename: string) {
  if (!/\.(jpe?g|png|webp)$/i.test(filename)) return false;
  return !/герб|coat[_ ]of[_ ]arms|флаг|flag of|карта|locator|план|схема|logo|icon|signature|автограф/i.test(filename);
}

async function askWikidataImages(regNumbers: string[]) {
  const values = regNumbers.map((item) => `"${item.replace(/"/g, "")}"`).join(" ");
  const query = `
    SELECT ?item ?egrkn ?image WHERE {
      VALUES ?egrkn { ${values} }
      ?item wdt:P5381 ?egrkn ;
            wdt:P18 ?image .
    }
  `;
  let response: Response | null = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    response = await fetch("https://query.wikidata.org/sparql", {
      method: "POST",
      headers: {
        Accept: "application/sparql-results+json",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
      },
      body: new URLSearchParams({ query }),
    });
    if (response.status !== 429) break;
    const retryAfter = Number(response.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 4000 * (attempt + 1));
  }
  if (!response || !response.ok) throw new Error(`Wikidata ${response?.status ?? "нет ответа"}`);
  const json = (await response.json()) as {
    results?: { bindings?: Record<string, { value?: string }>[] };
  };
  return json.results?.bindings ?? [];
}

async function commonsMetaBatch(filenames: string[]) {
  const found = new Map<string, { author: string; license: string }>();
  for (let offset = 0; offset < filenames.length; offset += 40) {
    const titles = filenames.slice(offset, offset + 40).map((name) => `File:${name}`).join("|");
    let response: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      response = await fetch(
        `https://commons.wikimedia.org/w/api.php?${new URLSearchParams({
          action: "query",
          format: "json",
          redirects: "1",
          prop: "imageinfo",
          iiprop: "extmetadata",
          titles,
        })}`,
        { headers: { "User-Agent": USER_AGENT } },
      );
      if (response.status !== 429) break;
      await sleep(3000 * (attempt + 1));
    }
    if (!response?.ok) continue;
    const json = (await response.json()) as {
      query?: {
        pages?: Record<string, { title?: string; imageinfo?: { extmetadata?: Record<string, { value?: string }> }[] }>;
      };
    };
    for (const page of Object.values(json.query?.pages ?? {})) {
      const title = page.title?.replace(/^File:/, "") ?? "";
      const meta = page.imageinfo?.[0]?.extmetadata;
      if (!title) continue;
      found.set(normalizeFile(title), {
        author: stripHtml(meta?.Artist?.value) || "Wikimedia Commons",
        license: stripHtml(meta?.LicenseShortName?.value) || "см. страницу файла",
      });
    }
    await sleep(200);
  }
  return found;
}

function normalizeFile(name: string) {
  return decodeURIComponent(name).replace(/_/g, " ").trim().toLowerCase();
}

async function askWikidata(regNumbers: string[]) {
  const values = regNumbers.map((item) => `"${item.replace(/"/g, "")}"`).join(" ");
  const query = `
    SELECT ?item ?egrkn ?coord ?image ?article ?inception ?architect ?architectLabel ?owner ?ownerLabel WHERE {
      VALUES ?egrkn { ${values} }
      ?item wdt:P5381 ?egrkn .
      OPTIONAL { ?item wdt:P625 ?coord }
      OPTIONAL { ?item wdt:P18 ?image }
      OPTIONAL { ?item wdt:P571 ?inception }
      OPTIONAL { ?item wdt:P84 ?architect }
      OPTIONAL { ?item wdt:P127 ?owner }
      OPTIONAL {
        ?article schema:about ?item ;
                 schema:isPartOf <https://ru.wikipedia.org/> .
      }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "ru,en". }
    }
  `;
  const response = await fetch("https://query.wikidata.org/sparql", {
    method: "POST",
    headers: {
      Accept: "application/sparql-results+json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: new URLSearchParams({ query }),
  });
  if (!response.ok) throw new Error(`Wikidata ${response.status}`);
  const json = (await response.json()) as {
    results?: { bindings?: Record<string, { value?: string }>[] };
  };
  return json.results?.bindings ?? [];
}

function mergeHits(hits: Map<string, Hit>, bindings: Record<string, { value?: string }>[]) {
  for (const row of bindings) {
    const reg = row.egrkn?.value;
    const item = row.item?.value;
    if (!reg || !item) continue;
    const hit = hits.get(reg) ?? {
      qid: qidOf(item),
      coord: null,
      images: [],
      article: null,
      year: null,
      architects: [],
      owners: [],
    };
    hit.qid = qidOf(item);
    if (!hit.coord && row.coord?.value) hit.coord = parsePoint(row.coord.value);
    if (row.image?.value && !hit.images.includes(row.image.value) && hit.images.length < 3) {
      hit.images.push(row.image.value);
    }
    if (!hit.article && row.article?.value) hit.article = row.article.value;
    if (!hit.year && row.inception?.value) hit.year = yearOf(row.inception.value);
    pushPerson(hit.architects, row.architect?.value, row.architectLabel?.value);
    pushPerson(hit.owners, row.owner?.value, row.ownerLabel?.value);
    hits.set(reg, hit);
  }
}

function pushPerson(list: PersonRef[], uri: string | undefined, label: string | undefined) {
  const name = label?.trim();
  if (!name || name.startsWith("Q")) return;
  const qid = uri ? qidOf(uri) : null;
  if (list.some((item) => item.name === name)) return;
  list.push({ qid, name });
}

async function wikiSummary(articleUrl: string) {
  const title = decodeURIComponent(articleUrl.split("/wiki/")[1] ?? "").replace(/_/g, " ");
  if (!title) return null;
  return wikiSummaryTitle(title);
}

async function fetchRetry(url: string, init: RequestInit) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
      if (response.status !== 429 && response.status !== 502 && response.status !== 503) return response;
      const retryAfter = Number(response.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 4000 * (attempt + 1));
    } catch (error) {
      console.warn(`Сеть: ${error instanceof Error ? error.message : error}`);
      await sleep(2000 * (attempt + 1));
    }
  }
  return null;
}

async function wikiSummaryTitle(title: string) {
  const response = await fetchRetry(`https://ru.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!response || !response.ok) return null;
  const json = (await response.json()) as {
    type?: string;
    extract?: string;
    title?: string;
    content_urls?: { desktop?: { page?: string } };
  };
  if (json.type === "disambiguation") return null;
  const extract = json.extract?.trim();
  if (!extract || extract.length < 40) return null;
  return {
    extract: extract.slice(0, 2500),
    title: json.title ?? title,
    url:
      json.content_urls?.desktop?.page ??
      `https://ru.wikipedia.org/wiki/${encodeURIComponent((json.title ?? title).replace(/ /g, "_"))}`,
  };
}

async function savePhotos(estateId: string, images: string[], origin: string) {
  const existing = await db
    .select({ url: photos.url, isPrimary: photos.isPrimary })
    .from(photos)
    .where(eq(photos.estateId, estateId));
  const known = new Set(existing.map((row) => row.url));
  let hasPrimary = existing.some((row) => row.isPrimary);
  let added = false;
  for (const image of images) {
    const file = commonsFile(image);
    if (!file || known.has(file.display)) continue;
    const meta = await commonsMeta(file.filename);
    await db.insert(photos).values({
      estateId,
      url: file.display,
      author: meta.author,
      license: meta.license,
      isPrimary: !hasPrimary,
      sourceUrl: file.page,
      origin,
    }).onConflictDoNothing({ target: [photos.estateId, photos.url] });
    known.add(file.display);
    hasPrimary = true;
    added = true;
    await sleep(80);
  }
  return added;
}

async function savePeople(estateId: string, hit: Hit, sourceIdValue: string) {
  await db
    .delete(estatePeople)
    .where(and(eq(estatePeople.estateId, estateId), eq(estatePeople.origin, "wikidata")));
  for (const person of hit.owners) {
    await linkPerson(estateId, person, "owner", sourceIdValue);
  }
  for (const person of hit.architects) {
    await linkPerson(estateId, person, "architect", sourceIdValue);
  }
}

async function linkPerson(estateId: string, person: PersonRef, role: string, sourceIdValue: string) {
  const personId = await findPerson(person);
  await db.insert(estatePeople).values({
    estateId,
    personId,
    role,
    sourceId: sourceIdValue,
    origin: "wikidata",
  });
}

async function findPerson(person: PersonRef) {
  if (person.qid) {
    const [found] = await db
      .select({ id: people.id })
      .from(people)
      .where(eq(people.wikidataQid, person.qid))
      .limit(1);
    if (found) return found.id;
  }
  const [created] = await db
    .insert(people)
    .values({ name: person.name, wikidataQid: person.qid })
    .returning({ id: people.id });
  if (!created) throw new Error("Не записал человека");
  return created.id;
}

async function sourceId(type: string, title: string, url: string) {
  const [found] = await db.select({ id: sources.id }).from(sources).where(eq(sources.title, title)).limit(1);
  if (found) return found.id;
  const [created] = await db.insert(sources).values({ type, title, url }).returning({ id: sources.id });
  if (!created) throw new Error("Не записал источник");
  return created.id;
}

function commonsFile(raw: string) {
  const marker = "/Special:FilePath/";
  const index = raw.indexOf(marker);
  if (index === -1) return null;
  const filename = decodeFileName(raw.slice(index + marker.length).split("?")[0] ?? "");
  if (!filename) return null;
  return {
    filename,
    display: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=1600`,
    page: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(filename)}`,
  };
}

function decodeFileName(value: string) {
  let filename = value.trim();
  for (let step = 0; step < 3; step += 1) {
    try {
      const next = decodeURIComponent(filename);
      if (next === filename) break;
      filename = next;
    } catch {
      break;
    }
  }
  return filename;
}

async function commonsMeta(filename: string) {
  try {
    const response = await fetch(
      `https://commons.wikimedia.org/w/api.php?action=query&format=json&redirects=1&prop=imageinfo&iiprop=extmetadata&titles=${encodeURIComponent(`File:${filename}`)}`,
      { headers: { "User-Agent": USER_AGENT } },
    );
    if (!response.ok) return fallbackMeta();
    const json = (await response.json()) as {
      query?: { pages?: Record<string, { imageinfo?: { extmetadata?: Record<string, { value?: string }> }[] }> };
    };
    const page = Object.values(json.query?.pages ?? {})[0];
    const meta = page?.imageinfo?.[0]?.extmetadata;
    return {
      author: stripHtml(meta?.Artist?.value) || "Wikimedia Commons",
      license: stripHtml(meta?.LicenseShortName?.value) || "см. страницу файла",
    };
  } catch {
    return fallbackMeta();
  }
}

function fallbackMeta() {
  return { author: "Wikimedia Commons", license: "см. страницу файла" };
}

function stripHtml(value: string | undefined) {
  return (value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function parsePoint(value: string) {
  const match = value.match(/Point\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
  if (!match) return null;
  const lng = Number(match[1]);
  const lat = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < 41 || lat > 82 || lng < 19 || lng > 192) return null;
  return { lat, lng };
}

function yearOf(value: string) {
  const match = value.match(/(\d{3,4})/);
  if (!match) return null;
  const year = Number(match[1]);
  if (year < 1400 || year > 2100) return null;
  return String(year);
}

function qidOf(uri: string) {
  return uri.split("/").pop() ?? uri;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => pg.end({ timeout: 5 }));
