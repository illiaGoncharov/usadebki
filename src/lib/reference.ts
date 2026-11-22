/**
 * Справка для фильтров.
 * Губерния — не граница 1914 года, а привычное имя земли,
 * на которой сегодня лежит регион реестра. Несколько субъектов
 * могут делить одну губернию, и наоборот.
 */

export type Gubernia = {
  id: string;
  name: string;
  regions: string[];
  note: string;
};

export const GUBERNIAS: Gubernia[] = [
  {
    id: "moscow",
    name: "Московская губерния",
    regions: ["50", "77"],
    note: "К 1914 году город и почти вся нынешняя область числились в Московской губернии. Уезды с тех пор перекраивали.",
  },
  {
    id: "petersburg",
    name: "Санкт-Петербургская губерния",
    regions: ["47", "78"],
    note: "До августа 1914 года губерния была Санкт-Петербургской, затем Петроградской. Нынешняя область шире старых уездов.",
  },
  {
    id: "kostroma",
    name: "Костромская губерния",
    regions: ["44"],
    note: "Костромская область собрана вокруг Костромской губернии, но уезды по краям отошли соседям.",
  },
  {
    id: "yaroslavl",
    name: "Ярославская губерния",
    regions: ["76"],
    note: "Ярославская область в основном лежит на месте Ярославской губернии.",
  },
  {
    id: "vladimir",
    name: "Владимирская губерния",
    regions: ["33"],
    note: "Владимирская область — ядро Владимирской губернии. Иваново из неё позже выделили отдельно.",
  },
  {
    id: "ivanovo",
    name: "Владимирская и Костромская губернии",
    regions: ["37"],
    note: "Ивановская область собрана из уездов Владимирской и Костромской губерний. Своей губернии у Иваново не было.",
  },
  {
    id: "tver",
    name: "Тверская губерния",
    regions: ["69"],
    note: "Тверская область в основном продолжает Тверскую губернию.",
  },
  {
    id: "kaluga",
    name: "Калужская губерния",
    regions: ["40"],
    note: "Калужская область в основном продолжает Калужскую губернию.",
  },
  {
    id: "tula",
    name: "Тульская губерния",
    regions: ["71"],
    note: "Тульская область в основном продолжает Тульскую губернию.",
  },
  {
    id: "ryazan",
    name: "Рязанская губерния",
    regions: ["62"],
    note: "Рязанская область — ядро Рязанской губернии, без части западных уездов.",
  },
  {
    id: "smolensk",
    name: "Смоленская губерния",
    regions: ["67"],
    note: "Смоленская область в основном продолжает Смоленскую губернию.",
  },
  {
    id: "nizhny",
    name: "Нижегородская губерния",
    regions: ["52"],
    note: "Нижегородская область собрана вокруг Нижегородской губернии.",
  },
  {
    id: "kazan",
    name: "Казанская губерния",
    regions: ["16", "12"],
    note: "Казань и большая часть Марий Эл лежали в Казанской губернии. Губерния была шире сегодняшней республики.",
  },
  {
    id: "chuvash",
    name: "Казанская и Симбирская губернии",
    regions: ["21"],
    note: "Чувашия собрана из уездов Казанской и Симбирской губерний.",
  },
  {
    id: "simbirsk",
    name: "Симбирская губерния",
    regions: ["73"],
    note: "Ульяновск до 1924 года назывался Симбирском, область — ядро Симбирской губернии.",
  },
  {
    id: "samara",
    name: "Самарская губерния",
    regions: ["63"],
    note: "Самарская область — часть большой Самарской губернии, которая уходила далеко на восток.",
  },
  {
    id: "saratov",
    name: "Саратовская губерния",
    regions: ["64"],
    note: "Саратовская область уже старой Саратовской губернии: Царицын отошёл к Волгограду.",
  },
  {
    id: "tsaritsyn",
    name: "Саратовская губерния, царицынская сторона",
    regions: ["34"],
    note: "Волгоград вырос из Царицына Саратовской губернии. Юг области ближе к Астраханской.",
  },
  {
    id: "astrakhan",
    name: "Астраханская губерния",
    regions: ["30"],
    note: "Астраханская область — север старой Астраханской губернии. Степь южнее отошла соседям.",
  },
  {
    id: "penza",
    name: "Пензенская губерния",
    regions: ["58"],
    note: "Пензенская область в основном продолжает Пензенскую губернию.",
  },
  {
    id: "mordovia",
    name: "Пензенская, Симбирская и Тамбовская губернии",
    regions: ["13"],
    note: "Мордовия собрана из кусков Пензенской, Симбирской и Тамбовской губерний.",
  },
  {
    id: "tambov",
    name: "Тамбовская губерния",
    regions: ["68"],
    note: "Тамбовская область — ядро Тамбовской губернии.",
  },
  {
    id: "lipetsk",
    name: "Тамбовская, Орловская и Рязанская губернии",
    regions: ["48"],
    note: "Липецкой губернии не было. Область сложена из уездов Тамбовской, Орловской и Рязанской.",
  },
  {
    id: "voronezh",
    name: "Воронежская губерния",
    regions: ["36"],
    note: "Воронежская область в основном продолжает Воронежскую губернию.",
  },
  {
    id: "oryol",
    name: "Орловская губерния",
    regions: ["57"],
    note: "Орловская область уже старой Орловской губернии: Брянск был её западной частью.",
  },
  {
    id: "bryansk",
    name: "Орловская и Черниговская губернии",
    regions: ["32"],
    note: "Брянск был уездным городом Орловской губернии, запад области захватывал Черниговскую.",
  },
  {
    id: "kursk",
    name: "Курская губерния",
    regions: ["46", "31"],
    note: "Курск и Белгород лежали в Курской губернии. Белгород был уездным городом.",
  },
  {
    id: "don",
    name: "Область Войска Донского",
    regions: ["61"],
    note: "Ростов-на-Дону был центром Области Войска Донского, не губернским городом.",
  },
  {
    id: "luhansk",
    name: "Область Войска Донского, восточные округа",
    regions: ["94"],
    note: "Восточнее Донца лежали округа Области Войска Донского. Это не отдельная губерния.",
  },
  {
    id: "ekaterinoslav",
    name: "Екатеринославская губерния",
    regions: ["90"],
    note: "Запорожье входило в Екатеринославскую губернию. Губернским городом был Екатеринослав, ныне Днепр.",
  },
  {
    id: "kuban",
    name: "Кубанская область",
    regions: ["23", "01"],
    note: "Краснодар и Адыгея лежали в Кубанской области, а не в губернии. Центром был Екатеринодар.",
  },
  {
    id: "stavropol",
    name: "Ставропольская губерния",
    regions: ["26"],
    note: "Ставропольский край шире Ставропольской губернии, но ядро то же.",
  },
  {
    id: "terek",
    name: "Терская область",
    regions: ["15"],
    note: "Владикавказ был центром Терской области.",
  },
  {
    id: "dagestan",
    name: "Дагестанская область",
    regions: ["05"],
    note: "Дагестан был областью, не губернией. Областным городом был Темир-Хан-Шура, ныне Буйнакск.",
  },
  {
    id: "tavrida",
    name: "Таврическая губерния",
    regions: ["91", "92"],
    note: "Крым и Севастополь входили в Таврическую губернию. Губернским городом был Симферополь.",
  },
  {
    id: "vologda",
    name: "Вологодская губерния",
    regions: ["35"],
    note: "Вологодская область уже огромной Вологодской губернии: восток отошёл к Коми и Перми.",
  },
  {
    id: "arkhangelsk",
    name: "Архангельская губерния",
    regions: ["29"],
    note: "Архангельская область — запад старой Архангельской губернии.",
  },
  {
    id: "novgorod",
    name: "Новгородская губерния",
    regions: ["53"],
    note: "Новгородская область в основном продолжает Новгородскую губернию.",
  },
  {
    id: "pskov",
    name: "Псковская губерния",
    regions: ["60"],
    note: "Псковская область в основном продолжает Псковскую губернию.",
  },
  {
    id: "olonets",
    name: "Олонецкая губерния",
    regions: ["10"],
    note: "Южная Карелия входила в Олонецкую губернию, север — в Архангельскую. Центром был Петрозаводск.",
  },
  {
    id: "vyatka",
    name: "Вятская губерния",
    regions: ["43", "18"],
    note: "Киров до 1934 года назывался Вяткой. Удмуртия была восточными уездами той же губернии.",
  },
  {
    id: "perm",
    name: "Пермская губерния",
    regions: ["59", "66"],
    note: "Пермь и Екатеринбург были одной Пермской губернией. Екатеринбург был уездным городом.",
  },
  {
    id: "ufa",
    name: "Уфимская и Оренбургская губернии",
    regions: ["02"],
    note: "Башкирия собрана из Уфимской губернии и востока Оренбургской.",
  },
  {
    id: "orenburg",
    name: "Оренбургская губерния",
    regions: ["56", "74"],
    note: "Оренбург и Челябинск лежали в Оренбургской губернии. Челябинск был уездным городом.",
  },
  {
    id: "tobolsk",
    name: "Тобольская губерния",
    regions: ["72", "45", "86", "89"],
    note: "Тюмень, Курган и север Западной Сибири входили в Тобольскую губернию.",
  },
  {
    id: "akmola",
    name: "Акмолинская область",
    regions: ["55"],
    note: "Омск был центром Акмолинской области, не сибирской губернии.",
  },
  {
    id: "tomsk",
    name: "Томская губерния",
    regions: ["70", "22", "54", "42", "04"],
    note: "Томск, Алтай, Новониколаевск (Новосибирск) и Кузбасс лежали в Томской губернии.",
  },
  {
    id: "yenisei",
    name: "Енисейская губерния",
    regions: ["24", "19"],
    note: "Красноярск был губернским городом Енисейской губернии, Хакасия — её югом.",
  },
  {
    id: "irkutsk",
    name: "Иркутская губерния",
    regions: ["38"],
    note: "Иркутская область в основном продолжает Иркутскую губернию.",
  },
  {
    id: "yakut",
    name: "Якутская область",
    regions: ["14"],
    note: "Якутия была областью, не губернией.",
  },
  {
    id: "zabaykal",
    name: "Забайкальская область",
    regions: ["75", "03"],
    note: "Чита и Бурятия входили в Забайкальскую область. Областным городом была Чита.",
  },
  {
    id: "amur",
    name: "Амурская область",
    regions: ["28"],
    note: "Амурская область и в имперское время была областью, с центром в Благовещенске.",
  },
  {
    id: "prussia",
    name: "Восточная Пруссия",
    regions: ["39"],
    note: "Калининградская область до 1945 года была северной частью Восточной Пруссии и российской губернией не была.",
  },
];

