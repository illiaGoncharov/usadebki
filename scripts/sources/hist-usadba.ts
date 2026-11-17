/**
 * Карточки с hist-usadba.narod.ru (Алексей Лобунов).
 * Текст любительский: владельцы до 1917, архитектор, сохранность, место.
 * Реестровых номеров на сайте нет — сопоставление по названию и региону.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ConditionId } from "../../src/lib/labels";

const ROOT = "https://hist-usadba.narod.ru";
const USER_AGENT = "Usadebki/0.1 (local estate catalog; hist-usadba enrichment)";
const CACHE_DIR = path.join(process.cwd(), "data/hist-usadba/html");
const PAUSE_MS = 160;

const FIELD_LABELS = [
  "владельцы усадьбы",
  "владелец усадьбы",
  "владельцы:",
  "архитекторы усадьбы",
  "архитектор усадьбы",
  "архитектор:",
  "местоположение усадьбы",
  "местоположение, проезд",
  "местоположение:",
  "проезд:",
  "сохранность усадьбы",
  "сохранность:",
  "усадьбу посещали",
  "усадьбу посещал",
];

const NAME_STOP = new Set([
  "усадьба",
  "усадебный",
  "усадебная",
  "ансамбль",
  "комплекс",
  "объект",
  "парк",
  "парка",
  "парком",
  "дом",
  "дома",
  "дача",
  "имение",
  "дворец",
  "музей",
  "церковь",
  "флигель",
  "главный",
  "главного",
  "жилой",
  "городская",
  "сельская",
  "памятник",
  "постройка",
  "постройки",
  "служебный",
  "хозяйственный",
  "остатки",
  "руины",
]);

export type HistCard = {
  url: string;
  /** Как в оглавлении области. */
  title: string;
  regionLabel: string;
  ownersRaw: string | null;
  architectsRaw: string | null;
  location: string | null;
  preservation: string | null;
  visitors: string | null;
  owners: string[];
  architects: string[];
  condition: ConditionId | null;
};

export type EstateMatchRow = {
  id: string;
  canonicalEstateId: string | null;
  slug: string;
  name: string;
  regionName: string;
  address: string | null;
};

let fetchChain: Promise<void> = Promise.resolve();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeHtml(buf: Buffer) {
  const head = buf.subarray(0, 1200).toString("latin1").toLowerCase();
  if (head.includes("windows-1251") || head.includes("charset=cp1251")) {
    return new TextDecoder("windows-1251").decode(buf);
  }
  if (head.includes("koi8-r")) return new TextDecoder("koi8-r").decode(buf);
  return buf.toString("utf8");
}

function cachePath(url: string) {
  const file = new URL(url).pathname.split("/").pop() || "index.html";
  return path.join(CACHE_DIR, file);
}

/** Страница сайта. Повторный запуск читает data/hist-usadba/html. */
export async function fetchHistHtml(url: string): Promise<string | null> {
  await mkdir(CACHE_DIR, { recursive: true });
  const file = cachePath(url);
  try {
    return decodeHtml(await readFile(file));
  } catch {
    /* нет кэша */
  }

  const run = async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, redirect: "follow" });
        if (!response.ok) return null;
        const buf = Buffer.from(await response.arrayBuffer());
        if (buf.length < 400) return null;
        await writeFile(file, buf);
        return decodeHtml(buf);
      } catch (error) {
        lastError = error;
        await sleep(500 * (attempt + 1));
      }
    }
    console.warn("не скачалось", url, lastError instanceof Error ? lastError.message : lastError);
    return null;
  };

  const task = fetchChain.then(run, run);
  fetchChain = task.then(
    () => sleep(PAUSE_MS),
    () => sleep(PAUSE_MS),
  );
  return task;
}

function anchors(html: string) {
  const found: { href: string; text: string }[] = [];
  const re = /<a[^>]+href=["']?\s*([^"'>\s]+)\s*["']?[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(re)) {
    const text = match[2]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!text) continue;
    found.push({ href: match[1]!.trim(), text });
  }
  return found;
}

