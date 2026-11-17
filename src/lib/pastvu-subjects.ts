import type { PastVuPhoto } from "@/lib/pastvu";

/**
 * Сюжет кадра по подписи PastVu: «что на фото», а не «где снято».
 * У большого ансамбля все снимки лежат в нескольких десятках метров друг от друга,
 * поэтому по координатам их не различить — зато по подписи видно, что это разные объекты.
 *
 * Порядок важен: сначала конкретные части («флигель конного двора» → флигель),
 * потом общие («конный двор»).
 */
const SUBJECTS: Array<{ key: string; re: RegExp }> = [
  { key: "people", re: /сотрудник|экскурсант|посетител|демонстрац|отдыхающ|люди|портрет/ },
  { key: "pavilion", re: /павильон|колоннад/ },
  { key: "wing", re: /флигел/ },
  { key: "sculpture", re: /скульптур|статуя|статуи|диоскур|укротител|бюст|ваза|фонтан/ },
  { key: "church", re: /церков|храм|собор|часовн|колокольн/ },
  { key: "gate", re: /ворота|ограда|решетк|калитк|въезд|сторожк/ },
  { key: "bridge", re: /(^|[^а-я])мост/ },
  { key: "water", re: /пруд|мельниц|плотин|канал|озер|остров/ },
  { key: "park", re: /парк|аллея|аллеи|(^|[^а-я])сад(?![а-я])|оранжере|беседк|грот|вид на/ },
  { key: "mainhouse", re: /главн\S* дом|дворец|господск|усадебн\S* дом|особняк|палаты|барский/ },
  { key: "stable", re: /конн\S* двор|конюшн|манеж/ },
];

/** Слова, которые есть почти в каждой подписи и сюжет не определяют. */
const NOISE = new Set(["усадьба", "усадьбе", "усадьбы", "вид", "общий", "фото", "год", "года"]);

function normalize(title: string) {
  return title.toLowerCase().replace(/ё/g, "е");
}

/** Ключ сюжета. Подпись из одного топонима («Кузьминки») — это «общий вид». */
export function pastVuSubject(title: string | null | undefined, toponymStems: string[] = []) {
  const t = normalize(title ?? "");
  if (!t.trim()) return "general";
  for (const subject of SUBJECTS) {
    if (subject.re.test(t)) return subject.key;
  }
  const words = t
    .split(/[^a-zа-я0-9]+/)
    .filter((w) => w.length >= 4 && !NOISE.has(w) && !toponymStems.some((s) => w.startsWith(s)));
  if (words.length === 0) return "general";
  return `other:${words.slice(0, 2).map((w) => w.slice(0, 5)).join("-")}`;
}

export function isPeoplePastVuPhoto(photo: PastVuPhoto) {
  return pastVuSubject(photo.title) === "people";
}

function photoYear(photo: PastVuPhoto) {
  return photo.year ?? photo.year2 ?? 9999;
}

/**
 * Разнообразная сетка: по одному кадру на сюжет, самые «снимаемые» сюжеты первыми.
 * Если сюжетов мало (< minTiles), добираем вторым кадром из больших групп с другой эпохой.
 */
export function pickDiversePastVuGallery(
  photos: PastVuPhoto[],
  options: { max?: number; minTiles?: number; toponymStems?: string[] } = {},
) {
  const { max = 8, minTiles = 1, toponymStems = [] } = options;

  const groups = new Map<string, PastVuPhoto[]>();
  for (const photo of photos) {
    const key = pastVuSubject(photo.title, toponymStems);
    if (key === "people") continue;
    const list = groups.get(key) ?? [];
    list.push(photo);
    groups.set(key, list);
  }

  // Внутри сюжета — самый старый кадр: страница называется «как выглядело раньше».
  const ordered = [...groups.values()]
    .map((list) => [...list].sort((a, b) => photoYear(a) - photoYear(b) || a.cid - b.cid))
    .sort((a, b) => b.length - a.length);

  const picked: PastVuPhoto[] = ordered.slice(0, max).map((list) => list[0]!);

  if (picked.length < minTiles) {
    for (const list of ordered) {
      if (picked.length >= Math.min(minTiles, max)) break;
      if (list.length < 2) continue;
      const first = list[0]!;
      const extras = [...list.slice(1)].sort(
        (a, b) => Math.abs(photoYear(b) - photoYear(first)) - Math.abs(photoYear(a) - photoYear(first)),
      );
      for (const other of extras) {
        if (picked.length >= Math.min(minTiles, max)) break;
        if (picked.some((p) => p.cid === other.cid)) continue;
        picked.push(other);
      }
    }
  }

  if (picked.length < minTiles) {
    const flat = ordered.flat().filter((p) => !picked.some((x) => x.cid === p.cid));
    for (const photo of flat) {
      if (picked.length >= Math.min(minTiles, max)) break;
      picked.push(photo);
    }
  }

  return picked.slice(0, max);
}