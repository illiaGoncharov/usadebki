import { and, eq, notExists } from "drizzle-orm";
import { db, sql as pg } from "../src/db";
import { estatePeople, estates, people, photos, sources } from "../src/db/schema";
import { photoKind, photoRank } from "../src/lib/photo";
import { stylesFromText, wikiStyleIds } from "../src/lib/reference";

const USER_AGENT = "Usadebki/0.1 (local estate catalog; research)";
const REGION = process.env.ENRICH_REGION ?? "50";

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
  if (process.env.MORE_PHOTOS === "1") {
    await fillMorePhotos();
    return;
  }
  if (process.env.PHOTOS_ONLY === "1") {
    await fillPhotos(process.env.ENRICH_REGION === "all" ? null : REGION);
    return;
  }
  if (process.env.SITELINKS_ONLY === "1") {
    await fillFromSitelinks(process.env.ENRICH_REGION === "all" ? null : REGION);
    return;
  }
  if (process.env.STYLES_ONLY === "1") {
    const regionId = process.env.ENRICH_REGION === "all" ? null : REGION;
    await fillStyles(regionId);
    await fillStylesFromText();
    return;
  }
  if (process.env.STYLE_TEXT_ONLY === "1") {
    await fillStylesFromText();
    return;
  }
  if (process.env.FACTS_ONLY === "1") {
    const regionId = process.env.ENRICH_REGION === "all" ? null : REGION;
    await fillStyles(regionId);
    await fillFromSitelinks(regionId);
    await fillStylesFromText();
    return;
  }
  const rows = await db.select().from(estates).where(eq(estates.regionId, REGION));
  console.log(`В регионе ${REGION}: ${rows.length} усадеб.`);
  if (rows.length === 0) return;

  const byReg = new Map(rows.map((row) => [row.egrknRegNumber, row]));
  const hits = new Map<string, Hit>();
  const numbers = [...byReg.keys()];
  for (let offset = 0; offset < numbers.length; offset += 25) {
    const batch = numbers.slice(offset, offset + 25);
    try {
      mergeHits(hits, await askWikidata(batch));
    } catch (error) {
      console.warn(`Пакет ${offset} не ответил:`, error instanceof Error ? error.message : error);
    }
    console.log(`  Wikidata ${Math.min(offset + 25, numbers.length)} / ${numbers.length}, совпало ${hits.size}`);
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
    if (!estate.createdDateText && hit.year) patch.createdDateText = hit.year;

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
    const added = await savePhotos(estate.id, hit.images);
    if (added) withPhoto += 1;
    await savePeople(estate.id, hit, wikidataSource);
  }

  console.log(`Совпало с Wikidata: ${hits.size}. С текстом из запроса: ${withText}. С новым фото: ${withPhoto}.`);
  await fillFromSitelinks(REGION);
}

async function fillPhotos(regionId: string | null) {
  const rows = await db
    .select({
      id: estates.id,
      reg: estates.egrknRegNumber,
      qid: estates.wikidataQid,
    })
    .from(estates)
    .where(
      and(
        regionId ? eq(estates.regionId, regionId) : undefined,
        notExists(db.select({ id: photos.id }).from(photos).where(eq(photos.estateId, estates.id))),
      ),
    );
  console.log(`Без фото: ${rows.length}.`);
  const byReg = new Map(rows.map((row) => [row.reg, row]));
  const images = new Map<string, { qid: string; file: string }>();

  const numbers = [...byReg.keys()];
  for (let offset = 0; offset < numbers.length; offset += 20) {
    const batch = numbers.slice(offset, offset + 20);
    try {
      const bindings = await askWikidataImages(batch);
      for (const row of bindings) {
        const reg = row.egrkn?.value;
        const image = row.image?.value;
        const item = row.item?.value;
        if (!reg || !image || !item || images.has(reg)) continue;
        images.set(reg, { qid: qidOf(item), file: image });
      }
    } catch (error) {
      console.warn(`Пакет ${offset} не ответил:`, error instanceof Error ? error.message : error);
    }
    console.log(`  снимки ${Math.min(offset + 20, numbers.length)} / ${numbers.length}, нашлось ${images.size}`);
    await sleep(350);
  }

  const pending: { estateId: string; qid: string; hadQid: boolean; file: ReturnType<typeof commonsFile> }[] = [];
  for (const [reg, image] of images) {
    const estate = byReg.get(reg);
    const file = commonsFile(image.file);
    if (!estate || !file) continue;
    pending.push({ estateId: estate.id, qid: image.qid, hadQid: Boolean(estate.qid), file });
  }

  const meta = await commonsMetaBatch(pending.flatMap((item) => (item.file ? [item.file.filename] : [])));
  let saved = 0;
  for (let offset = 0; offset < pending.length; offset += 40) {
    const batch = pending.slice(offset, offset + 40).flatMap((item) => {
      if (!item.file) return [];
      const about = meta.get(normalizeFile(item.file.filename)) ?? fallbackMeta();
      return [
        {
          estateId: item.estateId,
          url: item.file.display,
          author: about.author,
          license: about.license,
          isPrimary: photoKind(item.file.filename) !== "scene",
          sourceUrl: item.file.page,
          origin: "commons",
        },
      ];
    });
    if (batch.length > 0) {
      await db.insert(photos).values(batch).onConflictDoNothing({ target: [photos.estateId, photos.url] });
      saved += batch.length;
    }
    for (const item of pending.slice(offset, offset + 40)) {
      if (item.hadQid) continue;
      await db.update(estates).set({ wikidataQid: item.qid, updatedAt: new Date() }).where(eq(estates.id, item.estateId));
    }
  }
  console.log(`Новых фото: ${saved}.`);
}