function absUrl(href: string) {
  if (!href || href.startsWith("mailto:") || href.startsWith("#") || href.startsWith("javascript:")) return null;
  try {
    const url = new URL(href, ROOT);
    if (!url.hostname.endsWith("hist-usadba.narod.ru")) return null;
    url.hash = "";
    url.search = "";
    return url.toString();
  } catch {
    return null;
  }
}

function isRegionIndex(text: string) {
  return /обл\.|область|край/i.test(text) || /^москва\b/i.test(text.trim());
}

function isEstateLink(href: string, text: string) {
  const file = href.split("/").pop()?.split("?")[0] ?? "";
  if (!file.endsWith(".html")) return false;
  if (file === "links.html" || /^links\d*-0\.html$/i.test(file)) return false;
  if (/^(index|map\d*|news|books|doska|hist-art|gb|links-art|links-oboi|castles|links-malross|links-belorus)/i.test(file)) {
    return false;
  }
  if (text.length < 2 || text.length > 90) return false;
  if (/обл\.|область|новости|статьи|обои|форум|отзыв|все усадьбы|исторические усадьбы/i.test(text)) return false;
  return true;
}

export async function listRegionIndexes() {
  const html = await fetchHistHtml(`${ROOT}/`);
  if (!html) throw new Error("Не открылась главная hist-usadba.narod.ru");
  const regions: { url: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const link of anchors(html)) {
    if (!isRegionIndex(link.text)) continue;
    const url = absUrl(link.href);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    regions.push({ url, label: link.text.replace(/\s+/g, " ").trim() });
  }
  return regions;
}

export async function listEstatesInRegion(indexUrl: string, regionLabel: string) {
  const html = await fetchHistHtml(indexUrl);
  if (!html) return [] as { url: string; title: string; regionLabel: string }[];
  const estates: { url: string; title: string; regionLabel: string }[] = [];
  const seen = new Set<string>();
  for (const link of anchors(html)) {
    if (!isEstateLink(link.href, link.text)) continue;
    const url = absUrl(link.href);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    estates.push({ url, title: link.text.replace(/\s+/g, " ").trim(), regionLabel });
  }
  return estates;
}

export function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d|td)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ");
}

function fieldValue(text: string, labels: string[]) {
  const low = text.toLowerCase();
  let start = -1;
  let label = "";
  for (const item of labels) {
    const at = low.indexOf(item);
    if (at >= 0 && (start < 0 || at < start)) {
      start = at;
      label = item;
    }
  }
  if (start < 0) return null;
  let from = start + label.length;
  while (text[from] === ":" || text[from] === " " || text[from] === "\n") from += 1;
  let end = text.length;
  const lowFrom = low;
  for (const other of FIELD_LABELS) {
    const at = lowFrom.indexOf(other, from);
    if (at > from && at < end) end = at;
  }
  const value = text.slice(from, end).replace(/\s+/g, " ").trim();
  if (!value || value.length < 2) return null;
  return value.slice(0, 1800);
}

const TITLE_PREFIX =
  /^(стольник|князь|княгиня|кн\.?|граф|графа|графиня|помещики|помещик|помещица|генерал-прокурор(?:\s+сената)?|генерал|прокурор|сенатор|тайный(?:\s+советник)?|действительный(?:\s+статский)?(?:\s+советник)?|статский(?:\s+советник)?|боярин|купец|купцы|дворяне|дворянин|род)\s+/i;

function stripDatesAndTitles(raw: string) {
  let text = raw.replace(/\s+/g, " ").trim();
  for (let step = 0; step < 4; step += 1) {
    const next = text
      .replace(/^(с|до|после|в|от|около|ок\.?)\s+/i, "")
      .replace(/^(конце|начале|середине)\s+/i, "")
      .replace(/^(?:x{0,3}(?:ix|iv|v?i{0,3})|\d{1,2})\s*в\.?\s*/i, "")
      .replace(/^\d{3,4}(?:\s*[-–—]\s*\d{2,4})?\s*(?:гг?\.?|год[ау]?|в\.?)?\s*/i, "")
      .trim();
    if (next === text) break;
    text = next;
  }
  for (let step = 0; step < 4; step += 1) {
    const next = text.replace(TITLE_PREFIX, "").trim();
    if (next === text) break;
    text = next;
  }
  return text.replace(/^[-–—:,\s]+/, "").trim();
}