export function guberniaById(id: string | undefined) {
  if (!id) return null;
  return GUBERNIAS.find((item) => item.id === id) ?? null;
}

export function guberniaByRegion(regionId: string | undefined) {
  if (!regionId) return null;
  return GUBERNIAS.find((item) => item.regions.includes(regionId)) ?? null;
}

/** Крупные города, от которых считаем прямую, не дорогу. */
export const AGGLOMERATIONS = [
  { name: "Москвы", cityLabel: "Москва", withinKm: 35, lat: 55.7558, lng: 37.6173 },
  { name: "Петербурга", cityLabel: "Санкт-Петербург", withinKm: 30, lat: 59.9311, lng: 30.3609 },
  { name: "Новосибирска", cityLabel: "Новосибирск", withinKm: 20, lat: 55.0084, lng: 82.9357 },
  { name: "Екатеринбурга", cityLabel: "Екатеринбург", withinKm: 20, lat: 56.8389, lng: 60.6057 },
  { name: "Казани", cityLabel: "Казань", withinKm: 20, lat: 55.7961, lng: 49.1064 },
  { name: "Нижнего Новгорода", cityLabel: "Нижний Новгород", withinKm: 20, lat: 56.3269, lng: 44.0059 },
  { name: "Челябинска", cityLabel: "Челябинск", withinKm: 18, lat: 55.1644, lng: 61.4368 },
  { name: "Самары", cityLabel: "Самара", withinKm: 18, lat: 53.1959, lng: 50.1002 },
  { name: "Омска", cityLabel: "Омск", withinKm: 18, lat: 54.9885, lng: 73.3242 },
  { name: "Ростова", cityLabel: "Ростов-на-Дону", withinKm: 18, lat: 47.2357, lng: 39.7015 },
  { name: "Уфы", cityLabel: "Уфа", withinKm: 18, lat: 54.7388, lng: 55.9721 },
  { name: "Красноярска", cityLabel: "Красноярск", withinKm: 18, lat: 56.0153, lng: 92.8932 },
  { name: "Воронежа", cityLabel: "Воронеж", withinKm: 18, lat: 51.6608, lng: 39.2003 },
  { name: "Перми", cityLabel: "Пермь", withinKm: 18, lat: 58.0105, lng: 56.2502 },
  { name: "Волгограда", cityLabel: "Волгоград", withinKm: 18, lat: 48.708, lng: 44.5133 },
  { name: "Краснодара", cityLabel: "Краснодар", withinKm: 18, lat: 45.0355, lng: 38.9753 },
] as const;

