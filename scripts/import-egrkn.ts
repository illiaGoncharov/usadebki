import { spawn } from "node:child_process";
import { stat, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { sql } from "drizzle-orm";
import { db, sql as pg } from "../src/db";
import { estateParts, estates } from "../src/db/schema";
import {
  nameLooksLikeEstate,
  parseRegistryRecord,
  selectEstateGraph,
  type RegistryRecord,
} from "../src/lib/egrkn";
import { slugify } from "../src/lib/slug";

const ZIP_PATH = "data/egrkn.jsons.zip";
const DATASET_PAGE = "https://opendata.mkrf.ru/opendata/7705851331-egrkn/";
const DATASET_ID = "57758409f0aecacd7fd18947";
const FALLBACK_URL =
  "https://opendata.mkrf.ru/opendata/7705851331-egrkn/data-70-structure-16.jsons.zip?e=%7B%22attachment%22:true%7D";
const USER_AGENT = "Usadebki/0.1 (local estate catalog)";

type PartDraft = {
  rootNativeId: string;
  record: RegistryRecord;
};

async function main() {
  const zipPath = await ensureArchive();
  console.log("Первый проход: ищу усадьбы и их ансамбли…");
  const { parentById, seeds, scanned } = await scanGraph(zipPath);
  const { rootIds, partOf } = selectEstateGraph(parentById, seeds);
  console.log(
    `Просмотрено ${scanned}. По имени ${seeds.size}. Корней ${rootIds.size}, частей ${partOf.size}.`,
  );
  if (partOf.size === 0) {
    console.log("В этой выгрузке нет parentId, поэтому состав ансамбля пока не из чего собрать.");
  }
  if (rootIds.size === 0) {
    throw new Error("По фильтру не нашлось ни одной усадьбы. Базу не трогаю.");
  }

  console.log("Второй проход: забираю паспорта отобранных объектов…");
  const { estateRows, partRows } = await collectRows(zipPath, rootIds, partOf);
  console.log(`К записи: ${estateRows.length} усадеб и ${partRows.length} частей.`);

  const nativeToId = new Map<string, string>();
  await db.transaction(async (tx) => {
    for (let offset = 0; offset < estateRows.length; offset += 80) {
      const batch = estateRows.slice(offset, offset + 80);
      const saved = await tx
        .insert(estates)
        .values(batch)
        .onConflictDoUpdate({
          target: estates.egrknRegNumber,
          set: {
            name: sql`excluded.name`,
            regionId: sql`excluded.region_id`,
            regionName: sql`excluded.region_name`,
            address: sql`excluded.address`,
            lat: sql`coalesce(excluded.lat, ${estates.lat})`,
            lng: sql`coalesce(excluded.lng, ${estates.lng})`,
            egrknNativeId: sql`excluded.egrkn_native_id`,
            category: sql`excluded.category`,
            objectType: sql`excluded.object_type`,
            createdDateText: sql`coalesce(excluded.created_date_text, ${estates.createdDateText})`,
            protectionYear: sql`coalesce(excluded.protection_year, ${estates.protectionYear})`,
            rawJson: sql`excluded.raw_json`,
            updatedAt: sql`now()`,
          },
        })
        .returning({ id: estates.id, egrknNativeId: estates.egrknNativeId });
      for (const row of saved) nativeToId.set(row.egrknNativeId, row.id);
    }

    // Состав ансамбля приходит только из реестра, человеческих правок в нём нет.
    await tx.delete(estateParts);
    const partValues = partRows.flatMap((part) => {
      const estateId = nativeToId.get(part.rootNativeId);
      if (!estateId) return [];
      return [
        {
          estateId,
          name: part.record.name,
          egrknRegNumber: part.record.regNumber,
          egrknNativeId: part.record.nativeId,
          objectType: part.record.objectType,
          address: part.record.address,
          typology: part.record.typology,
        },
      ];
    });
    for (let offset = 0; offset < partValues.length; offset += 200) {
      await tx.insert(estateParts).values(partValues.slice(offset, offset + 200));
    }
  });

  const [moscow] = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from estates where region_id = '50'`,
  );
  const withPoint = estateRows.filter((row) => row.lat != null).length;
  console.log(`Готово. Усадеб в базе: ${estateRows.length}. С точкой на карте: ${withPoint}.`);
  console.log(`Московская область: ${numberFrom(moscow, "count")}.`);
}

async function scanGraph(zipPath: string) {
  const parentById = new Map<string, string | null>();
  const seeds = new Set<string>();
  let scanned = 0;
  await readLines(zipPath, (line) => {
    scanned += 1;
    if (scanned % 30000 === 0) console.log(`  ${scanned}…`);
    const record = parseLine(line);
    if (!record) return;
    parentById.set(record.nativeId, record.parentId);
    if (nameLooksLikeEstate(record.name)) seeds.add(record.nativeId);
  });
  return { parentById, seeds, scanned };
}

async function collectRows(
  zipPath: string,
  rootIds: Set<string>,
  partOf: Map<string, string>,
) {
  const estatesByReg = new Map<string, (typeof estates.$inferInsert)>();
  const partsByReg = new Map<string, PartDraft>();
  await readLines(zipPath, (line) => {
    const record = parseLine(line);
    if (!record) return;
    if (rootIds.has(record.nativeId)) {
      estatesByReg.set(record.regNumber, {
        slug: slugify(record.name, record.regNumber),
        name: record.name,
        regionId: record.regionId,
        regionName: record.regionName,
        address: record.address,
        lat: record.lat,
        lng: record.lng,
        egrknRegNumber: record.regNumber,
        egrknNativeId: record.nativeId,
        category: record.category,
        objectType: record.objectType,
        createdDateText: record.createdDateText,
        protectionYear: record.protectionYear,
        rawJson: record.raw,
      });
    }
    const rootNativeId = partOf.get(record.nativeId);
    if (rootNativeId) partsByReg.set(record.regNumber, { rootNativeId, record });
  });
  return {
    estateRows: [...estatesByReg.values()],
    partRows: [...partsByReg.values()],
  };
}

function parseLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return parseRegistryRecord(JSON.parse(trimmed) as unknown);
  } catch {
    return null;
  }
}

function readLines(zipPath: string, onLine: (line: string) => void) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("unzip", ["-p", zipPath], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const lines = createInterface({ input: child.stdout });
    lines.on("line", onLine);
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`unzip завершился с кодом ${code}: ${stderr.slice(0, 400)}`));
    });
  });
}

async function ensureArchive() {
  if (!process.argv.includes("--refresh")) {
    try {
      const file = await stat(ZIP_PATH);
      if (file.size > 50_000_000) return ZIP_PATH;
    } catch {
      // файла ещё нет — скачаем
    }
  }
  const url = process.env.EGRKN_URL ?? (await resolveLatestUrl());
  console.log(`Скачиваю ${url}`);
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) {
    throw new Error(`Не удалось скачать реестр: ${response.status}`);
  }
  await writeFile(ZIP_PATH, Buffer.from(await response.arrayBuffer()));
  return ZIP_PATH;
}

async function resolveLatestUrl() {
  try {
    const page = await fetch(DATASET_PAGE, { headers: { "User-Agent": USER_AGENT } });
    const cookie = (page.headers.getSetCookie?.() ?? []).map((item) => item.split(";")[0]).join("; ");
    const schemas = await fetch(
      `https://opendata.mkrf.ru/v2/@${DATASET_ID}/$schemas?l=1&o=${encodeURIComponent('{"version":-1}')}`,
      { headers: { "User-Agent": USER_AGENT, cookie, Accept: "application/json" } },
    ).then((res) => res.json() as Promise<{ data?: { _id?: string; version?: number }[] }>);
    const schema = schemas.data?.[0];
    if (!schema?._id || schema.version == null) return FALLBACK_URL;
    const versions = await fetch(
      `https://opendata.mkrf.ru/v2/$versions?l=1&o=${encodeURIComponent('{"version":-1}')}&f=${encodeURIComponent(JSON.stringify({ odSchema: schema._id }))}`,
      { headers: { "User-Agent": USER_AGENT, cookie, Accept: "application/json" } },
    ).then((res) => res.json() as Promise<{ data?: { version?: number }[] }>);
    const version = versions.data?.[0]?.version;
    if (version == null) return FALLBACK_URL;
    return `https://opendata.mkrf.ru/opendata/7705851331-egrkn/data-${version}-structure-${schema.version}.jsons.zip?e=${encodeURIComponent('{"attachment":true}')}`;
  } catch (error) {
    console.warn("Не вышло узнать свежую версию, беру запасной адрес.", error);
    return FALLBACK_URL;
  }
}

function numberFrom(row: unknown, key: string) {
  if (!row || typeof row !== "object") return 0;
  const value = (row as Record<string, unknown>)[key];
  return typeof value === "number" ? value : Number(value ?? 0);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => pg.end({ timeout: 5 }));
