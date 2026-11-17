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
 * Викивояж использует шаблоны {{listing}} или {{cultural-heritage-inline}}.
 */
function parseWikivoyageListing(wikitext: string): Map<string, WikivoyageHeritageItem> {
  const result = new Map<string, WikivoyageHeritageItem>();

  // Шаблон {{listing | name=... | knid=... | image=... | commonscat=... }}
  // или {{cultural-heritage-inline|...}}
  const patterns = [
    /\{\{listing\s*\|([^}]+)\}\}/gi,
    /\{\{cultural-heritage-inline\s*\|([^}]+)\}\}/gi,
    /\{\{культурное наследие строкой\s*\|([^}]+)\}\}/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(wikitext)) !== null) {
      const params = parseTemplateParams(match[1]);
      
      // knid или регистрационный номер
      const knid = params.get("knid")?.trim() || params.get("регистрационный номер")?.trim();
      if (!knid) continue;

      const existing = result.get(knid);
      const item: WikivoyageHeritageItem = existing || { knid };
      
      // Изображение
      const image = params.get("image")?.trim() || params.get("изображение")?.trim();
      if (image && !item.image) {
        item.image = image.replace(/^File:/, "").replace(/^Файл:/, "");
      }

      // Категория Commons
      const commonscat = params.get("commonscat")?.trim() || params.get("commons")?.trim();
      if (commonscat && !item.commonscat) {
        item.commonscat = commonscat.replace(/^Category:/, "").replace(/^Категория:/, "");
      }

      result.set(knid, item);
    }
  }

  return result;
}

/**
 * Парсит параметры wiki-шаблона вида "name=value | name2=value2"
 */
function parseTemplateParams(paramsText: string): Map<string, string> {
  const result = new Map<string, string>();
  
  // Простой парсер с поддержкой вложенных {{}}
  let depth = 0;
  let currentParam = "";
  
  for (let i = 0; i < paramsText.length; i++) {
    const char = paramsText[i];
    const next = paramsText[i + 1];
    
    if (char === "{" && next === "{") {
      depth++;
      currentParam += "{{";
      i++;
    } else if (char === "}" && next === "}") {
      depth--;
      currentParam += "}}";
      i++;
    } else if (char === "|" && depth === 0) {
      parseParam(currentParam, result);
      currentParam = "";
    } else {
      currentParam += char;
    }
  }
  
  // Последний параметр
  if (currentParam.trim()) {
    parseParam(currentParam, result);
  }

  return result;
}

function parseParam(param: string, result: Map<string, string>) {
  const [key, ...valueParts] = param.split("=");
  if (!key) return;
  
  const cleanKey = key.trim().toLowerCase();
  const value = valueParts.join("=").trim();
  
  if (value) result.set(cleanKey, value);
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
