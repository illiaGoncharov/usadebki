/**
 * Тесты эвристик состояния (без БД).
 */
import assert from "node:assert/strict";
import {
  conditionFromCategories,
  conditionFromText,
  pickConditionSignal,
} from "../src/lib/condition-inference";

function testCategories() {
  assert.equal(
    conditionFromCategories(["Категория:Руины усадеб в Московской области"]),
    "ruins",
  );
  assert.equal(
    conditionFromCategories(["Категория:Здания и сооружения, восстановленные из руин"]),
    "restored",
  );
  assert.equal(conditionFromCategories(["Категория:Музеи-усадьбы России"]), "restored_in_use");
  assert.equal(conditionFromCategories(["Категория:Утраченные усадьбы Москвы"]), "lost");
}

function testText() {
  assert.equal(
    conditionFromText(
      "Усадьба Левашовых — руинированный памятник усадебной архитектуры в посёлке Осиновая Роща.",
    ),
    "ruins",
  );
  assert.equal(
    conditionFromText("Музей-усадьба Алексея Николаевича Толстого — здание в Самаре."),
    "restored_in_use",
  );
  // Мелихово: в биографии «пришло в запустение», но ввод — музей — не должен быть neglect
  assert.equal(
    conditionFromText(
      "Мелихово — один из главных чеховских музеев в России. Находится в селе Мелихово. Перед отъездом имие продали, после революции пришло в запустение.",
    ),
    "restored_in_use",
  );
  assert.equal(
    conditionFromText("Никольское-Прозоровское — заброшенная усадьба князей Прозоровских в Мытищинском районе."),
    "neglect",
  );
  assert.equal(
    conditionFromText("Городская усадьба: в главном здании располагается Музейно-выставочный центр."),
    "restored_in_use",
  );
}

function testPriority() {
  const picked = pickConditionSignal([
    { condition: "neglect", source: "summary_text", reason: "история" },
    { condition: "restored_in_use", source: "wikipedia_category", reason: "музей" },
  ]);
  assert.equal(picked?.condition, "restored_in_use");
}

function main() {
  testCategories();
  testText();
  testPriority();
  console.log("test-condition-match: OK");
}

main();