const PHOTO_CAP = 8;

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
  console.log(`Снимки или категория: ${bags.size} усадеб.`);

  const stored = await db.select({ estateId: photos.estateId, url: photos.url }).from(photos);
  const have = new Map<string, Set<string>>();
  for (const row of stored) {
    const keys = have.get(row.estateId) ?? new Set<string>();
    keys.add(fileKey(row.url));
    have.set(row.estateId, keys);
  }

  const fresh: { estateId: string; file: NonNullable<ReturnType<typeof commonsFile>>; primary: boolean }[] = [];
  let looked = 0;
  for (const [reg, bag] of bags) {
    const estate = byReg.get(reg);
    if (!estate) continue;
    const known = have.get(estate.id) ?? new Set<string>();
    const room = PHOTO_CAP - known.size;
    if (room <= 0) continue;
    const hadPhoto = known.size > 0;
    const names = bag.files.flatMap((item) => {
      const file = commonsFile(item);
      return file ? [file.filename] : [];
    });
    if (names.length < PHOTO_CAP && bag.category) {
      try {
        names.push(...(await categoryFiles(bag.category)));
      } catch (error) {
        console.warn(`Категория «${bag.category}»:`, error instanceof Error ? error.message : error);
      }
      looked += 1;
      if (looked % 40 === 0) console.log(`  категории ${looked}`);
      await sleep(200);
    }
    const ranked = [...names].filter(isEstatePhoto).sort((a, b) => photoRank(photoKind(a)) - photoRank(photoKind(b)));
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
  console.log(`Дополнительных фото: ${saved}.`);
}

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

async function categoryFiles(category: string) {
  const response = await fetchRetry(
    `https://commons.wikimedia.org/w/api.php?${new URLSearchParams({
      action: "query",
      format: "json",
      list: "categorymembers",
      cmtitle: `Category:${category}`,
      cmtype: "file",
      cmlimit: "24",
    })}`,
    { headers: { "User-Agent": USER_AGENT } },
  );
  if (!response?.ok) return [];
  const json = (await response.json()) as { query?: { categorymembers?: { title?: string }[] } };
  return (json.query?.categorymembers ?? []).flatMap((item) => {
    const title = item.title?.replace(/^File:/, "").trim();
    return title ? [title] : [];
  });
}

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

async function fillStylesFromText() {
  const rows = await db
    .select({ id: estates.id, summary: estates.summary, wikiStyle: estates.wikiStyle })
    .from(estates);
  let saved = 0;
  for (const row of rows) {
    if (row.wikiStyle || !row.summary) continue;
    const styleIds = stylesFromText(row.summary);
    const styleId = styleIds[0];
    if (!styleId) continue;
    await db
      .update(estates)
      .set({ wikiStyle: styleId, wikiStyles: styleIds, updatedAt: new Date() })
      .where(eq(estates.id, row.id));
    saved += 1;
  }
  console.log(`Стилей по тексту Википедии: ${saved}.`);
}

async function fillStyles(regionId: string | null) {
  const rows = await db
    .select({ id: estates.id, reg: estates.egrknRegNumber, qid: estates.wikidataQid })
    .from(estates)
    .where(regionId ? eq(estates.regionId, regionId) : undefined);
  const byReg = new Map(rows.map((row) => [row.reg, row]));
  const found = new Map<string, { qid: string; styles: string[]; labels: string[] }>();
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
  console.log(`Wikidata знает стиль у ${found.size} наших усадеб.`);
  let saved = 0;
  const skipped: string[] = [];
  for (const [reg, hit] of found) {
    const estate = byReg.get(reg);
    const styleIds = wikiStyleIds(hit.styles, hit.labels);
    const styleId = styleIds[0];
    if (!estate || !styleId) {
      if (estate) skipped.push(`${reg}: ${hit.labels.join(", ") || hit.styles.join(", ")}`);
      continue;
    }
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
  if (skipped.length > 0) console.log(`Без нашего имени стиля:\n${skipped.join("\n")}`);
  console.log(`Стилей из Wikidata записано: ${saved}.`);
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

async function fillFromSitelinks(regionId: string | null) {
  const rows = await db
    .select({
      id: estates.id,
      qid: estates.wikidataQid,
      summary: estates.summary,
      summarySource: estates.summarySource,
    })
    .from(estates)
    .where(regionId ? eq(estates.regionId, regionId) : undefined);
  const todo = rows.filter((row) => row.qid && !row.summary && row.summarySource !== "human");
  let filled = 0;
  for (let offset = 0; offset < todo.length; offset += 40) {
    const batch = todo.slice(offset, offset + 40);
    const sitelinkUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${batch.map((row) => row.qid).join("|")}&props=sitelinks&sitefilter=ruwiki&format=json`;
    const response = await fetchRetry(sitelinkUrl, { headers: { "User-Agent": USER_AGENT } });
    if (!response || !response.ok) {
      console.warn(`Ссылки на статьи не отдались: ${response?.status ?? "нет ответа"}`);
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
    console.log(`  статьи ${Math.min(offset + 40, todo.length)} / ${todo.length}, текстов ${filled}`);
  }
  console.log(`Вступлений Википедии: ${filled}.`);
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

async function savePhotos(estateId: string, images: string[]) {
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
      origin: "commons",
    });
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
  // decodeURI не трогает запятую (%2C). Повторный encodeURIComponent даёт %252C, и файл не находится.
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
