import { unstable_cache } from "next/cache";

const USER_AGENT = "Usadebki/0.1 (open catalog; contact via GitHub illiaGoncharov/usadebki)";

/**
 * Ссылки «посмотреть другие фото» — категория Commons у объекта (P373 / sitelink),
 * иначе MediaSearch по названию статьи. Не используем haswbstatement:P180 —
 * у русских усадеб structured data часто пустой, и поиск «уводит в никуда».
 */

/** Синхронный запасной вариант: поиск по названию статьи на Commons. */
export function commonsMediaSearchUrl(input: {
  wikipediaTitle?: string | null;
  wikidataQid?: string | null;
}): string | null {
  const title = input.wikipediaTitle?.trim();
  if (title) {
    return `https://commons.wikimedia.org/w/index.php?search=${encodeURIComponent(title)}&title=Special:MediaSearch&type=image`;
  }

  // Без названия статьи — хотя бы подпись Wikidata (MediaSearch понимает Q-id).
  const qid = input.wikidataQid?.trim();
  if (qid && /^Q\d+$/i.test(qid)) {
    return `https://commons.wikimedia.org/w/index.php?search=${encodeURIComponent(qid)}&title=Special:MediaSearch&type=image`;
  }

  return null;
}

function commonsWikiUrl(pageTitle: string): string {
  // Пробелы → _; двоеточие namespace (Category:) не кодируем — иначе ссылка ломается.
  const normalized = pageTitle.trim().replace(/ /g, "_");
  const colon = normalized.indexOf(":");
  if (colon > 0) {
    const ns = normalized.slice(0, colon);
    const rest = encodeURIComponent(normalized.slice(colon + 1)).replace(/%2F/g, "/");
    return `https://commons.wikimedia.org/wiki/${ns}:${rest}`;
  }
  return `https://commons.wikimedia.org/wiki/${encodeURIComponent(normalized)}`;
}

/**
 * Лучший URL галереи: категория Commons объекта (все фото «для статьи»),
 * иначе MediaSearch по названию статьи.
 */
export async function resolveCommonsGalleryUrl(input: {
  wikipediaTitle?: string | null;
  wikidataQid?: string | null;
}): Promise<string | null> {
  const qid = input.wikidataQid?.trim();
  if (qid && /^Q\d+$/i.test(qid)) {
    const category = await commonsCategoryForQid(qid);
    if (category) return commonsWikiUrl(`Category:${category}`);
  }
  return commonsMediaSearchUrl(input);
}

export async function commonsCategoryForQid(qid: string): Promise<string | null> {
  return cachedCategory(qid);
}

/** Имена файлов в категории Commons (до 100 шт.). */
export async function fetchCommonsCategoryFilenames(category: string): Promise<string[]> {
  const cmtitle = category.startsWith("Category:") ? category : `Category:${category.replace(/ /g, "_")}`;
  const names: string[] = [];
  let cmcontinue: string | undefined;

  for (let page = 0; page < 2; page += 1) {
    const params = new URLSearchParams({
      action: "query",
      list: "categorymembers",
      cmtitle,
      cmtype: "file",
      cmlimit: "50",
      format: "json",
    });
    if (cmcontinue) params.set("cmcontinue", cmcontinue);

    const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      next: { revalidate: 3600 },
    });
    if (!response.ok) break;
    const json = (await response.json()) as {
      continue?: { cmcontinue?: string };
      query?: { categorymembers?: Array<{ title: string }> };
    };
    for (const member of json.query?.categorymembers ?? []) {
      const name = member.title.replace(/^File:/i, "");
      if (/\.(jpe?g|png|webp)$/i.test(name)) names.push(name);
    }
    cmcontinue = json.continue?.cmcontinue;
    if (!cmcontinue) break;
  }

  return names;
}

const cachedCategory = unstable_cache(
  async (qid: string) => fetchCommonsCategory(qid),
  ["commons-category"],
  { revalidate: 60 * 60 * 24 * 7 },
);

async function fetchCommonsCategory(qid: string): Promise<string | null> {
  const url = `https://www.wikidata.org/w/api.php?${new URLSearchParams({
    action: "wbgetentities",
    ids: qid,
    props: "sitelinks|claims",
    format: "json",
  })}`;

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      next: { revalidate: 604800 },
    });
    if (!response.ok) return null;
    const json = (await response.json()) as {
      entities?: Record<
        string,
        {
          missing?: string;
          sitelinks?: Record<string, { title?: string }>;
          claims?: Record<string, Array<{ mainsnak?: { datavalue?: { value?: string } } }>>;
        }
      >;
    };
    const entity = json.entities?.[qid];
    if (!entity || entity.missing) return null;

    // Sitelink commonswiki чаще всего уже Category:…
    const sitelink = entity.sitelinks?.commonswiki?.title?.trim();
    if (sitelink) {
      const match = /^Category:(.+)$/i.exec(sitelink);
      if (match?.[1]) return match[1].replace(/_/g, " ");
    }

    // Запас: P373 «категория на Викискладе».
    const p373 = entity.claims?.P373?.[0]?.mainsnak?.datavalue?.value?.trim();
    if (p373) return p373;

    return null;
  } catch {
    return null;
  }
}
