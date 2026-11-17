/**
 * Проверка правил подбора главного фото. Запуск: npm run photos:test
 *
 * Фикстуры — реальные файлы категории Commons «Old Post Office (former Demidov manor)»
 * и их настоящие описания. Именно эта категория принесла на карточку «Старый Московский Почтамт»
 * фото флигеля вместо главного корпуса.
 */
import assert from "node:assert/strict";
import { addressRefs, compareAddress, judgePhoto, photoRole, type EstateFacts } from "../src/lib/photo-match";
import { photoKind } from "../src/lib/photo";

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

const POCHTAMT: EstateFacts = {
  name: '"Старый Московский Почтамт" (в основе усадьба Демидовых), XIX в. - 1-я треть XX в.',
  address: "г. Москва, ул. Мясницкая, д.40, стр.1, 5, 10 (часть), 16",
  objectType: "Ансамбль",
  partsCount: 0,
};

const CATEGORY_FILES: { file: string; description: string; expect: "main" | "part" | "hide"; why: string }[] = [
  {
    file: "Москва, ул. Мясницкая, 40, стр. 1.JPG",
    description: "Главный корпус (главный дом усадьбы): Мясницкая ул., дом 40, строение 1, Басманный, Центральный округ, Москва",
    expect: "main",
    why: "главный корпус, строение из адреса реестра",
  },
  {
    file: "Москва, Мясницкая улица, 40, строение 5.jpg",
    description: "Конюшенный корпус: Мясницкая ул., дом 40, строение 5, Басманный, Центральный округ, Москва",
    expect: "part",
    why: "конюшня — часть ансамбля, не главное здание",
  },
  {
    file: "Москва, Мясницкая улица, 40, строение 10.jpg",
    description: "Кладовая: Мясницкая ул., дом 40, строение 10, Басманный, Центральный округ, Москва",
    expect: "part",
    why: "кладовая — часть ансамбля",
  },
  {
    // Именно этот файл показывался на карточке как главное фото.
    file: "Флигель (для служащих) Мясницкая улица, 40-42 Москва 2026 01.jpg",
    description: "Флигель (для служащих): Мясницкая улица, 40, строение 2, Басманный, Центральный округ, Москва",
    expect: "hide",
    why: "строения 2 нет в адресе реестра (1, 5, 10, 16)",
  },
  {
    file: "Палаты на Мясницкой улице Москва 2026 01.jpg",
    description: "Флигель (докторский корпус, палаты): Мясницкая улица, 40, строение 4, Басманный, Центральный округ, Москва",
    expect: "hide",
    why: "строения 4 нет в адресе реестра",
  },
  {
    file: "Москва, Мясницкая улица, 42, строение 2 (1).jpg",
    description: "Флигель: Мясницкая ул., дом 42, строение 2, Басманный, Центральный округ, Москва",
    expect: "hide",
    why: "другой дом (42)",
  },
  {
    file: "Moscow, Myasnitskaya 38-40 June 2007 02.JPG",
    description: "Moscow, Myasnitskaya Street.",
    expect: "hide",
    why: "у ансамбля нет подтверждения, что на снимке главное здание",
  },
  {
    file: "Moscow, Myasnitskaya 38-40 Post Office.jpg",
    description: "Moscow, 40 Myasnitskaya Street RUSSIAN: Москва. Мясницкая, 40",
    expect: "hide",
    why: "роль здания неизвестна, ансамбль",
  },
];

console.log("Старый Московский Почтамт (ансамбль), файлы из категории Commons");
for (const item of CATEGORY_FILES) {
  check(`${item.file} -> ${item.expect}`, () => {
    const result = judgePhoto(POCHTAMT, { filename: item.file, description: item.description, source: "none" });
    assert.equal(result.decision, item.expect, `${item.why}; получено: ${result.decision} (${result.reason})`);
  });
}

console.log("\nГлавное фото среди категории выбирается только одно и верное");
check("единственный кандидат в главные — стр. 1", () => {
  const mains = CATEGORY_FILES.filter(
    (item) => judgePhoto(POCHTAMT, { filename: item.file, description: item.description, source: "none" }).decision === "main",
  );
  assert.deepEqual(
    mains.map((item) => item.file),
    ["Москва, ул. Мясницкая, 40, стр. 1.JPG"],
  );
});

console.log("\nРазбор адресов");
check("адрес реестра: дом 40, строения 1, 5, 10, 16", () => {
  const refs = addressRefs(POCHTAMT.address);
  assert.deepEqual(refs.houses, ["40"]);
  assert.deepEqual(refs.structures.sort(), ["1", "10", "16", "5"]);
});
check("«Мясницкая улица, 42, строение 2» -> дом 42", () => {
  assert.deepEqual(addressRefs("Мясницкая улица, 42, строение 2").houses, ["42"]);
});
check("диапазон «40-42» даёт оба дома", () => {
  assert.deepEqual(addressRefs("Мясницкая улица, 40-42").houses.sort(), ["40", "42"]);
});
check("латиница не разбирается: unknown, а не угадывание", () => {
  assert.equal(compareAddress(POCHTAMT.address, "Moscow, Myasnitskaya 40"), "unknown");
});
check("тот же дом, другое строение — mismatch", () => {
  assert.equal(compareAddress(POCHTAMT.address, "дом 40, строение 4"), "mismatch");
});

