/**
 * Правила отбора PastVu: что относится к объекту (подпись, адрес) и как не повторяться (сюжет).
 * Запуск: npm run pastvu:test
 *
 * Подписи Кузьминок взяты из реального ответа PastVu: все 30 снимков лежат в ~50 м друг от друга,
 * поэтому разнообразие считаем по сюжету, а не по координатам.
 */
import assert from "node:assert/strict";
import type { PastVuPhoto } from "../src/lib/pastvu";
import {
  estateToponymStems,
  filterPastVuGalleryPhotos,
  filterRelevantPastVuPhotos,
  isWideEstatePastVu,
  pastVuSearchPages,
  pickRelevantPastVuHero,
  scorePastVuRelevance,
  streetNamesFromEstateAddress,
  structureNumberFromPastVuTitle,
  type PastVuEstateContext,
} from "../src/lib/pastvu-match";
import { pastVuSubject, pickDiversePastVuGallery } from "../src/lib/pastvu-subjects";

function photo(
  title: string,
  cid = 1,
  opts?: { year?: number; lat?: number; lng?: number },
): PastVuPhoto {
  return {
    cid,
    file: "x.jpg",
    title,
    year: opts?.year ?? 1987,
    year2: null,
    author: null,
    source: null,
    thumb: "",
    full: "",
    link: "",
    lat: opts?.lat ?? 55.76,
    lng: opts?.lng ?? 37.63,
  };
}

const KUZMINKI: PastVuEstateContext = {
  name: 'Ансамбль подмосковной усадьбы "Кузьминки"',
  address:
    "г. Москва, вн.тер.г. м.о. Выхино-Жулебино, ул. Старые Кузьминки, д. 2, 3, 4, 5, 6, 7, 8 (часть), 9; ул. Кузьминская, д. 7, стр. 1, 2; Тополевая аллея, д. 4; д. 8, 10, 16",
  objectType: "Ансамбль",
  displayTitle: 'Ансамбль подмосковной усадьбы "Кузьминки"',
  lat: 55.68906,
  lng: 37.784704,
};

const POCHTAMT: PastVuEstateContext = {
  name: '"Старый Московский Почтамт" (в основе усадьба Демидовых), XIX в. - 1-я треть XX в.',
  address: "г. Москва, ул. Мясницкая, д.40, стр.1, 5, 10 (часть), 16",
  objectType: "Ансамбль",
  displayTitle: "Старый Московский Почтамт",
};

// Реальные подписи PastVu у Кузьминок (почти все — про один Конный двор).
const KUZMINKI_TITLES: Array<[string, number]> = [
  ["Оформление портала бокового флигеля конного двора", 1950],
  ["Флигель конного двора на реставрации", 1950],
  ["Левый корпус конного двора", 1928],
  ["Кузьминки", 1909],
  ["Усадьба Кузьминки. Левый флигель конного двора", 1909],
  ["Кузьминки", 1909],
  ["Конный двор в усадьбе Кузьминки", 1938],
  ["Усадьба Голицыных", 1960],
  ["Задний фасад конного двора", 1922],
  ["Кузьминки. Конный двор", 1914],
  ["Усадьба Кузьминки. Музыкальный павильон", 1971],
  ["Кузьминки. Конный двор", 1900],
  ["Сбор воды. Парк Кузьминки", 1953],
  ["Скульптура у Конного двора", 1930],
  ["Южная из скульптур группы «Укротители коней» у Музыкального павильона", 1969],
  ["Сотрудники американского посольства в Кузьминках", 1953],
  ["Вид на Мельницу от Верхнего Кузьминского пруда", 1981],
  ["Конный двор", 1967],
];

function kuzminkiPhotos() {
  return KUZMINKI_TITLES.map(([title, year], i) =>
    photo(title, i + 1, { year, lat: 55.68906 + (i % 5) * 0.0001, lng: 37.7847 + (i % 4) * 0.0001 }),
  );
}

