export type PhotoKind = "house" | "other" | "place" | "part" | "scene";

// Праздник, каток и случайный кадр района не показываем как усадьбу.
const SCENE = [
  "новый год",
  "каток",
  "фестиваль",
  "концерт",
  "праздник",
  "свадьб",
  "ярмарк",
  "christmas",
  "new year",
  "skating",
  "ice rink",
  "festival",
  "concert",
  "wedding",
  "гулянь",
  "карнавал",
  "аттракцион",
  "портрет",
];

const HOUSE = [
  "усадеб",
  "усадьб",
  "садиб",
  "дворец",
  "особняк",
  "фасад",
  "главный дом",
  "main house",
  "mansion",
  "manor",
  "palace",
  "homestead",
  "chateau",
  "estate",
  "usadba",
  "господск",
];

// Главное здание названо прямо. Такие слова перевешивают слова про вспомогательные здания.
export const MAIN_WORDS = [
  "главный дом",
  "главный корпус",
  "главное здание",
  "господский дом",
  "усадебный дом",
  "барский дом",
  "main house",
  "manor house",
  "mansion",
  "palace",
  "дворец",
  "особняк",
];

// Вспомогательные здания и сооружения ансамбля. Это не главный дом, их место в конце списка.
export const PART_WORDS = [
  "флигел",
  "конюш",
  "кладов",
  "служеб",
  "хозяйствен",
  "каретн",
  "людск",
  "сарай",
  "амбар",
  "ледник",
  "оранжере",
  "беседк",
  "сторожк",
  "привратн",
  "ворота",
  "оград",
  "баня",
  "погреб",
  "ризниц",
  "церков",
  "часовн",
  "колокольн",
  "усыпальниц",
  "мавзолей",
  "павильон",
  "outbuilding",
  "stable",
  "chapel",
  "church",
  "bell tower",
  "orangery",
  "greenhouse",
  "gatehouse",
];

const RANK: Record<PhotoKind, number> = { house: 0, other: 1, place: 2, part: 3, scene: 4 };

export function decodePhotoName(value: string) {
  const raw = value.includes("Special:FilePath/")
    ? (value.split("Special:FilePath/")[1]?.split("?")[0] ?? value)
    : value;
  try {
    return decodeURIComponent(raw).replace(/_/g, " ");
  } catch {
    return raw.replace(/_/g, " ");
  }
}

/** Ключ файла Commons для схлопывания дублей с разным ?width=. */
export function photoFileKey(value: string) {
  return decodePhotoName(value).trim().toLowerCase();
}

function isPlace(name: string) {
  return (
    /(^|[^a-z])(park|garden|orchard)([^a-z]|$)/i.test(name) ||
    /(^|[^а-яё])(парк|пруд|фонтан|алле|клумб|грот|садов)/i.test(name) ||
    /(^|[^а-яё])сад([^а-яё]|$)/i.test(name)
  );
}

/** Все снимки главного здания: is_primary первым, затем по «похожести» на дом. */
export function sortGalleryPhotos<T extends { url: string; isPrimary: boolean }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const rankA = photoRank(photoKind(a.url));
    const rankB = photoRank(photoKind(b.url));
    const deprioritizeA = rankA >= 3 ? 1 : 0;
    const deprioritizeB = rankB >= 3 ? 1 : 0;
    if (deprioritizeA !== deprioritizeB) return deprioritizeA - deprioritizeB;
    if (Number(b.isPrimary) !== Number(a.isPrimary)) return Number(b.isPrimary) - Number(a.isPrimary);
    return rankA - rankB || a.url.localeCompare(b.url, "ru");
  });
}

/** Одно лучшее фото для шапки карточки и ленты — та же логика, что в listEstates (SQL). */
export function pickHeroPhoto<T extends { url: string; isPrimary: boolean }>(rows: T[]): T[] {
  const sorted = sortGalleryPhotos(rows);
  return sorted.length > 0 ? [sorted[0]!] : [];
}

export type ParsedPhotoInput = {
  url: string;
  sourceUrl: string;
  filename: string | null;
  origin: "commons" | "external";
};

/**
 * Разбор ссылки Commons / имени файла → URL для карточки и страница файла.
 * Принимает File:…, Special:FilePath/…, upload.wikimedia.org, голое имя.
 */
