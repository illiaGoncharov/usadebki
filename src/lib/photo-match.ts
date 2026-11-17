/**
 * Проверка: снимок показывает именно этот объект реестра, а не соседнее здание ансамбля.
 *
 * Правило одно: главным фото становится только снимок с положительным подтверждением.
 * Остальное либо уходит в «Другие части ансамбля» (part), либо скрывается (hide).
 *
 * Модуль чистый: без сети и БД. Описания файлов приносит scripts/audit-photos.ts.
 */
import { decodePhotoName, MAIN_WORDS, PART_WORDS, photoKind, SCENE_WORDS } from "./photo";

export type BuildingRole = "main" | "part" | "unknown";
export type PhotoSource = "registry" | "wikidata" | "none";
export type AddressMatch = "match-structure" | "match" | "unknown" | "mismatch";

export type Coord = { lat: number; lng: number };

export type EstateFacts = {
  name: string;
  address: string | null;
  objectType: string | null;
  partsCount: number;
  lat?: number | null;
  lng?: number | null;
};

export type PhotoFacts = {
  filename: string;
  /** Описание файла на Commons. Часто содержит роль здания и адрес: «Флигель: … дом 42, строение 2». */
  description?: string | null;
  /**
   * Откуда известно, что снимок относится к объекту:
   * registry — ЕГРОКН, Wikivoyage по номеру реестра или человек;
   * wikidata — P18 самого элемента объекта;
   * none — только категория Commons или неизвестно.
   */
  source: PhotoSource;
  /** Геометка файла на Commons (место съёмки или объекта). null — геометки нет. */
  coord?: Coord | null;
};

export type Verdict = {
  decision: "main" | "part" | "hide";
  reason: string;
  /** Для выбора главного снимка среди подтверждённых. */
  score: number;
};

// \b в JS не работает с кириллицей, поэтому якорим только начало слова.
const WORD_START = "(?<![а-яёa-z])";

const PARK_WORDS = /(?<![а-яё])(парк|сад|пруд)(?![а-яё])|(?<![a-z])(park|garden)(?![a-z])/i;

const MAIN_RE = MAIN_WORDS.map((word) => new RegExp(WORD_START + word, "i"));
// «храм» ловим целым словом: иначе попадут фамилии и названия вроде «Храмцово».
const PART_RE = [...PART_WORDS, "храм(?![а-яё])"].map((word) => new RegExp(WORD_START + word, "i"));

function firstIndex(patterns: RegExp[], text: string) {
  let best = -1;
  for (const pattern of patterns) {
    const index = text.search(pattern);
    if (index >= 0 && (best < 0 || index < best)) best = index;
  }
  return best;
}

/** Роль здания по тексту: побеждает слово, которое встретилось раньше («Флигель главного дома» — флигель). */
export function roleOf(text: string): BuildingRole {
  const lower = text.toLowerCase();
  const main = firstIndex(MAIN_RE, lower);
  const part = firstIndex(PART_RE, lower);
  if (main < 0 && part < 0) return "unknown";
  if (part < 0) return "main";
  if (main < 0) return "part";
  return main < part ? "main" : "part";
}

/** Роль снимка. Если описание и имя файла спорят, не рискуем и возвращаем unknown. */
export function photoRole(filename: string, description?: string | null): BuildingRole {
  const byDescription = description ? roleOf(description) : "unknown";
  const byName = roleOf(decodePhotoName(filename));
  if (byDescription !== "unknown" && byName !== "unknown" && byDescription !== byName) return "unknown";
  return byDescription !== "unknown" ? byDescription : byName;
}

export type AddressRefs = { houses: string[]; structures: string[] };

const STREET = "(?:улица|ул|проспект|пр-т|переулок|пер|шоссе|набережная|наб|площадь|пл|бульвар|проезд)";
const NUMBER = "(\\d+(?:\\s*[-–/]\\s*\\d+)?[а-я]?)";

const HOUSE_PATTERNS = [
  new RegExp(`(?<![а-яё])(?:дом|д)\\.?\\s*№?\\s*${NUMBER}`, "g"),
  new RegExp(`(?<![а-яё])${STREET}\\.?\\s*,?\\s*${NUMBER}(?![\\d])`, "g"),
  new RegExp(`(?<![а-яё])${STREET}\\.?\\s+[а-яё][а-яё-]*(?:\\s+[а-яё][а-яё-]*)?\\s*,\\s*${NUMBER}(?![\\d])`, "g"),
];

