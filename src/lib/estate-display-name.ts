/**
 * Короткий заголовок для карточки: паспорт ЕГРОКН часто тащит длинную историю в поле «наименование».
 * Обрезаем по типичным зачинам и переносим хвост в блок «История».
 */

// \b в JS не работает с кириллицей — якорим конец слова через пробел/знак препинания.
const REGISTRY_HISTORY_SPLIT =
  /,\s*(?:в котор(?:ом|ой|ых)|где|куда|откуда|построен[аоы]?|сооружен[аоы]?|явля(?:вш(?:ий|ая|ее|ие)|ющ(?:ий|ая|ее|ие))|находивш(?:ий|ая|ее|ие)|назначен[аоы]?|использовавш(?:ий|ая|ее|ие)|перестроен[аоы]?|создан[аоы]?|возведён|возведен|жил[аи]?|проживал[аи]?|работал[аи]?)(?=\s|,|$|\.)/i;

/** Делит паспортное наименование на короткий заголовок и пояснительный хвост. */
export function splitRegistryEstateName(fullName: string): {
  title: string;
  registryNote: string | null;
} {
  const trimmed = fullName.trim();
  if (!trimmed) return { title: trimmed, registryNote: null };

  const match = REGISTRY_HISTORY_SPLIT.exec(trimmed);
  if (!match || match.index === undefined) {
    return { title: trimmed, registryNote: null };
  }

  const title = trimmed.slice(0, match.index).trim();
  const registryNote = trimmed.slice(match.index + 1).replace(/^,\s*/, "").trim();
  if (title.length < 4 || registryNote.length < 8) {
    return { title: trimmed, registryNote: null };
  }
  return { title, registryNote };
}

/**
 * Заголовок для UI: короткое имя; если заголовок сокращён, полное наименование
 * из реестра возвращается целиком, чтобы положить его в начало «Истории».
 * Если есть статья Википедии — часто берём её заголовок вместо длинного паспорта.
 */
export function estateDisplayTitle(
  fullName: string,
  wikipediaTitle?: string | null,
): { title: string; registryNote: string | null } {
  const full = fullName.trim();
  const split = splitRegistryEstateName(full);
  const wiki = wikipediaTitle?.trim();
  const passportIsLong = full.length > 80 || split.registryNote != null;

  const title = wiki && passportIsLong ? wiki : split.title;
  const registryNote = title !== full ? full : null;
  return { title, registryNote };
}

/** Сшиваем текст истории с хвостом из наименования реестра (без дублей). */
export function mergeRegistryNoteIntoHistory(body: string, registryNote: string | null): string {
  const note = registryNote?.trim();
  if (!note) return body.trim();

  const normalizedBody = body.trim();
  const snippet = note.slice(0, Math.min(48, note.length));
  if (normalizedBody && normalizedBody.toLowerCase().includes(snippet.toLowerCase())) {
    return normalizedBody;
  }

  const sentence = note.endsWith(".") ? note : `${note}.`;
  if (!normalizedBody) return sentence;
  return `${sentence}\n\n${normalizedBody}`;
}