export type AgglomerationRef = (typeof AGGLOMERATIONS)[number];

/** Текст для блока «До города» и ленты: внутри агломерации — только название, иначе «N км от …». */
export function formatAgglomerationDistance(
  input: { name: string; cityLabel: string; km: number; withinKm: number } | null,
) {
  if (!input) return null;
  if (input.km <= input.withinKm) return input.cityLabel;
  return `${input.km} км от ${input.name}`;
}

export function formatCatalogDistance(cityGenitive: string, km: number) {
  const agg = AGGLOMERATIONS.find((item) => item.name === cityGenitive);
  const rounded = Math.round(km);
  if (!agg) return `${rounded} км от ${cityGenitive}`;
  return formatAgglomerationDistance({ ...agg, km: rounded }) ?? `${rounded} км от ${cityGenitive}`;
}

export function nearestAgglomeration(lat: number, lng: number) {
  let best: AgglomerationRef = AGGLOMERATIONS[0];
  let bestKm = Number.POSITIVE_INFINITY;
  for (const city of AGGLOMERATIONS) {
    const km = haversine(lat, lng, city.lat, city.lng);
    if (km < bestKm) {
      best = city;
      bestKm = km;
    }
  }
  return { ...best, km: Math.round(bestKm) };
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLng = (lng2 - lng1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

export const ERAS = [
  { id: "pre", label: "до XVIII века" },
  { id: "18", label: "XVIII век" },
  { id: "19", label: "XIX век" },
  { id: "20", label: "XX век" },
  { id: "none", label: "дата не разобрана" },
] as const;

export type EraId = (typeof ERAS)[number]["id"];

export const RANKS = [
  { id: "federal", label: "федеральная", value: "Федерального значения" },
  { id: "regional", label: "региональная", value: "Регионального значения" },
  { id: "local", label: "местная", value: "Местного (муниципального) значения" },
] as const;

export type RankId = (typeof RANKS)[number]["id"];

export const KINDS = [
  { id: "ensemble", label: "ансамбль", value: "Ансамбль" },
  { id: "monument", label: "памятник", value: "Памятник" },
  { id: "place", label: "достопримечательное место", value: "Достопримечательное место" },
] as const;

export type KindId = (typeof KINDS)[number]["id"];

export const DISTANCES = [
  { id: "near", label: "до 50 км от большого города" },
  { id: "mid", label: "50–150 км" },
  { id: "far", label: "дальше 150 км" },
  { id: "none", label: "нет координат" },
] as const;

export type DistanceId = (typeof DISTANCES)[number]["id"];

export const STYLES = [
  { id: "baroque", label: "барокко" },
  { id: "rococo", label: "рококо" },
  { id: "classical", label: "классицизм" },
  { id: "neoclassical", label: "неоклассицизм" },
  { id: "empire", label: "ампир" },
  { id: "eclectic", label: "эклектика" },
  { id: "retrospective", label: "ретроспективизм" },
  { id: "moderne", label: "модерн" },
  { id: "neogothic", label: "неоготика" },
  { id: "neorussian", label: "неорусский" },
  { id: "renaissance", label: "неоренессанс" },
  { id: "brick", label: "кирпичный стиль" },
  { id: "wooden", label: "деревянное зодчество" },
  { id: "moorish", label: "мавританский" },
  { id: "chateau", label: "шатоэск" },
  { id: "beaux", label: "бозар" },
  { id: "stalinist", label: "сталинский ампир" },
] as const;

export type StyleId = (typeof STYLES)[number]["id"];

export function isEraId(value: string): value is EraId {
  return ERAS.some((item) => item.id === value);
}

export function isRankId(value: string): value is RankId {
  return RANKS.some((item) => item.id === value);
}

export function isKindId(value: string): value is KindId {
  return KINDS.some((item) => item.id === value);
}

export function isDistanceId(value: string): value is DistanceId {
  return DISTANCES.some((item) => item.id === value);
}

/** QID стиля в Wikidata → наш короткий id. Близкие имена одного направления схлопнуты. */
export const WIKI_STYLE: Record<string, StyleId> = {
  Q840829: "baroque",
  Q37853: "baroque",
  Q2636415: "baroque",
  Q2359372: "baroque",
  Q911397: "baroque",
  Q3635094: "baroque",
  Q19910996: "baroque",
  Q616753: "baroque",
  Q4418329: "baroque",
  Q4141616: "baroque",
  Q1542287: "baroque",
  Q122960: "rococo",
  Q7356060: "rococo",
  Q170292: "classical",
  Q3621606: "classical",
  Q7382246: "classical",
  Q4198718: "classical",
  Q264649: "classical",
  Q50084199: "classical",
  // Неоклассицизм (в т.ч. XX в.) — отдельно от классицизма.
  Q54111: "neoclassical",
  Q14378: "neoclassical",
  Q1788409: "neoclassical",
  Q191105: "empire",
  Q112711827: "empire",
  Q28666761: "empire",
  Q4439247: "stalinist",
  Q1134824: "stalinist",
  Q93899018: "stalinist",
  Q2479493: "eclectic",
  Q2537632: "eclectic",
  Q23752285: "eclectic",
  Q192068: "eclectic",
  Q51879601: "eclectic",
  Q277466: "eclectic",
  Q4393722: "retrospective",
  Q34636: "moderne",
  Q1295040: "moderne",
  Q117005626: "moderne",
  Q1077702: "moderne",
  Q186363: "neogothic",
  Q942123: "neogothic",
  Q750752: "neogothic",
  Q695863: "neogothic",
  Q46825: "neogothic",
  Q176483: "neogothic",
  Q2026876: "neorussian",
  Q2860359: "neorussian",
  Q502163: "renaissance",
  Q4692: "renaissance",
  Q236122: "renaissance",
  Q3501272: "renaissance",
  Q1404472: "renaissance",
  Q4221815: "brick",
  Q4426604: "wooden",
  Q27055630: "wooden",
  Q247492: "moorish",
  Q74156: "moorish",
  Q5118885: "chateau",
  Q1268134: "beaux",
};

const STYLE_RANK: StyleId[] = [
  "stalinist",
  "empire",
  "neogothic",
  "neorussian",
  "moderne",
  "rococo",
  "baroque",
  "renaissance",
  "brick",
  "retrospective",
  "moorish",
  "chateau",
  "beaux",
  "eclectic",
  // Неоклассицизм раньше классицизма: иначе «неоклассицизм» поймает /классицизм/.
  "neoclassical",
  "classical",
  "wooden",
];

export function wikiStyleIds(qids: string[], labels: string[] = []) {
  const ids = new Set<StyleId>();
  for (const qid of qids) {
    const id = WIKI_STYLE[qid];
    if (id) ids.add(id);
  }
  for (const label of labels) {
    const id = styleFromText(label);
    if (id) ids.add(id);
  }
  return STYLE_RANK.filter((id) => ids.has(id));
}

export function pickWikiStyle(qids: string[], labels: string[] = []) {
  return wikiStyleIds(qids, labels)[0] ?? null;
}

/** Стиль из подписи Wikidata или вступления Википедии. Только явные слова. */
const STYLE_TEXT: { id: StyleId; pattern: RegExp }[] = [
  { id: "stalinist", pattern: /сталинск/i },
  { id: "empire", pattern: /ампир/i },
  { id: "neogothic", pattern: /неоготик|псевдоготик|готик/i },
  { id: "neorussian", pattern: /неорусск|псевдорусск|русско-византийск|русск(?:ий|ого|ом) стил/i },
  { id: "moderne", pattern: /(?:в\s+стиле\s+модерн|стиля\s+модерн|модерна\b|северн\S*\s+модерн)/i },
  { id: "rococo", pattern: /рококо/i },
  { id: "baroque", pattern: /барокк|нарышкинск/i },
  { id: "renaissance", pattern: /ренессанс|возрожден/i },
  { id: "brick", pattern: /кирпичн\S*\s+стил/i },
  { id: "retrospective", pattern: /ретроспектив/i },
  { id: "moorish", pattern: /мавритан/i },
  { id: "chateau", pattern: /шатоэск/i },
  { id: "beaux", pattern: /бозар|beaux-arts/i },
  { id: "eclectic", pattern: /эклектик|историзм/i },
  { id: "neoclassical", pattern: /неоклассиц/i },
  { id: "classical", pattern: /(?<!нео)классицизм|палладиан/i },
  { id: "wooden", pattern: /деревянн\S*\s+зодчеств/i },
];

export function stylesFromText(text: string) {
  return STYLE_RANK.filter((id) => STYLE_TEXT.find((item) => item.id === id)?.pattern.test(text));
}

export function styleFromText(text: string) {
  return stylesFromText(text)[0] ?? null;
}

export function isStyleId(value: string): value is StyleId {
  return STYLES.some((item) => item.id === value);
}

export function areValidStyleIds(raw: string): boolean {
  const ids = raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  return ids.length > 0 && ids.every((id) => isStyleId(id));
}

export function formatStyleLabels(raw: string | null | undefined): string {
  if (!raw) return "не указан";
  const ids = raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  const labels = ids.map((id) => (isStyleId(id) ? styleLabel(id) : id));
  return labels.length > 0 ? labels.join(", ") : "не указан";
}

export function styleLabel(id: string | null | undefined) {
  return STYLES.find((item) => item.id === id)?.label ?? "не указан";
}

export function rankLabel(id: string | null | undefined) {
  return RANKS.find((item) => item.id === id)?.label ?? id ?? "";
}

export function shortRank(category: string | null | undefined) {
  return RANKS.find((item) => item.value === category)?.label ?? category ?? "охрана не указана";
}

export function shortKind(objectType: string | null | undefined) {
  return KINDS.find((item) => item.value === objectType)?.label ?? objectType ?? "";
}
