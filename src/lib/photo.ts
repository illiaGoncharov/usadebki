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

function isPlace(name: string) {
  return (
    /(^|[^a-z])(park|garden)([^a-z]|$)/i.test(name) ||
    /(^|[^а-яё])(парк|пруд|фонтан|алле|клумб|грот)/i.test(name) ||
    /(^|[^а-яё])сад([^а-яё]|$)/i.test(name)
  );
}

export function photoKind(value: string): PhotoKind {
  const name = decodePhotoName(value).toLowerCase();
  // Флигель или конюшня не должны выигрывать у главного дома, поэтому проверяем их раньше «дома».
  if (PART_WORDS.some((word) => name.includes(word)) && !MAIN_WORDS.some((word) => name.includes(word))) {
    return "part";
  }
  // Сначала ищем здание: иначе «Estate - panoramio» уходит в сцену и пропадает из ленты.
  if (HOUSE.some((word) => name.includes(word))) return "house";
  if (SCENE.some((word) => name.includes(word))) return "scene";
  if (isPlace(name)) return "place";
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
