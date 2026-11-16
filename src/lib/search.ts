export function loosenPlace(query: string) {
  // «серпуховым» и «серпухове» ищут то же место, что и «серпухов».
  const stemmed = query.replace(/(ыми|ими|ого|ому|ему|ами|ями|ым|им|ом|ем|ой|ый|ий|ая|ое|ые|ах|ях)$/i, "");
  return stemmed.length >= 5 ? stemmed : query;
}

const PLACE_PREFIX =
  /^(городской округ|муниципальный округ|г\.о\.|г\.п\.|г\.\s*п\.|город|село|деревня|посёлок|поселок|с\.п\.|г\.|с\.|д\.|п\.)\s*/i;
const STREET = /^(ул\.|улица|пер\.|переулок|пр-т|проспект|ш\.|шоссе|тракт|наб\.|набережная)(\s|$)/i;

/** Кусок адреса, в котором нашёлся запрос: «г. Серпухов» → «Серпухов». */
export function placeFromAddress(address: string, regionName: string, query: string) {
  const needle = query.toLowerCase();
  const region = regionName.toLowerCase();
  const hit = address
    .split(",")
    .map((part) => part.trim())
    .find((part) => {
      const lower = part.toLowerCase();
      return (
        lower.includes(needle) &&
        lower !== region &&
        !/область|край|республика|автономн/.test(lower) &&
        !STREET.test(lower)
      );
    });
  if (!hit) return null;
  let label = hit;
  for (let step = 0; step < 3; step += 1) {
    const next = label.replace(PLACE_PREFIX, "");
    if (next === label) break;
    label = next;
  }
  label = label.replace(/[.,;]+$/g, "").replace(/\s+/g, " ").trim();
  return label.length >= 2 ? label : null;
}
