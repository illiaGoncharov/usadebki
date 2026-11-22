/**
 * Короткие заголовки из длинных наименований ЕГРОКН.
 * Запуск: node --import tsx scripts/test-estate-display-name.ts
 */
import assert from "node:assert/strict";
import { estateDisplayTitle, splitRegistryEstateName } from "../src/lib/estate-display-name";

let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL ${name}`);
    console.error(error);
  }
}

check("Морозова: короткое имя, хвост в note", () => {
  const full =
    "Городская усадьба М.К.Морозовой, XIX в. - XX в. Главный дом, 1818-1822 гг., 1840-е гг., 1898 г., 1914 г., архитектор И.В.Жолтовский. Здесь в 1910-х гг. проходили заседания религиозно-философского общества памяти Владимира Соловьева, бывали: П.А.Флоренский, Н.А.Бердяев, С.Н.Булгаков, А.Белый, Б.Л.Пастернак и др.";
  const { title, registryNote } = estateDisplayTitle(full);
  assert.equal(title, "Городская усадьба М.К.Морозовой");
  assert.ok(registryNote?.includes("Жолтовский"));
  assert.ok(registryNote?.includes("Пастернак"));
  assert.ok(!title.includes("Главный дом"));
});

check("короткое имя не режется", () => {
  const { title, registryNote } = estateDisplayTitle("Усадьба Оболенских");
  assert.equal(title, "Усадьба Оболенских");
  assert.equal(registryNote, null);
});

check("вики короче паспорта — берём вики, паспорт в note", () => {
  const full =
    "Городская усадьба Трубецких-Щукиных, сер. XVIII в. - нач. XX в. - Главный дом с флигелем, 1740-е гг., кон. XVIII в., 1850-е гг., 1907-1912 гг., гражданский инженер Л.Н.Кекушев. Здесь в 1888-1909 гг. жил предприниматель и коллекционер С.И.Щукин";
  const { title, registryNote } = estateDisplayTitle(full, "Дом Щукина");
  assert.equal(title, "Дом Щукина");
  assert.ok(registryNote?.includes("Трубецких"));
});

check("split режет до датировки", () => {
  const { title } = splitRegistryEstateName(
    "Городская усадьба Долгоруковых-Бобринских, 2-я пол. XVIII в. - XIX в. -Главный дом, 1793 г.",
  );
  assert.equal(title, "Городская усадьба Долгоруковых-Бобринских");
});

if (failed > 0) {
  console.error(`\n${failed} проверок не прошло`);
  process.exit(1);
}
console.log("\nВсе проверки estate-display-name прошли.");
