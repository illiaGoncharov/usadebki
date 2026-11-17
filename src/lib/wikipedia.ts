import { unstable_cache } from "next/cache";

const USER_AGENT = "Usadebki/0.1 (open catalog; contact via GitHub illiaGoncharov/usadebki)";

/**
 * Вступление статьи ruwiki: plain text, до ~12 предложений.
 * Кэш на неделю — чтобы не дергать API на каждый просмотр карточки.
 */
export async function wikipediaIntro(title: string): Promise<string | null> {
  return cachedIntro(title);
}

const cachedIntro = unstable_cache(
  async (title: string) => fetchWikiIntro(title),
  ["wiki-intro"],
  { revalidate: 60 * 60 * 24 * 7 },
);

async function fetchWikiIntro(title: string): Promise<string | null> {
  const url = `https://ru.wikipedia.org/w/api.php?${new URLSearchParams({
    action: "query",
    format: "json",
    prop: "extracts",
    explaintext: "1",
    exintro: "1",
    exsectionformat: "plain",
    exsentences: "12",
    titles: title,
  })}`;

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      next: { revalidate: 604800 },
    });
    if (!response.ok) return null;
    const json = (await response.json()) as {
      query?: { pages?: Record<string, { extract?: string; missing?: string }> };
    };
    const page = Object.values(json.query?.pages ?? {})[0];
    if (!page || page.missing) return null;
    const text = page.extract?.trim();
    if (!text || text.length < 40) return null;
    return text.slice(0, 3500);
  } catch {
    return null;
  }
}