const PERSON_RE =
  /[А-ЯЁ]\.(?:\s*[А-ЯЁ]\.)*\s*[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?|[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+){0,2}/;

function personFromClause(clause: string) {
  const cleaned = stripDatesAndTitles(clause);
  if (!cleaned || cleaned.length > 90) return null;
  if (/усадьб|район|сохран|архитект|местополож/i.test(cleaned)) return null;
  if (/\sи\s/i.test(cleaned) && /[А-ЯЁ]/.test(cleaned)) {
    return cleaned.replace(/\.$/, "");
  }
  const found = cleaned.match(PERSON_RE);
  if (!found) return null;
  const name = found[0].replace(/\s+/g, " ").replace(/\.$/, "").trim();
  if (name.length < 3) return null;
  if (/^(сената|усадьбы|района|века)$/i.test(name)) return null;
  if (/неизвест|не\s+установ|нет\s+данных/i.test(name)) return null;
  return name;
}

export function parsePeopleList(raw: string | null) {
  if (!raw) return [];
  const names: string[] = [];
  const seen = new Set<string>();
  for (const clause of raw.split(/[,;]/)) {
    const name = personFromClause(clause);
    if (!name) continue;
    const key = name.toLowerCase().replace(/ё/g, "е");
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    if (names.length >= 12) break;
  }
  return names;
}

export function conditionFromPreservation(text: string | null): ConditionId | null {
  if (!text) return null;
  const value = text.toLowerCase().replace(/ё/g, "е");
  if (/не сохрани|полностью утрач|утрачен[аы]|уничтожен|не существует|сгорел[аи]?\s+дотла/.test(value)) {
    return "lost";
  }
  if (/музей|отреставр|восстановлен/.test(value) && !/руин|разруш|развалин/.test(value)) return "restored";
  if (/руин|развалин|разруш|полуразруш/.test(value)) return "ruins";
  if (/заброш|запуст|аварийн/.test(value)) return "neglect";
  if (/хорошем состоян|отличн|используется|жилой дом|школ|больниц|санатор|в приличн/.test(value)) {
    return "in_use";
  }
  if (/восстановлен|реставрир/.test(value)) return "restored";
  return null;
}

export function parseEstateHtml(html: string, meta: { url: string; title: string; regionLabel: string }): HistCard | null {
  const text = htmlToText(html);
  const ownersRaw = fieldValue(text, ["владельцы усадьбы", "владелец усадьбы"]);
  const architectsRaw = fieldValue(text, ["архитекторы усадьбы", "архитектор усадьбы"]);
  const location = fieldValue(text, ["местоположение усадьбы", "местоположение, проезд", "местоположение:"]);
  const preservation = fieldValue(text, ["сохранность усадьбы", "сохранность:"]);
  const visitors = fieldValue(text, ["усадьбу посещали", "усадьбу посещал"]);
  if (!ownersRaw && !architectsRaw && !preservation && !location) return null;
  return {
    url: meta.url,
    title: meta.title,
    regionLabel: meta.regionLabel,
    ownersRaw,
    architectsRaw,
    location,
    preservation,
    visitors,
    owners: parsePeopleList(ownersRaw),
    architects: parsePeopleList(architectsRaw),
    condition: conditionFromPreservation(preservation),
  };
}

function significantWords(name: string) {
  return name
    .toLowerCase()
    .replace(/ё/g, "е")
    .split(/[^a-zа-я0-9-]+/i)
    .flatMap((part) => part.split("-"))
    .filter((word) => word.length >= 4 && !NAME_STOP.has(word));
}

function wordStem(word: string) {
  const stem = word.replace(/(скую|ского|ское|ская|ский|иных|ино|ина|ого|ему|ами|ых|ов|ев|ая|ое|ый|ий|ую)$/u, "");
  return stem.length >= 4 ? stem : word;
}

function wordsOverlap(left: string, right: string) {
  if (left === right) return 100;
  const a = wordStem(left);
  const b = wordStem(right);
  if (a.length >= 4 && a === b) return 86;
  if (left.length >= 6 && right.length >= 6 && (left.startsWith(right) || right.startsWith(left))) return 78;
  if (a.length >= 6 && b.length >= 6 && (a.startsWith(b) || b.startsWith(a))) return 74;
  return 0;
}

export function nameMatchScore(estateName: string, histTitle: string) {
  const estateWords = significantWords(estateName);
  const histWords = significantWords(histTitle);
  if (estateWords.length === 0 || histWords.length === 0) return 0;
  if (estateWords.join(" ") === histWords.join(" ")) return 100;
  if (estateWords.join(" ").includes(histWords.join(" "))) return 92;
  let best = 0;
  for (const histWord of histWords) {
    for (const estateWord of estateWords) {
      best = Math.max(best, wordsOverlap(estateWord, histWord));
    }
  }
  // Длинное название на сайте должно совпасть не одним случайным словом.
  if (histWords.length >= 2 && best < 100) {
    const hits = histWords.filter((histWord) => estateWords.some((estateWord) => wordsOverlap(estateWord, histWord) >= 74));
    if (hits.length >= 2) best = Math.max(best, 90);
    else if (hits.length === 1 && histWords.length >= 2) best = Math.min(best, 72);
  }
  return best;
}

function locationTokens(value: string | null | undefined) {
  if (!value) return [];
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .split(/[^a-zа-я0-9]+/i)
    .filter((word) => word.length >= 5 && !NAME_STOP.has(word) && word !== "район" && word !== "области" && word !== "область");
}

function locationScore(address: string | null, location: string | null) {
  const loc = locationTokens(location);
  if (loc.length === 0) return 0;
  const addr = new Set(locationTokens(address));
  let score = 0;
  for (const token of loc) {
    if (addr.has(token)) score += 2;
    else if ([...addr].some((item) => item.slice(0, 6) === token.slice(0, 6) && token.length >= 6)) score += 1;
  }
  return score;
}

export function regionsForLabel(label: string, regionNames: string[]) {
  const clean = label.replace(/\(.*$/, "").trim().toLowerCase().replace(/ё/g, "е");
  if (clean.startsWith("московск")) return regionNames.filter((name) => name.toLowerCase().includes("московск"));
  if (clean === "москва" || clean.startsWith("москва ")) {
    return regionNames.filter((name) => /москва/i.test(name) && !/московск/i.test(name));
  }
  const word = clean.split(/[^а-я]+/).find((item) => item.length >= 5) ?? "";
  const stem = word.slice(0, 6);
  if (stem.length < 5) return [];
  return regionNames.filter((name) => name.toLowerCase().replace(/ё/g, "е").includes(stem));
}

export function matchHistCard(card: HistCard, rows: EstateMatchRow[], regionNames: string[]) {
  const pool = rows.filter((row) => regionNames.includes(row.regionName));
  const ranked = pool
    .map((row) => ({
      row,
      score: nameMatchScore(row.name, card.title),
      place: locationScore(row.address, card.location),
    }))
    .filter((item) => item.score >= 74)
    .sort((a, b) => b.score - a.score || b.place - a.place);

  if (ranked.length === 0) return null;
  const best = ranked[0]!;
  const second = ranked[1];
  if (!second) return best.row;
  if (best.score >= second.score + 12) return best.row;
  if (best.place > second.place) return best.row;
  // Одинаковое имя в области и нет зацепки в адресе — не угадываем.
  return null;
}

/** Проверка на известной строке Авчурино, чтобы парсер не разъехался незаметно. */
export function assertOwnerParser() {
  const names = parsePeopleList(
    "Яковлевы, в конце 17в. стольник Ф.А. Хитрово, с 1716г. генерал-прокурор сената П.И. Ягужинский, с 1736г кн. Гагарин, с 1792г Полторацкие, 1911-1917гг. помещики Гончаровы.",
  );
  const expected = ["Яковлевы", "Ф.А. Хитрово", "П.И. Ягужинский", "Гагарин", "Полторацкие", "Гончаровы"];
  if (names.join("|") !== expected.join("|")) {
    throw new Error(`Парсер владельцев: ${names.join(", ")}`);
  }
}
