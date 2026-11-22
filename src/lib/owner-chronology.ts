/** Год Октябрьской революции — граница «владельцы до 1917». */
export const REVOLUTION_YEAR = 1917;

/** Годы из текста: 1863, 1908–1910, 1910-е. */
export function extractYears(text: string): number[] {
  const found = new Set<number>();

  for (const match of text.matchAll(/\b((?:1[5-9]|20)\d{2})\s*[–—−-]\s*((?:1[5-9]|20)\d{2})\b/g)) {
    const a = Number(match[1]);
    const b = Number(match[2]);
    if (a >= 1500 && a <= 2100) found.add(a);
    if (b >= 1500 && b <= 2100) found.add(b);
  }

  for (const match of text.matchAll(/\b((?:1[5-9]|20)\d{2})-е\b/gi)) {
    const year = Number(match[1]);
    if (year >= 1500 && year <= 2100) found.add(year);
  }

  for (const match of text.matchAll(/\b((?:1[5-9]|20)\d{2})\b/g)) {
    const year = Number(match[1]);
    if (year >= 1500 && year <= 2100) found.add(year);
  }

  return [...found].sort((a, b) => a - b);
}

export type OwnerTimeHints = {
  years: number[];
  /** Начало владения / первая дата в тексте. */
  start: number | null;
  /** Последняя дата в тексте. */
  end: number | null;
  /** Самый поздний год ≤ 1917. */
  preRevEnd: number | null;
  mentionsRevolution: boolean;
  /** Похоже на послереволюционную судьбу здания, не на владельца до 1917. */
  sovietHeavy: boolean;
};

export function ownerTimeHints(text: string): OwnerTimeHints {
  const years = extractYears(text);
  const start = years[0] ?? null;
  const end = years.length > 0 ? years[years.length - 1]! : null;
  const preRev = years.filter((year) => year <= REVOLUTION_YEAR);
  const preRevEnd = preRev.length > 0 ? preRev[preRev.length - 1]! : null;
  const mentionsRevolution = /до\s+революц|перед\s+революц|накануне\s+революц|к\s+1917/i.test(text);
  const sovietHeavy =
    /советск|кинотеатр|ресторан|национализ|после\s+революц|в\s+191[8-9]|с\s+191[8-9]|192\d|196\d/i.test(
      text,
    ) && (preRevEnd == null || end == null || end > REVOLUTION_YEAR);

  return { years, start, end, preRevEnd, mentionsRevolution, sovietHeavy };
}

type OwnerLike = { id: string; name: string; role: string; years?: string | null };

function blobOf(owner: OwnerLike) {
  return `${owner.name} ${owner.years ?? ""}`;
}

/** Оценка «насколько это последний владелец до революции». */
export function lastPreRevolutionScore(owner: OwnerLike): number {
  const hints = ownerTimeHints(blobOf(owner));
  let score = -1;

  if (hints.preRevEnd != null) score = hints.preRevEnd;
  if (hints.mentionsRevolution) score = Math.max(score, REVOLUTION_YEAR - 1);
  if (hints.sovietHeavy) score -= 500;
  // Ручная метка чуть помогает при ничьей по годам.
  if (owner.role === "last_owner" && score >= 0) score += 0.1;

  return score;
}

/**
 * Послереволюционная судьба (с 1918, национализация…) — не «владелец до 1917»,
 * всегда в конце списка.
 */
export function isPostRevolutionOwner(owner: OwnerLike): boolean {
  const text = blobOf(owner).trim();
  const hints = ownerTimeHints(text);
  if (hints.sovietHeavy) return true;
  if (hints.start != null && hints.start >= REVOLUTION_YEAR + 1) return true;
  if (hints.years.length > 0 && hints.preRevEnd == null) return true;
  return /^с\s+191[89]|^в\s+191[89]|^после\s+революц/i.test(text);
}

export function partitionOwnersByRevolution<T extends OwnerLike>(owners: T[]) {
  const preRev: T[] = [];
  const postRev: T[] = [];
  for (const owner of owners) {
    if (isPostRevolutionOwner(owner)) postRev.push(owner);
    else preRev.push(owner);
  }
  return {
    preRev,
    postRev: sortOwnersChronologically(postRev),
  };
}

/** Кто из списка — последний владелец до 1917 (по датам в тексте). */
export function pickLastPreRevolutionOwner<T extends OwnerLike>(owners: T[]): T {
  if (owners.length === 0) throw new Error("owners пуст");
  const { preRev } = partitionOwnersByRevolution(owners);
  const pool = preRev.length > 0 ? preRev : owners.filter((o) => !isPostRevolutionOwner(o));
  if (pool.length === 0) throw new Error("нет владельцев до 1917");
  if (pool.length === 1) return pool[0]!;

  const ranked = pool
    .map((owner) => ({
      owner,
      score: lastPreRevolutionScore(owner),
      start: ownerTimeHints(blobOf(owner)).start ?? 9999,
    }))
    .sort((a, b) => b.score - a.score || a.start - b.start);

  const withDates = ranked.find((row) => row.score >= 0);
  if (withDates) return withDates.owner;

  const marked = pool.filter((owner) => owner.role === "last_owner");
  if (marked.length === 1) return marked[0]!;
  return pool[0]!;
}

/** Хронология: от ранних владельцев к поздним. */
export function sortOwnersChronologically<T extends OwnerLike>(owners: T[]): T[] {
  return [...owners].sort((a, b) => {
    const ha = ownerTimeHints(blobOf(a));
    const hb = ownerTimeHints(blobOf(b));
    const sa = ha.start ?? 9999;
    const sb = hb.start ?? 9999;
    if (sa !== sb) return sa - sb;
    const ea = ha.end ?? sa;
    const eb = hb.end ?? sb;
    if (ea !== eb) return ea - eb;
    return a.name.localeCompare(b.name, "ru");
  });
}