let failed = 0;
function check(name: string, run: () => void) {
  try {
    run();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL ${name}\n       ${error instanceof Error ? error.message : error}`);
  }
}

// --- Относится ли снимок к объекту -----------------------------------------

check("стр. 4 из подписи отсекается", () => {
  assert.equal(structureNumberFromPastVuTitle("Кирова ул. дом 40 стр. 4"), 4);
  assert.equal(scorePastVuRelevance(photo("Кирова ул. дом 40 стр. 4"), POCHTAMT), -1);
});

check("почтамт + Мясницкая 40 проходит", () => {
  assert.ok(scorePastVuRelevance(photo("Москва, Мясницкая ул., д. 40, почтамт"), POCHTAMT) >= 8);
});

check("пустая подпись не попадает в шапку", () => {
  assert.equal(scorePastVuRelevance(photo(""), POCHTAMT), -1);
});

check("hero не берёт соседнее строение", () => {
  const list = [photo("Кирова ул. дом 40 стр. 4", 1), photo("Мясницкая 40, стр. 5, конюшни", 2)];
  assert.equal(pickRelevantPastVuHero(list, 55.76, 37.63, POCHTAMT)?.cid, 2);
});

check("filter оставляет только релевантные для компактного объекта", () => {
  const list = [
    photo("Кирова ул. дом 40 стр. 4", 1),
    photo("Мясницкая 40, стр. 5, конюшни", 2),
    photo("улица рядом без названия памятника", 3),
  ];
  assert.deepEqual(
    filterRelevantPastVuPhotos(list, POCHTAMT).map((p) => p.cid),
    [2],
  );
});

check("Почтамт — компактный ансамбль, а не «большой комплекс»", () => {
  assert.equal(isWideEstatePastVu(POCHTAMT), false);
  assert.equal(pastVuSearchPages(POCHTAMT), 2);
});

check("Кузьминки — большой комплекс: 3 страницы, несколько улиц", () => {
  assert.equal(isWideEstatePastVu(KUZMINKI), true);
  assert.equal(pastVuSearchPages(KUZMINKI), 3);
  const streets = streetNamesFromEstateAddress(KUZMINKI.address);
  assert.ok(streets.some((s) => s.includes("кузьминск")));
  assert.ok(streets.some((s) => s.includes("старые")));
});

check("Кузьминки: «Конный двор» без топонима проходит, чужой дом и люди — нет", () => {
  const list = filterPastVuGalleryPhotos(
    [
      photo("Конный двор", 1, { lat: 55.6891, lng: 37.7848 }),
      photo("Сотрудники американского посольства в Кузьминках", 2, { lat: 55.6891, lng: 37.7848 }),
      photo("Москва, Арбат, д. 25", 3, { lat: 55.6891, lng: 37.7848 }),
      photo("Конный двор", 4, { lat: 55.75, lng: 37.9 }),
    ],
    KUZMINKI,
  );
  // Люди остаются в фильтре как «относящиеся», но в сетку их не возьмёт выбор сюжетов.
  assert.deepEqual(
    list.map((p) => p.cid).sort(),
    [1, 2],
  );
});

// --- Сюжеты и разнообразие -------------------------------------------------

check("сюжет определяется по подписи, а не по координатам", () => {
  assert.equal(pastVuSubject("Флигель конного двора на реставрации"), "wing");
  assert.equal(pastVuSubject("Конный двор-музыкальный павильон"), "pavilion");
  assert.equal(pastVuSubject("Скульптура у Конного двора"), "sculpture");
  assert.equal(pastVuSubject("Задний фасад конного двора"), "stable");
  assert.equal(pastVuSubject("Сбор воды. Парк Кузьминки"), "park");
  assert.equal(pastVuSubject("Сотрудники американского посольства в Кузьминках"), "people");
});

check("подпись из одного топонима — «общий вид»", () => {
  const stems = estateToponymStems(KUZMINKI);
  assert.equal(pastVuSubject("Кузьминки", stems), "general");
  assert.equal(pastVuSubject("Усадьба Кузьминки", stems), "general");
});

check("Кузьминки: из 18 снимков одного двора получаем 4–8 разных сюжетов", () => {
  const stems = estateToponymStems(KUZMINKI);
  const out = pickDiversePastVuGallery(kuzminkiPhotos(), { max: 8, minTiles: 4, toponymStems: stems });
  const subjects = out.map((p) => pastVuSubject(p.title, stems));
  assert.ok(out.length >= 4 && out.length <= 8, `получили ${out.length}`);
  assert.equal(new Set(subjects).size, subjects.length, `сюжеты повторяются: ${subjects}`);
  assert.ok(!subjects.includes("people"), "люди в сетку не попадают");
});

check("компактный объект тоже раскладывается по сюжетам", () => {
  const small: PastVuEstateContext = {
    name: "Усадьба Голицыных",
    address: "г. Москва, ул. Бауманская, д. 38",
    displayTitle: "Усадьба Голицыных",
    lat: 55.76,
    lng: 37.68,
  };
  const out = pickDiversePastVuGallery(
    filterPastVuGalleryPhotos(
      [
        photo("Главный дом усадьбы Голицыных", 1, { year: 1910, lat: 55.7601, lng: 37.6801 }),
        photo("Главный дом, вид со двора", 2, { year: 1950, lat: 55.7601, lng: 37.6801 }),
        photo("Ворота усадьбы", 3, { year: 1920, lat: 55.7602, lng: 37.6802 }),
        photo("Пруд в парке", 4, { year: 1930, lat: 55.7603, lng: 37.6803 }),
      ],
      small,
    ),
  );
  assert.equal(out.length, 3);
});

check("внутри сюжета берём самый старый кадр", () => {
  const out = pickDiversePastVuGallery([
    photo("Кузьминки. Конный двор", 1, { year: 1914 }),
    photo("Кузьминки. Конный двор", 2, { year: 1900 }),
    photo("Конный двор", 3, { year: 1967 }),
  ]);
  assert.equal(out[0]?.cid, 2);
});

check("если сюжет один — добираем второй кадр из другой эпохи", () => {
  const out = pickDiversePastVuGallery(
    [
      photo("Конный двор", 1, { year: 1900 }),
      photo("Конный двор", 2, { year: 1910 }),
      photo("Конный двор", 3, { year: 1967 }),
    ],
    { minTiles: 2 },
  );
  assert.equal(out.length, 2);
  assert.deepEqual(
    out.map((p) => p.year),
    [1900, 1967],
  );
});

if (failed > 0) {
  console.error(`\n${failed} проверок не прошло`);
  process.exit(1);
}
console.log("\nВсе проверки pastvu-match прошли.");
