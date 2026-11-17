/**
 * Список файлов в категории Commons (для узких категорий усадеб).
 */
import { estateNameStems, filenameMatchesEstate } from "../../src/lib/estate-stems";

export { estateNameStems, filenameMatchesEstate };

const USER_AGENT = "Usadebki/0.1 (https://usadebki-beta.vercel.app; research)";

export async function fetchCommonsCategoryFiles(category: string): Promise<string[]> {
  const cmtitle = category.startsWith("Category:") ? category : `Category:${category.replace(/ /g, "_")}`;
  const url =
    "https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtitle=" +
    encodeURIComponent(cmtitle) +
    "&cmtype=file&cmlimit=50&format=json";
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    query?: { categorymembers?: Array<{ title: string }> };
  };
  return (json.query?.categorymembers ?? [])
    .map((m) => m.title.replace(/^File:/, ""))
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
}