const STRUCTURE_PATTERN = new RegExp(
  "(?<![а-яё])(?:строение|стр)\\.?\\s*(\\d+(?:\\s*\\(часть\\))?(?:\\s*(?:,|;|и)\\s*\\d+(?:\\s*\\(часть\\))?)*)",
  "g",
);

function expandRange(raw: string) {
  const clean = raw.replace(/\s+/g, "");
  const range = clean.match(/^(\d+)[-–/](\d+)([а-я]?)$/);
  if (range) return [range[1], `${range[2]}${range[3]}`];
  return [clean];
}

/** Номера домов и строений из адреса или описания файла. Латиницу не разбираем: честнее сказать «не знаю». */
export function addressRefs(text: string | null | undefined): AddressRefs {
  const lower = (text ?? "").toLowerCase();
  const houses = new Set<string>();
  for (const pattern of HOUSE_PATTERNS) {
    for (const match of lower.matchAll(pattern)) {
      for (const house of expandRange(match[1])) houses.add(house);
    }
  }
  const structures = new Set<string>();
  for (const match of lower.matchAll(STRUCTURE_PATTERN)) {
    for (const number of match[1].match(/\d+/g) ?? []) structures.add(number);
  }
  return { houses: [...houses], structures: [...structures] };
}

/** Сравнение адреса объекта с адресом, который назван в описании файла. */
export function compareAddress(estateAddress: string | null, photoText: string): AddressMatch {
  const estate = addressRefs(estateAddress);
  const photo = addressRefs(photoText);
  if (estate.houses.length === 0 || photo.houses.length === 0) return "unknown";
  if (!photo.houses.some((house) => estate.houses.includes(house))) return "mismatch";
  if (photo.structures.length > 0 && estate.structures.length > 0) {
    return photo.structures.some((item) => estate.structures.includes(item)) ? "match-structure" : "mismatch";
  }
  return "match";
}

/** Ансамбль по реестру, по составу или по адресу с несколькими строениями. */
export function isEnsembleLike(estate: EstateFacts) {
  return (
    estate.objectType === "Ансамбль" ||
    estate.partsCount > 0 ||
    addressRefs(estate.address).structures.length > 1
  );
}

/**
 * Что должно быть на главном фото объекта.
 * У ансамбля это всегда главное здание. У одиночного объекта, который сам флигель или церковь, — он сам.
 */
export function expectedRole(estate: EstateFacts): BuildingRole {
  if (isEnsembleLike(estate)) return "main";
  return roleOf(estate.name.slice(0, 60)) === "part" ? "part" : "main";
}

const SOURCE_SCORE: Record<PhotoSource, number> = { registry: 100, wikidata: 90, none: 0 };

/** Геометка файла в пределах этого расстояния от объекта считается подтверждением (камера может стоять через дорогу). */
export const GEO_NEAR_M = 250;
/** Дальше этого расстояния файл точно снят в другом месте. Между NEAR и FAR — ни да ни нет. */
export const GEO_FAR_M = 800;

