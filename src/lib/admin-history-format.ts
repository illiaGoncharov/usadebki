import { conditionLabel, isConditionId, predicateLabel } from "@/lib/labels";
import { formatStyleLabels } from "@/lib/reference";

/** Человекочитаемое значение утверждения в админ-истории. */
export function readableStatement(predicate: string, text: string) {
  if (predicate === "condition" && isConditionId(text)) return conditionLabel(text);
  if (predicate === "style") return formatStyleLabels(text);
  return text;
}

export function formatWhen(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

/** Моментальная правка редактора (без внешней ссылки). */
export function isEditorialSourceTitle(title: string | null | undefined) {
  return Boolean(title && /правка редактора/i.test(title));
}

export { predicateLabel };
