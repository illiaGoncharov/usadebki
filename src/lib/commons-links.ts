/**
 * Ссылки «посмотреть другие фото» — Commons по Wikidata/названию статьи и сама статья.
 */

export function commonsMediaSearchUrl(input: {
  wikipediaTitle?: string | null;
  wikidataQid?: string | null;
}): string | null {
  const qid = input.wikidataQid?.trim();
  if (qid && /^Q\d+$/i.test(qid)) {
    // Кадры, у которых в structured data указан этот объект (P180 «изображает»).
    const query = `haswbstatement:P180=${qid}`;
    return `https://commons.wikimedia.org/w/index.php?search=${encodeURIComponent(query)}&title=Special:MediaSearch&type=image`;
  }

  const title = input.wikipediaTitle?.trim();
  if (title) {
    return `https://commons.wikimedia.org/w/index.php?search=${encodeURIComponent(title)}&title=Special:MediaSearch&type=image`;
  }

  return null;
}
