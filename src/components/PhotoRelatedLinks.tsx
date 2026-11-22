import { commonsMediaSearchUrl } from "@/lib/commons-links";

/** Ссылки под основным снимком: другие фото на Commons и в статье Википедии. */
export function PhotoRelatedLinks({
  wikipediaTitle,
  wikipediaUrl,
  wikidataQid,
}: {
  wikipediaTitle?: string | null;
  wikipediaUrl?: string | null;
  wikidataQid?: string | null;
}) {
  const commonsUrl = commonsMediaSearchUrl({ wikipediaTitle, wikidataQid });
  const wikiUrl = wikipediaUrl?.trim() || null;
  if (!commonsUrl && !wikiUrl) return null;

  return (
    <p className="caption photo-related-links">
      Другие фото
      {commonsUrl ? (
        <>
          {": "}
          <a className="text-link" href={commonsUrl} target="_blank" rel="noopener noreferrer">
            Commons
          </a>
        </>
      ) : null}
      {wikiUrl ? (
        <>
          {commonsUrl ? " · " : ": "}
          <a className="text-link" href={wikiUrl} target="_blank" rel="noopener noreferrer">
            в статье Википедии
          </a>
        </>
      ) : null}
    </p>
  );
}