export function parseCommonsPhotoInput(raw: string): ParsedPhotoInput | null {
  const input = raw.trim();
  if (!input) return null;

  let filename = "";
  const fileMatch = input.match(/(?:wiki\/)?File:([^?#]+)/i);
  const pathMatch = input.match(/Special:FilePath\/([^?#]+)/i);
  const uploadMatch = input.match(/\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)/i);

  if (fileMatch?.[1]) {
    filename = fileMatch[1];
  } else if (pathMatch?.[1]) {
    filename = pathMatch[1];
  } else if (uploadMatch?.[1]) {
    filename = uploadMatch[1];
  } else if (!/^https?:\/\//i.test(input) && /\.(jpe?g|png|gif|webp|tif{1,2}|svg)$/i.test(input)) {
    filename = input.replace(/^File:/i, "");
  } else {
    return null;
  }

  try {
    filename = decodeURIComponent(filename.replace(/_/g, " ")).trim();
  } catch {
    filename = filename.replace(/_/g, " ").trim();
  }
  if (!filename) return null;

  const encoded = encodeURIComponent(filename.replace(/ /g, "_"));
  return {
    filename,
    url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encoded}?width=1600`,
    sourceUrl: `https://commons.wikimedia.org/wiki/File:${encoded}`,
    origin: "commons",
  };
}

/**
 * Любой источник: сначала Commons, иначе прямая https-ссылка на кадр
 * (PastVu, музей, CDN — редактор отвечает за качество).
 */
export function parsePhotoInput(raw: string): ParsedPhotoInput | null {
  const commons = parseCommonsPhotoInput(raw);
  if (commons) return commons;

  const input = raw.trim();
  if (!/^https:\/\//i.test(input)) return null;
  try {
    const parsed = new URL(input);
    if (parsed.protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { url: input, sourceUrl: input, filename: null, origin: "external" };
}

/** Парк, аллея, лестница в лесопарке — не главный дом, даже если в подписи есть «усадьба». */
function isParkView(name: string) {
  return (
    /лесопарк|лесопарке|берёзов\S*\s+алле|березов\S*\s+алле|алле[яию]\b/.test(name) ||
    /(^|[^а-яё])лестниц/.test(name) ||
    /(^|[^a-z])(park|garden|orchard)([^a-z]|$)/i.test(name)
  );
}

export function photoKind(value: string): PhotoKind {
  const name = decodePhotoName(value).toLowerCase();
  // Флигель или конюшня не должны выигрывать у главного дома, поэтому проверяем их раньше «дома».
  if (PART_WORDS.some((word) => name.includes(word)) && !MAIN_WORDS.some((word) => name.includes(word))) {
    return "part";
  }
  if (isParkView(name) && !MAIN_WORDS.some((word) => name.includes(word))) {
    return "place";
  }
  if (/map\.(jpe?g|png|webp)$/i.test(name)) return "place";
  // Сначала ищем здание: иначе «Estate - panoramio» уходит в сцену и пропадает из ленты.
  if (HOUSE.some((word) => name.includes(word))) return "house";
  if (SCENE.some((word) => name.includes(word))) return "scene";
  if (isPlace(name) || /\bmap\b|\.plan\.|план\b|схема/i.test(name)) return "place";
  return "other";
}

export function photoRank(kind: PhotoKind) {
  return RANK[kind];
}

export function quotePhotoWord(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

export const SCENE_WORDS = SCENE;
export const HOUSE_WORDS = HOUSE;

export const PHOTO_KIND_SQL = `
create or replace function url_decode(input text) returns text
language plpgsql immutable as $fn$
declare
  bin bytea := '';
  i int := 1;
  len int := length(input);
  ch text;
begin
  if input is null then return ''; end if;
  while i <= len loop
    ch := substr(input, i, 1);
    if ch = '%' and i + 2 <= len then
      bin := bin || decode(substr(input, i + 1, 2), 'hex');
      i := i + 3;
    elsif ch = '+' then
      bin := bin || convert_to(' ', 'utf8');
      i := i + 1;
    else
      bin := bin || convert_to(ch, 'utf8');
      i := i + 1;
    end if;
  end loop;
  return convert_from(bin, 'utf8');
exception when others then
  return input;
end
$fn$;

create or replace function photo_kind(raw text) returns int
language plpgsql immutable as $fn$
declare
  name text;
  file text;
begin
  file := coalesce(raw, '');
  if position('Special:FilePath/' in file) > 0 then
    file := split_part(split_part(file, 'Special:FilePath/', 2), '?', 1);
  end if;
  name := replace(url_decode(file), '_', ' ');
  name := translate(name, 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ', 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя');
  name := lower(name);
  if (${PART_WORDS.map((word) => `position(${quotePhotoWord(word)} in name) > 0`).join(" or ")})
     and not (${MAIN_WORDS.map((word) => `position(${quotePhotoWord(word)} in name) > 0`).join(" or ")}) then
    return 3;
  end if;
  if name ~ 'лесопарк|лесопарке|бер[её]зов\S*\s+алле|алле[яию]'
     or name ~ '(^|[^а-яё])лестниц'
     and not (${MAIN_WORDS.map((word) => `position(${quotePhotoWord(word)} in name) > 0`).join(" or ")}) then
    return 2;
  end if;
  if ${HOUSE.map((word) => `position(${quotePhotoWord(word)} in name) > 0`).join(" or ")} then
    return 0;
  end if;
  if ${SCENE.map((word) => `position(${quotePhotoWord(word)} in name) > 0`).join(" or ")} then
    return 4;
  end if;
  if name ~ '(^|[^a-z])(park|garden)([^a-z]|$)'
     or name ~ '(^|[^а-яё])(парк|пруд|фонтан|алле|клумб|грот)'
     or name ~ '(^|[^а-яё])сад([^а-яё]|$)' then
    return 2;
  end if;
  return 1;
exception when others then
  return 1;
end
$fn$;
`;
