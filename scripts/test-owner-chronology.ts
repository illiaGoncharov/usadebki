/**
 * Хронология владельцев и «последний до 1917».
 * Запуск: node --import tsx scripts/test-owner-chronology.ts
 */
import assert from "node:assert/strict";
import {
  extractYears,
  pickLastPreRevolutionOwner,
  sortOwnersChronologically,
} from "../src/lib/owner-chronology";

const sample = [
  {
    id: "1",
    role: "last_owner",
    name: "В 1908 году усадьбу приобрёл купец Н.И. Прохоров и владел ею до революции.",
  },
  {
    id: "2",
    role: "last_owner",
    name: "В 1863 году владение купил Сергей Владимирович Алексеев, жил с 1863 по 1903 год.",
  },
  {
    id: "3",
    role: "last_owner",
    name: "Дальше — советская судьба: в 1910–1920-е здесь работал кинотеатр «Ривьера».",
  },
  {
    id: "4",
    role: "last_owner",
    name: "Усадьба известна с 1803 года, первый владелец — камергер П.П. Нарышкин.",
  },
];

assert.deepEqual(extractYears("1818-1822 гг., 1898 г."), [1818, 1822, 1898]);
assert.ok(extractYears("в 1910-е гг.").includes(1910));

const chrono = sortOwnersChronologically(sample);
assert.equal(chrono[0]!.id, "4", "сначала 1803");
assert.equal(chrono[1]!.id, "2", "потом 1863");
assert.equal(chrono.map((row) => row.id).includes("1"), true);

const last = pickLastPreRevolutionOwner(sample);
assert.equal(last.id, "1", "Прохоров до революции — последний");

console.log("test-owner-chronology: OK");