console.log("\nДоверенные источники и одиночные объекты");
check("P18 самого элемента без описания — главное фото", () => {
  const result = judgePhoto(POCHTAMT, { filename: "Old Post Office Moscow.jpg", source: "wikidata" });
  assert.equal(result.decision, "main");
});
check("P18, но на снимке флигель — часть ансамбля, не главное", () => {
  const result = judgePhoto(POCHTAMT, { filename: "Флигель усадьбы.jpg", source: "wikidata" });
  assert.equal(result.decision, "part");
});
check("фото из ЕГРОКН весомее P18", () => {
  const a = judgePhoto(POCHTAMT, { filename: "a.jpg", source: "registry" });
  const b = judgePhoto(POCHTAMT, { filename: "b.jpg", source: "wikidata" });
  assert.ok(a.score > b.score);
});
const VYAZEMY: EstateFacts = {
  name: "Усадьба Вязёмы",
  address: "Московская область, с. Вязёмы",
  objectType: "Памятник",
  partsCount: 0,
  lat: 55.7,
  lng: 37.3,
};
check("фото из категории без единого подтверждения — скрыто, даже у одиночного объекта", () => {
  assert.equal(judgePhoto(VYAZEMY, { filename: "Vyazemy manor 03.jpg", source: "none" }).decision, "hide");
});
check("то же фото, но геометка в 60 м — главное", () => {
  const near = { lat: 55.7004, lng: 37.3 };
  assert.equal(judgePhoto(VYAZEMY, { filename: "Vyazemy manor 03.jpg", source: "none", coord: near }).decision, "main");
});
check("название объекта в описании — подтверждение", () => {
  const result = judgePhoto(VYAZEMY, { filename: "x.jpg", description: "Усадьба Вязёмы, главный дом", source: "none" });
  assert.equal(result.decision, "main");
});

console.log("\nСлучай Татищева: районная категория принесла виадук за 50 км");
const TATISHCHEV_PARK: EstateFacts = {
  name: "Усадьба А.А.Татищева. Парк",
  address: "Новгородская область, Крестецкий муниципальный округ, деревня Усть-Волма, ул. Школьная, д. 6",
  objectType: "Ансамбль",
  partsCount: 0,
  lat: 58.463362,
  lng: 32.437241,
};
const VIADUCT = {
  filename: "Мост через реку Ярынья.jpg",
  description: "Arch railway bridge across Yarynya river. Krestetsky District, Novgorod Oblast",
  source: "none" as const,
  coord: { lat: 58.1395, lng: 32.8575 },
};
check("виадук из районной категории скрыт по геометке", () => {
  const result = judgePhoto(TATISHCHEV_PARK, VIADUCT);
  assert.equal(result.decision, "hide");
  assert.match(result.reason, /геометка/);
});
check("виадук без геометки тоже скрыт: нет названия, адреса, роли", () => {
  assert.equal(judgePhoto(TATISHCHEV_PARK, { ...VIADUCT, coord: null }).decision, "hide");
});
check("«Амбар из усадьбы Татищева» не получает виадук", () => {
  const barn: EstateFacts = { ...TATISHCHEV_PARK, name: "Амбар из усадьбы А.А.Татищева", objectType: "Памятник" };
  assert.equal(judgePhoto(barn, { ...VIADUCT, coord: null }).decision, "hide");
});
check("настоящий снимок усадьбы с геометкой рядом проходит", () => {
  const real = { filename: "Усть-Волма, усадьба Татищева.jpg", source: "none" as const, coord: { lat: 58.4635, lng: 32.4374 } };
  const barn: EstateFacts = { ...TATISHCHEV_PARK, name: "Амбар из усадьбы А.А.Татищева", objectType: "Памятник" };
  assert.equal(judgePhoto(barn, real).decision, "main");
});
check("P18 с геометкой в другом районе тоже отбрасывается, ЕГРОКН — нет", () => {
  assert.equal(judgePhoto(TATISHCHEV_PARK, { ...VIADUCT, source: "wikidata" }).decision, "hide");
  assert.equal(judgePhoto(TATISHCHEV_PARK, { filename: "a.jpg", source: "registry" }).decision, "main");
});
check("объект сам флигель — флигель допустим как главное фото", () => {
  const wing: EstateFacts = { name: "Флигель усадьбы Алексеевых", address: null, objectType: "Памятник", partsCount: 0 };
  assert.equal(judgePhoto(wing, { filename: "Флигель Алексеевых.jpg", source: "none" }).decision, "main");
});
check("праздничный кадр не может быть главным", () => {
  assert.equal(judgePhoto(POCHTAMT, { filename: "Новый год у усадьбы.jpg", source: "wikidata" }).decision, "hide");
});

console.log("\nРанжирование по имени файла (запасной сортировщик)");
check("флигель больше не считается «домом»", () => {
  assert.equal(photoKind("Флигель (для служащих) Мясницкая улица.jpg"), "part");
});
check("главный корпус остаётся «домом»", () => {
  assert.equal(photoKind("Главный дом усадьбы Х.jpg"), "house");
});
check("описание «флигель главного дома» — флигель", () => {
  assert.equal(photoRole("x.jpg", "Флигель главного дома"), "part");
});

console.log(failed === 0 ? "\nВсе проверки прошли." : `\nПровалено проверок: ${failed}.`);
process.exit(failed === 0 ? 0 : 1);
