/**
 * Источник данных: списки объектов культурного наследия на Викивояже.
 * Формат: https://ru.wikivoyage.org/wiki/Культурное_наследие_России/...
 * 
 * Содержит: ЕГРОКН ID (knid), имя файла изображения, категорию Commons.
 */

const USER_AGENT = "Usadebki/0.1 (local estate catalog; research)";

export type WikivoyageHeritageItem = {
  knid: string; // ЕГРОКН регистрационный номер
  image?: string; // имя файла на Commons
  commonscat?: string; // категория Commons
};

/**
 * Загружает список объектов культурного наследия из Викивояжа для региона.
 * Возвращает Map: ЕГРОКН номер → данные объекта.
 */
export async function fetchWikivoyageHeritage(regionName: string): Promise<Map<string, WikivoyageHeritageItem>> {
  // API Викивояжа для получения содержимого страницы
  const pageTitle = `Культурное_наследие_России/${regionName}`;
  const apiUrl = `https://ru.wikivoyage.org/w/api.php?${new URLSearchParams({
    action: "query",
    format: "json",
    prop: "revisions",
    titles: pageTitle,
    rvprop: "content",
    rvslots: "main",
  })}`;

  const response = await fetch(apiUrl, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) return new Map();

  const json = (await response.json()) as {
    query?: {
      pages?: Record<string, {
        missing?: boolean;
        revisions?: Array<{ slots?: { main?: { "*"?: string } } }>;
      }>;
    };
  };

  const pages = json.query?.pages;
  if (!pages) return new Map();

  const pageData = Object.values(pages)[0];
  if (!pageData || pageData.missing) return new Map();

  const content = pageData.revisions?.[0]?.slots?.main?.["*"];
  if (!content) return new Map();

  return parseWikivoyageListing(content);
}

/**
 * Парсит содержимое страницы списка и извлекает объекты.
 * Викивояж использует шаблон {{listing}}, который содержит параметры.
 */
function parseWikivoyageListing(wikitext: string): Map<string, WikivoyageHeritageItem> {
  const result = new Map<string, WikivoyageHeritageItem>();

  // Шаблон {{listing | name=... | knid=... | image=... | commonscat=... }}
  const listingRegex = /\{\{listing\s*\|([^}]+)\}\}/gi;
  let match;

  while ((match = listingRegex.exec(wikitext)) !== null) {
    const params = parseTemplateParams(match[1]);
    const knid = params.get("knid")?.trim();
    
    if (!knid) continue;

    const item: WikivoyageHeritageItem = { knid };
    
    const image = params.get("image")?.trim();
    if (image) item.image = image.replace(/^File:/, "").replace(/^Файл:/, "");

    const commonscat = params.get("commonscat")?.trim();
    if (commonscat) item.commonscat = commonscat.replace(/^Category:/, "");

    result.set(knid, item);
  }

  return result;
}

/**
 * Парсит параметры wiki-шаблона вида "name=value | name2=value2"
 */
function parseTemplateParams(paramsText: string): Map<string, string> {
  const result = new Map<string, string>();
  const parts = paramsText.split("|");

  for (const part of parts) {
    const [key, ...valueParts] = part.split("=");
    if (!key) continue;
    
    const cleanKey = key.trim().toLowerCase();
    const value = valueParts.join("=").trim();
    
    if (value) result.set(cleanKey, value);
  }

  return result;
}

/**
 * Получает список всех регионов России, для которых есть страницы наследия.
 * Возвращает названия страниц (части после "Культурное_наследие_России/").
 */
export async function fetchWikivoyageRegionsList(): Promise<string[]> {
  const apiUrl = `https://ru.wikivoyage.org/w/api.php?${new URLSearchParams({
    action: "query",
    format: "json",
    list: "categorymembers",
    cmtitle: "Категория:Культурное_наследие_России",
    cmlimit: "500",
    cmtype: "page",
  })}`;

  const response = await fetch(apiUrl, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) return [];

  const json = (await response.json()) as {
    query?: {
      categorymembers?: Array<{ title?: string }>;
    };
  };

  const members = json.query?.categorymembers ?? [];
  const prefix = "Культурное наследие России/";
  
  return members
    .map((m) => m.title ?? "")
    .filter((title) => title.startsWith(prefix))
    .map((title) => title.slice(prefix.length))
    .filter((name) => name.length > 0);
}
