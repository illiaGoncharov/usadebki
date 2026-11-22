/**
 * Эвристики состояния усадьбы из открытых источников.
 * Используются скриптом enrich:conditions и тестами — не путать с правками человека в statements.
 */
import type { ConditionId } from "./labels";

/** Wikidata P5816 / P5817 → наши id */
export const WIKI_CONDITION: Record<string, ConditionId> = {
  Q124314: "ruins",
  Q81163: "lost",
  Q56556915: "lost",
  Q164160: "neglect",
  Q56557591: "restored",
  Q1081138: "in_use",
  Q55654238: "neglect",
};

const INTRO_CHARS = 350;

/** Приоритет источника: выше — важнее при конфликте */
export const CONDITION_SOURCE_PRIORITY = {
  wikipedia_category: 100,
  wikidata: 80,
  summary_text: 40,
} as const;

export type ConditionSignal = {
  condition: ConditionId;
  source: keyof typeof CONDITION_SOURCE_PRIORITY;
  reason: string;
};

export function conditionFromCategories(categories: string[]): ConditionId | null {
  const blob = categories.join("\n");

  if (/восстановлен\S*\s+из\s+руин/i.test(blob)) return "restored";
  // Музей-усадьба обычно и восстановлена, и работает.
  if (/музе[ий]-усадьб|дома-музе|литературно-мемориальн|биографическ\S*\s+музе/i.test(blob)) {
    return "restored_in_use";
  }
  if (/руин/i.test(blob)) return "ruins";
  if (/утрачен/i.test(blob)) return "lost";
  if (/заброшен/i.test(blob)) return "neglect";

  return null;
}

/**
 * Только ввод статьи: не ловим «пришло в запустение» в середине биографии.
 */
export function conditionFromText(text: string): ConditionId | null {
  const intro = text.slice(0, INTRO_CHARS);

  if (
    /музей[-\s]?усадьб|музей-заповедник|музейный комплекс|мемориальн\S*\s+музей|дом-музей|чеховск\S*\s+музе/i.test(
      intro,
    )
  ) {
    return "restored_in_use";
  }
  if (
    /отреставрирован|восстановлен\S* в \d{4}|после реставрации/i.test(intro) &&
    !/требует реставра|нуждается в реставра/i.test(intro)
  ) {
    return "restored";
  }
  if (/действующ(ий|ая) (?:музей|усадьба)/i.test(intro)) return "restored_in_use";
  if (/размещается (?:музей|клиник|школ|больниц|санаторий|гостиниц|посольство)/i.test(intro)) {
    return "restored_in_use";
  }
  if (/располагается (?:музей|посольство|санаторий|гостиница)/i.test(intro) && !/ранее располага/i.test(intro)) {
    return "restored_in_use";
  }

  if (/руинированн|лежат в руинах|обратилась в руины|сохранил\S* (?:лишь|только) руин/i.test(intro)) {
    return "ruins";
  }
  if (/(?:^|—\s*)заброшенн\S* усадьб|находится в запустении/i.test(intro) && !/музей/i.test(intro)) {
    return "neglect";
  }
  if (/(?:бывшая|ныне) утраченн\S* усадьб|полностью утрачен|усадьба не сохранилась/i.test(intro)) {
    return "lost";
  }
  if (/\bруин\S*\b/i.test(intro) && !/не руины|из руин/i.test(intro)) {
    return "ruins";
  }

  return null;
}

export function wikidataToCondition(p5816: string | undefined, p5817: string | undefined, hasP576: boolean): ConditionId | null {
  if (p5816 && WIKI_CONDITION[p5816]) return WIKI_CONDITION[p5816];
  if (hasP576) return "lost";
  if (p5817 && WIKI_CONDITION[p5817]) return WIKI_CONDITION[p5817];
  return null;
}

export function pickConditionSignal(signals: ConditionSignal[]): ConditionSignal | null {
  if (signals.length === 0) return null;
  return [...signals].sort(
    (a, b) => CONDITION_SOURCE_PRIORITY[b.source] - CONDITION_SOURCE_PRIORITY[a.source],
  )[0];
}