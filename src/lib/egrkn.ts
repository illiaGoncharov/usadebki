const ESTATE_NAME = /усадьб|имение|имения|имению|имением|имений/iu;

export function nameLooksLikeEstate(name: string) {
  return ESTATE_NAME.test(name);
}

export type RegistryRecord = {
  nativeId: string;
  regNumber: string;
  name: string;
  parentId: string | null;
  objectType: string | null;
  category: string | null;
  regionId: string;
  regionName: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  createdDateText: string | null;
  protectionYear: number | null;
  typology: string | null;
  raw: Record<string, unknown>;
};

/**
 * Корни — сами ансамбли и одиночные объекты с «усадьбой» в имени.
 * Если такое имя у флигеля, корнем становится его ансамбль, даже если
 * в имени ансамбля этого слова нет. Части — потомки корня, включая внуков.
 * Отдельный корень внутрь другого корня не втягиваем.
 */
export function selectEstateGraph(
  parentById: Map<string, string | null>,
  seedIds: Iterable<string>,
) {
  const rootIds = new Set<string>();
  for (const id of seedIds) {
    const parentId = parentById.get(id);
    if (parentId && parentById.has(parentId)) rootIds.add(parentId);
    else rootIds.add(id);
  }

  const childrenByParent = new Map<string, string[]>();
  for (const [id, parentId] of parentById) {
    if (!parentId) continue;
    const list = childrenByParent.get(parentId);
    if (list) list.push(id);
    else childrenByParent.set(parentId, [id]);
  }

  const partOf = new Map<string, string>();
  const seen = new Set<string>(rootIds);
  const stack = [...rootIds].map((id) => ({ id, root: id }));

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    for (const child of childrenByParent.get(current.id) ?? []) {
      if (seen.has(child) || rootIds.has(child)) continue;
      seen.add(child);
      partOf.set(child, current.root);
      stack.push({ id: child, root: current.root });
    }
  }

  return { rootIds, partOf };
}

export function parseRegistryRecord(row: unknown): RegistryRecord | null {
  const record = asRecord(row);
  if (!record) return null;
  const data = asRecord(record.data) ?? record;
  const general = asRecord(data.general);
  if (!general) return null;
  if (general.isActual === false) return null;

  const name = text(general.name);
  const regNumber = text(general.regNumber);
  const nativeId = text(general.id) ?? text(record.nativeId);
  if (!name || !regNumber || !nativeId) return null;

  const region = asRecord(general.region);
  const address = asRecord(general.address);
  const point = coordinatesFrom(general);

  return {
    nativeId,
    regNumber,
    name,
    parentId: parentIdOf(general.parentId),
    objectType: labeled(general.objectType),
    category: labeled(general.categoryType),
    regionId: text(region?.id) ?? "0",
    regionName: text(region?.value) ?? "Регион не указан",
    address: text(address?.fullAddress),
    lat: point?.lat ?? null,
    lng: point?.lng ?? null,
    createdDateText: text(general.createDate),
    protectionYear: year(general.protectionYear),
    typology: typologies(general.typologies),
    raw: general,
  };
}

function coordinatesFrom(general: Record<string, unknown>) {
  const address = asRecord(general.address);
  const fromMap = address ? geometryPoint(address.mapPosition) : null;
  if (fromMap) return fromMap;

  const coords = asRecord(general.coords);
  if (!coords) return null;
  const yandex = asRecord(coords.yandexCoord);
  if (yandex) {
    const point = readLngLat(yandex.x, yandex.y);
    if (point) return point;
  }
  if (!Array.isArray(coords.selfCoord)) return null;

  let lat = 0;
  let lng = 0;
  let count = 0;
  for (const item of coords.selfCoord) {
    const rec = asRecord(item);
    if (!rec) continue;
    const point = readLngLat(rec.x, rec.y);
    if (!point) continue;
    lat += point.lat;
    lng += point.lng;
    count += 1;
  }
  if (!count) return null;
  return { lat: lat / count, lng: lng / count };
}

