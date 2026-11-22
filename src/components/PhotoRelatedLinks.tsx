/** Ссылки под основным снимком: галерея на Commons и статья Википедии. */
export function PhotoRelatedLinks({
  commonsUrl,
  wikipediaUrl,
}: {
  /** Уже разрешённый URL (категория Commons или MediaSearch). */
  commonsUrl?: string | null;
  wikipediaUrl?: string | null;
}) {
  const wikiUrl = wikipediaUrl?.trim() || null;
  const commons = commonsUrl?.trim() || null;
  if (!commons && !wikiUrl) return null;

  return (
    <p className="caption photo-related-links">
      Другие фото
      {commons ? (
        <>
          {": "}
          <a className="text-link" href={commons} target="_blank" rel="noopener noreferrer">
            Commons
          </a>
        </>
      ) : null}
      {wikiUrl ? (
        <>
          {commons ? " · " : ": "}
          <a className="text-link" href={wikiUrl} target="_blank" rel="noopener noreferrer">
            в статье Википедии
          </a>
        </>
      ) : null}
    </p>
  );
}
