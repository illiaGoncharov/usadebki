/**
 * Короткий заголовок для карточки: паспорт ЕГРОКН часто тащит длинную историю в поле «наименование».
 * Обрезаем по типичным зачинам и переносим хвост в блок «История».
 */

const MAX_TITLE_LEN = 72;

// \b в JS не работает с кириллицей — якорим конец слова через пробел/знак препинания.
const REGISTRY_HISTORY_SPLIT =
  /,\s*(?:в котор(?:ом|ой|ых)|где|куда|откуда|построен[аоы]?|сооружен[аоы]?|явля(?:вш(?:ий|ая|ее|ие)|ющ(?:ий|ая|ее|ие))|находивш(?:ий|ая|ее|ие)|назначен[аоы]?|использовавш(?:ий|ая|ее|ие)|перестроен[аоы]?|создан[аоы]?|возведён|возведен|жил[аи]?|проживал[аи]?|работал[аи]?)(?=\s|,|$|\.)/i;

/** Хвост паспорта: датировка, главный дом, архитектор, «здесь бывали…». */
const TAIL_MARKERS: RegExp[] = [
  /(?:,|\s)[-–—]?\s*главн(?:ый|ого)\s+дом/i,
  /(?:,|\s)[-–—]?\s*дом\s+с\s+флигел/i,
  /,\s*архитектор/i,
  /,\s*инженер-архитектор/i,
  /,\s*гражданский\s+инженер/i,
  /,\s*(?:сер\.|кон\.|нач\.|1-я|2-я|пол\.)\s/i,
  /,\s*(?:X{0,3}I{0,3}V?I{0,3}|XIX|XX|XVIII|XVII)\s*в\./i,
  /,\s*\d{3,4}\s*(?:[-–—]\s*\d{3,4}\s*)?гг?\./i,
  /\.\s+(?:Здесь|В\s+этом\s+доме|В\s+\d|Усадьба\s+связана|После\s+)/,
  /:\s*(?:конюшн|дом\s|флигел|погреб|парк|ограда|\d+\.)/i,
];

function cutAt(full: string, index: number): { title: string; registryNote: string | null } | null {
  if (index <= 0 || index >= full.length) return null;
  const title = full.slice(0, index).replace(/[,;:\s\-–—]+$/u, "").trim();
  const registryNote = full.slice(index).replace(/^[,;.\s\-–—]+/u, "").trim();
  if (title.length < 4 || registryNote.length < 8) return null;
  return { title, registryNote };
}

/** Делит паспортное наименование на короткий заголовок и пояснительный хвост. */
export function splitRegistryEstateName(fullName: string): {
  title: string;
  registryNote: string | null;
} {
  const trimmed = fullName.trim().replace(/\s+/g, " ");
  if (!trimmed) return { title: trimmed, registryNote: null };

  const history = REGISTRY_HISTORY_SPLIT.exec(trimmed);
  if (history?.index != null) {
    const cut = cutAt(trimmed, history.index);
    if (cut) return cut;
  }

  let best: { title: string; registryNote: string | null } | null = null;
  for (const marker of TAIL_MARKERS) {
    const match = marker.exec(trimmed);
    if (!match || match.index == null || match.index < 12) continue;
    const cut = cutAt(trimmed, match.index);
    if (!cut) continue;
    // Берём самое раннее осмысленное место разреза (короче заголовок — лучше).
    if (!best || cut.title.length < best.title.length) best = cut;
  }
  if (best && best.title.length <= MAX_TITLE_LEN) return best;

  // Всё ещё длинно: режем по последней запятой / точке / тире до лимита.
  if (trimmed.length > MAX_TITLE_LEN) {
    const head = trimmed.slice(0, MAX_TITLE_LEN + 1);
    const breakAt = Math.max(head.lastIndexOf(","), head.lastIndexOf("."), head.lastIndexOf(";"), head.lastIndexOf("—"), head.lastIndexOf("–"));
    if (breakAt >= 20) {
      const cut = cutAt(trimmed, breakAt);
      if (cut) return cut;
    }
  }

  return best ?? { title: trimmed, registryNote: null };
}

/**
 * Заголовок для UI: короткое имя; ценный хвост паспорта — в начало «Истории».
 * Если есть статья Википедии и паспорт длинный — часто берём вики-заголовок.
 * `titleOverride` — моментальная правка редактора (перекрывает автовыбор).
 */
export function estateDisplayTitle(
  fullName: string,
  wikipediaTitle?: string | null,
  titleOverride?: string | null,
): { title: string; registryNote: string | null } {
  const full = fullName.trim().replace(/\s+/g, " ");
  const split = splitRegistryEstateName(full);
  const override = titleOverride?.trim();
  const wiki = wikipediaTitle?.trim();
  const passportIsLong = full.length > MAX_TITLE_LEN || split.registryNote != null;

  // Вики короче и читаемее длинного паспорта — но не подменяем, если вики ещё длиннее.
  const preferWiki = Boolean(wiki && passportIsLong && wiki.length <= Math.max(split.title.length, MAX_TITLE_LEN));
  const title = override || (preferWiki ? wiki! : split.title);

  // В историю кладём только то, чего нет в коротком заголовке (не дублируем h1).
  let registryNote: string | null = null;
  if (title !== full) {
    if (full.toLowerCase().startsWith(title.toLowerCase())) {
      registryNote = full.slice(title.length).replace(/^[,;.\s\-–—]+/u, "").trim() || null;
    } else if (split.registryNote || override || preferWiki) {
      // Заголовок из вики / правки редактора: в историю — паспорт, если он ценнее одной строки.
      registryNote = full;
    } else {
      registryNote = full;
    }
  }

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
