export const CONDITIONS = [
  { id: "unknown", label: "неизвестно" },
  { id: "lost", label: "утрачена" },
  { id: "ruins", label: "руины" },
  { id: "neglect", label: "запустение" },
  { id: "in_use", label: "используется" },
  { id: "restored", label: "восстановлена" },
] as const;

export type ConditionId = (typeof CONDITIONS)[number]["id"];

/** Состояния, которые в каталоге сворачиваются в фильтр «плохое» */
export const POOR_CONDITION_IDS = ["lost", "ruins", "neglect"] as const satisfies readonly ConditionId[];

const poorConditionSet = new Set<string>(POOR_CONDITION_IDS);

export function isPoorConditionId(id: string) {
  return poorConditionSet.has(id);
}

export function isPoorConditionFilter(value: string | undefined) {
  return value === "poor" || (value != null && isPoorConditionId(value));
}

export const PREDICATES = [
  { id: "condition", label: "состояние" },
  { id: "owners", label: "владельцы до 1917" },
  { id: "year", label: "даты" },
  { id: "style", label: "стиль" },
  { id: "note", label: "заметка" },
] as const;

export type PredicateId = (typeof PREDICATES)[number]["id"];

const ROLES: Record<string, string> = {
  last_owner: "последний владелец",
  owner: "владелец",
  architect: "архитектор",
};

export function conditionLabel(id: string | null | undefined) {
  return CONDITIONS.find((item) => item.id === id)?.label ?? "неизвестно";
}

export function predicateLabel(id: string) {
  return PREDICATES.find((item) => item.id === id)?.label ?? id;
}

export function roleLabel(id: string) {
  return ROLES[id] ?? id;
}

export function isConditionId(value: string): value is ConditionId {
  return CONDITIONS.some((item) => item.id === value);
}

export function isPredicateId(value: string): value is PredicateId {
  return PREDICATES.some((item) => item.id === value);
}

export function splitOwnerNames(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 30);
}