function geometryPoint(value: unknown): { lat: number; lng: number } | null {
  const geometry = asRecord(value);
  if (!geometry || !Array.isArray(geometry.coordinates)) return null;
  if (geometry.type === "Point") {
    return readLngLat(geometry.coordinates[0], geometry.coordinates[1]);
  }
  const ring =
    geometry.type === "Polygon"
      ? geometry.coordinates[0]
      : geometry.type === "MultiPolygon"
        ? asRecordArray(geometry.coordinates[0])?.[0]
        : null;
  if (!Array.isArray(ring)) return null;
  let lat = 0;
  let lng = 0;
  let count = 0;
  for (const pair of ring) {
    if (!Array.isArray(pair)) continue;
    const point = readLngLat(pair[0], pair[1]);
    if (!point) continue;
    lat += point.lat;
    lng += point.lng;
    count += 1;
  }
  if (!count) return null;
  return { lat: lat / count, lng: lng / count };
}

function readLngLat(first: unknown, second: unknown) {
  const lng = number(first);
  const lat = number(second);
  if (lng == null || lat == null) return null;
  // В выгрузке mapPosition — GeoJSON: [долгота, широта].
  if (inRussia(lat, lng)) return { lat, lng };
  if (inRussia(lng, lat)) return { lat: lng, lng: lat };
  return null;
}

function inRussia(lat: number, lng: number) {
  return lat >= 41 && lat <= 82 && lng >= 19 && lng <= 192;
}

function parentIdOf(value: unknown) {
  if (value == null || value === "" || value === 0 || value === "0") return null;
  const id = text(value);
  return id || null;
}

function typologies(value: unknown) {
  if (!Array.isArray(value)) return null;
  const names = value.map((item) => labeled(item)).filter((item): item is string => Boolean(item));
  return names.length ? names.join(", ") : null;
}

function labeled(value: unknown) {
  if (typeof value === "string") return value.trim() || null;
  const record = asRecord(value);
  if (!record) return null;
  return text(record.value);
}

function year(value: unknown) {
  const parsed = number(value);
  if (parsed == null) return null;
  const rounded = Math.round(parsed);
  if (rounded < 1400 || rounded > 2100) return null;
  return rounded;
}

function number(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function text(value: unknown) {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asRecordArray(value: unknown) {
  return Array.isArray(value) ? value : null;
}

if (process.argv[1]?.split("/").pop() === "egrkn.ts") {
  const parents = new Map<string, string | null>([
    ["1", null],
    ["2", "1"],
    ["3", "2"],
    ["4", "1"],
    ["5", null],
    ["6", "5"],
    ["9", null],
    ["7", "9"],
  ]);
  const { rootIds, partOf } = selectEstateGraph(parents, ["1", "4", "5", "7"]);
  const roots = [...rootIds].sort().join(",");
  if (roots !== "1,5,9") throw new Error(`корни: ${roots}`);
  if (partOf.get("2") !== "1" || partOf.get("3") !== "1" || partOf.get("4") !== "1") {
    throw new Error("части ансамбля собрались неверно");
  }
  if (partOf.get("6") !== "5" || partOf.get("7") !== "9") {
    throw new Error("чужие части прилипли не к своему корню");
  }
  const parsed = parseRegistryRecord({
    data: {
      general: {
        id: 10,
        name: "Усадьба Гребнево",
        regNumber: "5010555000",
        region: { id: "50", value: "Московская область" },
        address: { mapPosition: { type: "Point", coordinates: [55.1, 51.76] } },
        isActual: true,
      },
    },
  });
  if (
    !parsed ||
    parsed.lng == null ||
    parsed.lat == null ||
    Math.abs(parsed.lng - 55.1) > 0.001 ||
    Math.abs(parsed.lat - 51.76) > 0.001
  ) {
    throw new Error("координаты разобраны неверно");
  }
  console.log("разбор ЕГРОКН сходится");
}
