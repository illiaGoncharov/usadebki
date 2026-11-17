/**
 * Слияние дублей ЕГРОКН: один населённый пункт + схожее название → один показ в каталоге.
 */

const GENERIC_STEMS = new Set(
  [
    "ансамбль",
    "усадьба",
    "усадебный",
    "комплекс",
    "объект",
    "объекта",
    "объектов",
    "объекты",
    "парком",
    "парка",
    "парк",
    "век",
    "вв",
    "xviii",
    "xix",
    "xx",
    "нач",
    "кон",
    "вв.",
  ].map((w) => w.toLowerCase()),
);

export function localityKey(address: string | null | undefined): string | null {
  if (!address) return null;
  const m = address.match(/(?:^|,)\s*(?:с\.|село|д\.|дер\.|деревня|п\.|пос\.|посёлок)\s*([^,]+)/i);
  if (!m) return null;
  return m[1]!.toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeName(name: string) {
  return name
    .toLowerCase()
    .replace(/[«»"—–]/g, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Отпечаток для группировки кандидатов-дублей. */
export function dedupeFingerprint(regionId: string, name: string, address: string | null | undefined): string | null {
  const place = localityKey(address);
  if (!place) return null;
  const stems = normalizeName(name)
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !GENERIC_STEMS.has(w))
    .map((w) => (w.length >= 6 ? w.slice(0, 6) : w));
  const key = [...new Set(stems)].sort().join("|");
  if (!key) return null;
  return `${regionId}::${place}::${key}`;
}

export type EstateDedupeRow = {
  id: string;
  name: string;
  regionId: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  wikipediaTitle: string | null;
  summary: string | null;
  wikidataQid: string | null;
  egrknRegNumber: string;
};

/** Какая карточка остаётся главной в группе дублей. */
export function scoreCanonicalCandidate(row: EstateDedupeRow) {
  let score = 0;
  if (row.lat != null && row.lng != null) score += 30;
  if (row.wikipediaTitle?.trim()) score += 12;
  if (row.summary?.trim()) score += 8;
  if (row.wikidataQid) score += 6;
  score += Math.min(row.name.length, 120) / 40;
  // Более новый паспорт ЕГРОКН чаще полнее.
  score += Number(row.egrknRegNumber.slice(-6)) / 1_000_000;
  return score;
}

export function pickCanonicalFromGroup(rows: EstateDedupeRow[]): EstateDedupeRow {
  return [...rows].sort((a, b) => scoreCanonicalCandidate(b) - scoreCanonicalCandidate(a))[0]!;
}

/** Два названия достаточно похожи, если совпадают укороченные «фамильные» основы. */
export function namesLikelySameDuplicate(a: string, b: string) {
  const sa = new Set(
    normalizeName(a)
      .split(/\s+/)
      .filter((w) => w.length >= 5 && !GENERIC_STEMS.has(w))
      .map((w) => w.slice(0, 6)),
  );
  const sb = new Set(
    normalizeName(b)
      .split(/\s+/)
      .filter((w) => w.length >= 5 && !GENERIC_STEMS.has(w))
      .map((w) => w.slice(0, 6)),
  );
  if (sa.size === 0 || sb.size === 0) return false;
  for (const x of sa) if (sb.has(x)) return true;
  return false;
}

export function clusterDuplicateEstates(rows: EstateDedupeRow[]) {
  const buckets = new Map<string, EstateDedupeRow[]>();
  for (const row of rows) {
    const fp = dedupeFingerprint(row.regionId, row.name, row.address);
    if (!fp) continue;
    const list = buckets.get(fp) ?? [];
    list.push(row);
    buckets.set(fp, list);
  }
  const merges: { duplicateId: string; canonicalId: string; fingerprint: string }[] = [];
  for (const [fingerprint, group] of buckets) {
    if (group.length < 2) continue;
    const canonical = pickCanonicalFromGroup(group);
    for (const row of group) {
      if (row.id === canonical.id) continue;
      if (!namesLikelySameDuplicate(row.name, canonical.name)) continue;
      merges.push({ duplicateId: row.id, canonicalId: canonical.id, fingerprint });
    }
  }
  return merges;
}