export function distanceMeters(a: Coord, b: Coord) {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

export type GeoState = "near" | "between" | "far" | "unknown";

export function geoState(estate: EstateFacts, photo: PhotoFacts): { state: GeoState; meters: number | null } {
  if (estate.lat == null || estate.lng == null || !photo.coord) return { state: "unknown", meters: null };
  const meters = distanceMeters({ lat: estate.lat, lng: estate.lng }, photo.coord);
  const state = meters <= GEO_NEAR_M ? "near" : meters >= GEO_FAR_M ? "far" : "between";
  return { state, meters };
}

// Слова, по которым нельзя узнать конкретный объект: есть у тысяч названий. Сравниваем по основе (6 букв).
const GENERIC_STEMS = new Set(
  [
    "усадьб", "парк", "ансамб", "комплек", "здание", "здания", "главны", "корпус", "флигел", "церков", "храм",
    "часовн", "колоко", "амбар", "конюш", "кладов", "служеб", "хозяй", "каретн", "людска", "сарай", "ледник",
    "оранже", "беседк", "сторож", "приврат", "ворота", "ограда", "баня", "погреб", "ризниц", "павильо", "городс",
    "сельск", "бывшая", "бывший", "имени", "больни", "школа", "жилой", "жилые", "постро", "начало", "начала",
    "конец", "конца", "первая", "первой", "третья", "треть", "вторая", "второй", "половин", "старый", "старая",
    "новый", "новая", "большо", "малый", "малая", "основе", "основа", "россии", "российс", "дворец", "дворцо",
    "палаты", "палата", "особня", "особняк", "доходн", "жилого", "вотчин", "городс", "кварта", "владен",
  ].map((word) => word.slice(0, 6)),
);

const stemsOf = (text: string) =>
  new Set(
    (text.toLowerCase().match(/[а-яё]{5,}/g) ?? [])
      .map((word) => word.slice(0, 6))
      .filter((stem) => !GENERIC_STEMS.has(stem)),
  );

/** Отличительные слова названия объекта (фамилии владельцев, названия мест), которые встретились в тексте файла. */
export function nameTokensIn(estateName: string, photoText: string) {
  const own = stemsOf(estateName);
  const photo = stemsOf(photoText);
  return [...own].filter((stem) => photo.has(stem));
}

function verdict(decision: Verdict["decision"], reason: string, score = 0): Verdict {
  return { decision, reason, score };
}

export function judgePhoto(estate: EstateFacts, photo: PhotoFacts): Verdict {
  const text = `${photo.description ?? ""} ${decodePhotoName(photo.filename)}`;
  const trusted = photo.source !== "none";
  const role = photoRole(photo.filename, photo.description);
  const expected = expectedRole(estate);
  const address = compareAddress(estate.address, text);
  const ensemble = isEnsembleLike(estate);
  const kind = photoKind(photo.filename);
  const geo = geoState(estate, photo);
  const lowerName = decodePhotoName(photo.filename).toLowerCase();
  // photoKind сначала ищет «усадьбу», поэтому «Новый год у усадьбы» он не считает сценой. Для главного фото строже.
  const scene = kind === "scene" || SCENE_WORDS.some((word) => lowerName.includes(word));

  if (scene && role !== "main") return verdict("hide", "праздник, мероприятие или случайный кадр");
  // Снято далеко от объекта: ловит снимки из районных категорий вроде «Cultural heritage monuments in … District».
  // Реестру (ЕГРОКН) верим без геометки, у него её нет.
  if (geo.state === "far" && photo.source !== "registry") {
    return verdict("hide", `геометка файла в ${((geo.meters ?? 0) / 1000).toFixed(1)} км от объекта`);
  }
  if (!trusted && address === "mismatch") {
    return verdict("hide", "в описании файла другой дом или строение, чем в реестре");
  }
  if (kind === "place" && expected === "main" && !PARK_WORDS.test(estate.name)) {
    return verdict("part", "парк, пруд или сад, а не здание");
  }
  if (role === "part" && expected === "main") {
    return verdict("part", "на снимке вспомогательное здание или сооружение");
  }
  if (role === "main" && expected === "part") {
    return verdict("part", "на снимке главный дом, а объект реестра — вспомогательное здание");
  }

  const nameTokens = nameTokensIn(estate.name, text);
  const evidence: string[] = [];
  if (geo.state === "near") evidence.push(`геометка в ${Math.round(geo.meters ?? 0)} м`);
  if (address === "match-structure") evidence.push("адрес и строение совпали");
  else if (address === "match") evidence.push("адрес совпал");
  if (nameTokens.length > 0) evidence.push("название в описании");

  const score =
    SOURCE_SCORE[photo.source] +
    (role === "main" ? 30 : 0) +
    (address === "match-structure" ? 20 : address === "match" ? 10 : 0) +
    (geo.state === "near" ? 15 : 0) +
    (nameTokens.length > 0 ? 5 : 0);

  if (trusted) return verdict("main", "снимок привязан к объекту источником", score);

  // Дальше только снимки из категорий Commons. Категория может оказаться районной, поэтому сама по себе не доказательство.
  if (evidence.length === 0) {
    return verdict("hide", "нет подтверждения: ни геометки рядом, ни адреса, ни названия объекта в описании");
  }
  if (ensemble && role !== "main") {
    return verdict("hide", "у ансамбля нет подтверждения, что на снимке главное здание");
  }
  return verdict("main", `подтверждено: ${evidence.join(", ")}`, score);
}
