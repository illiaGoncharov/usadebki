export const CONDITIONS = [
  { id: "unknown", label: "неизвестно" },
  { id: "lost", label: "утрачена" },
  { id: "ruins", label: "руины" },
  { id: "neglect", label: "запустение" },
  { id: "restored", label: "восстановлена" },
  { id: "in_use", label: "используется" },
  // Частый случай: и отреставрирована, и в обороте (музей, гостиница, школа…).
  { id: "restored_in_use", label: "восстановлена и используется" },
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

/**
 * Какие id карточек попадают под выбранный фильтр.
 * «Восстановлена» и «используется» также включают комбинированный пункт.
 */
export function conditionFilterMatches(filterId: string): string[] {
  if (filterId === "restored") return ["restored", "restored_in_use"];
  if (filterId === "in_use") return ["in_use", "restored_in_use"];
  return [filterId];
}

/** Короткая подсказка редактору у выбора состояния. */
export const CONDITION_PICK_HINT =
  "Если здание и восстановлено, и занято — берите «восстановлена и используется». «Используется» — когда занято, но без полной реставрации; «восстановлена» — приведена в порядок, но пустует.";

export const PREDICATES = [
  { id: "title", label: "название" },
  { id: "condition", label: "состояние" },
  { id: "owners", label: "владельцы до 1917" },
  { id: "architects", label: "архитектор(ы)" },
  { id: "year", label: "даты" },
  { id: "style", label: "стиль" },
  { id: "history", label: "история" },
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
  if (id === "photo") return "фото";
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

/** «Иванов, Петров и Сидоров» — удобно читать несколько имён. */
export function formatNameList(names: string[]) {
  const clean = names.map((name) => name.trim()).filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0]!;
  if (clean.length === 2) return `${clean[0]} и ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")} и ${clean[clean.length - 1]}`;
}
