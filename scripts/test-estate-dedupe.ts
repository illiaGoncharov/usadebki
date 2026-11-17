import assert from "node:assert/strict";
import { dedupeFingerprint, pickCanonicalFromGroup } from "../src/lib/estate-dedupe";

const belkinA = {
  id: "a",
  name: "Ансамбль усадьбы Белкиных, XVIII -XIX (2 объекта) с парком",
  regionId: "40",
  address: "Калужская область, Малоярославецкий район, с. Дольское, ул. Центральная, д. 1",
  lat: null,
  lng: null,
  wikipediaTitle: null,
  summary: null,
  wikidataQid: null,
  egrknRegNumber: "401620695680005",
};

const belkinB = {
  ...belkinA,
  id: "b",
  name: "Ансамбль усадьбы Белкиных, XVIII - XIX вв. (2 объекта)  с парком",
  lat: 54.7883,
  lng: 36.4331,
  egrknRegNumber: "401620727670005",
  address: "Калужская область, Малоярославецкий район, д. Дольское",
};

const fpA = dedupeFingerprint(belkinA.regionId, belkinA.name, belkinA.address);
const fpB = dedupeFingerprint(belkinB.regionId, belkinB.name, belkinB.address);
assert.equal(fpA, fpB, "Белкины Дольское — один fingerprint");

const winner = pickCanonicalFromGroup([belkinA, belkinB]);
assert.equal(winner.id, "b", "каноническая — с координатами");

console.log("estate-dedupe: ok");