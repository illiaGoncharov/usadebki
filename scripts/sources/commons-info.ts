/**
 * Данные о файлах Commons и P18 из Wikidata для аудита фото.
 * Всё читающее, ничего не пишет в Wikimedia.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const USER_AGENT = "Usadebki/0.1 (local estate catalog; photo audit)";
const CACHE_FILE = path.join(process.cwd(), "data", "commons-info-cache-v2.json");

export type CommonsInfo = {
  description: string | null;
  /** Геометка файла (снимка или объекта). null — не задана. */
  coord: { lat: number; lng: number } | null;
  missing: boolean;
};

export function normalizeFileName(name: string) {
  let decoded = name;
  try {
    decoded = decodeURIComponent(name);
  } catch {
    // имя уже без процентного кодирования
  }
  return decoded.replace(/_/g, " ").trim().toLowerCase();
}

export function fileNameFromUrl(url: string) {
  const raw = url.includes("Special:FilePath/") ? (url.split("Special:FilePath/")[1]?.split("?")[0] ?? url) : url;
  try {
    return decodeURIComponent(raw).replace(/_/g, " ").trim();
  } catch {
    return raw.replace(/_/g, " ").trim();
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url: string, init: RequestInit = {}): Promise<unknown> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: { "User-Agent": USER_AGENT, ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(30000),
      });
      if (response.ok) return await response.json();
      if (![429, 502, 503, 504].includes(response.status)) throw new Error(`HTTP ${response.status}`);
      const retryAfter = Number(response.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 4000 * (attempt + 1));
    } catch (error) {
      if (attempt === 4) throw error;
      await sleep(2000 * (attempt + 1));
    }
  }
  throw new Error("нет ответа");
}

function stripHtml(value: string | undefined) {
  return (value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function readCache(): Promise<Record<string, CommonsInfo>> {
  try {
    return JSON.parse(await readFile(CACHE_FILE, "utf8")) as Record<string, CommonsInfo>;
  } catch {
    return {};
  }
}

async function writeCache(cache: Record<string, CommonsInfo>) {
  await mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await writeFile(CACHE_FILE, JSON.stringify(cache));
}

type Page = {
  title?: string;
  missing?: string;
  coordinates?: { lat: number; lon: number }[];
  imageinfo?: { extmetadata?: Record<string, { value?: string }> }[];
};

type CommonsResponse = {
  query?: {
    normalized?: { from: string; to: string }[];
    redirects?: { from: string; to: string }[];
    pages?: Record<string, Page>;
  };
};

/** Описания файлов Commons. Кэш в data/, повторный запуск не ходит в сеть за уже известным. */
export async function fetchCommonsInfo(
  filenames: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, CommonsInfo>> {
  const cache = await readCache();
  const result = new Map<string, CommonsInfo>();
  const todo: string[] = [];

  for (const name of new Set(filenames)) {
    const key = normalizeFileName(name);
    const cached = cache[key];
    if (cached) result.set(key, cached);
    else todo.push(name);
  }

  for (let offset = 0; offset < todo.length; offset += 40) {
    const batch = todo.slice(offset, offset + 40);
    const json = (await fetchJson(
      `https://commons.wikimedia.org/w/api.php?${new URLSearchParams({
        action: "query",
        format: "json",
        redirects: "1",
        prop: "imageinfo|coordinates",
        colimit: "max",
        iiprop: "extmetadata",
        iiextmetadatafilter: "ImageDescription|ObjectName",
        titles: batch.map((name) => `File:${name}`).join("|"),
      })}`,
    )) as CommonsResponse;

    const rename = new Map<string, string>();
    for (const item of json.query?.normalized ?? []) rename.set(item.from, item.to);
    for (const item of json.query?.redirects ?? []) rename.set(item.from, item.to);
    const byTitle = new Map<string, Page>();
    for (const page of Object.values(json.query?.pages ?? {})) {
      if (page.title) byTitle.set(page.title, page);
    }

    for (const name of batch) {
      let title = `File:${name}`;
      for (let hop = 0; hop < 3; hop += 1) {
        const next = rename.get(title);
        if (!next || next === title) break;
        title = next;
      }
      const page = byTitle.get(title);
      const meta = page?.imageinfo?.[0]?.extmetadata;
      const description = stripHtml(meta?.ImageDescription?.value) || stripHtml(meta?.ObjectName?.value) || null;
      const info: CommonsInfo = {
        description: description ? description.slice(0, 500) : null,
        coord: page?.coordinates?.[0]
          ? { lat: page.coordinates[0].lat, lng: page.coordinates[0].lon }
          : null,
        missing: !page || page.missing !== undefined,
      };
      const key = normalizeFileName(name);
      cache[key] = info;
      result.set(key, info);
    }

    onProgress?.(Math.min(offset + 40, todo.length), todo.length);
    if ((offset / 40) % 10 === 9) await writeCache(cache);
    await sleep(150);
  }

  if (todo.length > 0) await writeCache(cache);
  return result;
}

/**
 * P18 элементов Wikidata по номерам реестра: «картинка самого объекта», выбранная редакторами.
 * Возвращает номера реестра -> множество нормализованных имён файлов.
 */
export async function fetchWikidataImagesByReg(
  regNumbers: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>();
  const size = 80;

  for (let offset = 0; offset < regNumbers.length; offset += size) {
    const values = regNumbers
      .slice(offset, offset + size)
      .map((item) => `"${item.replace(/"/g, "")}"`)
      .join(" ");
    const query = `SELECT ?egrkn ?image WHERE { VALUES ?egrkn { ${values} } ?item wdt:P5381 ?egrkn ; wdt:P18 ?image . }`;
    const json = (await fetchJson("https://query.wikidata.org/sparql", {
      method: "POST",
      headers: { Accept: "application/sparql-results+json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ query }),
    })) as { results?: { bindings?: Record<string, { value?: string }>[] } };

    for (const row of json.results?.bindings ?? []) {
      const reg = row.egrkn?.value;
      const image = row.image?.value;
      if (!reg || !image) continue;
      const files = result.get(reg) ?? new Set<string>();
      files.add(normalizeFileName(fileNameFromUrl(image)));
      result.set(reg, files);
    }

    onProgress?.(Math.min(offset + size, regNumbers.length), regNumbers.length);
    await sleep(400);
  }

  return result;
}
