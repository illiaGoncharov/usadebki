/**
 * Аудит фото: проверяет каждый снимок в базе и расставляет по местам.
 *
 * Для каждого снимка решает по признакам, а не по тому, откуда он взялся:
 *   main — подтверждённо этот объект; из них выбирается одно главное фото;
 *   part — вспомогательное здание или парк: уходит в «Другие части ансамбля»;
 *   hide — чужой, далёкий, нет подтверждений: скрывается.
 *
 * Правила — в src/lib/photo-match.ts, проверки — scripts/test-photo-match.ts.
 *
 * По умолчанию ничего не пишет (dry-run), только отчёт в data/photo-audit-*.json.
 *   npm run photos:audit                       — посмотреть, что изменится
 *   npm run photos:audit -- --apply            — применить
 *   npm run photos:audit -- --slug=ИМЯ         — подробно по одному объекту
 *   npm run photos:audit -- --region=ID        — только один регион
 *   npm run photos:audit -- --restore=ФАЙЛ     — откатить применённый аудит по его отчёту
 *
 * Вручную скрытые фото аудит не трогает и не возвращает.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, sql as pg } from "../src/db";
import { estateParts, estates, photos } from "../src/db/schema";
import { photoKind, photoRank } from "../src/lib/photo";
import { judgePhoto, type PhotoSource, type Verdict } from "../src/lib/photo-match";
import { fetchCommonsInfo, fetchWikidataImagesByReg, fileNameFromUrl, normalizeFileName } from "./sources/commons-info";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => args.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];

const APPLY = flag("apply");
const SLUG = option("slug");
const REGION = option("region");
const RESTORE = option("restore");
const SAMPLE = Number(option("sample") ?? 15);

type PhotoState = { isHidden: boolean; isEnsemblePart: boolean; isPrimary: boolean };
type Decision = {
  photoId: string;
  estateId: string;
  slug: string;
  name: string;
  file: string;
  origin: string;
  verdict: Verdict;
  before: PhotoState;
  after: PhotoState;
};

const REGISTRY_ORIGINS = new Set(["egrkn", "wikivoyage", "human"]);

async function chunked<T>(items: T[], size: number, run: (chunk: T[]) => Promise<unknown>) {
  for (let offset = 0; offset < items.length; offset += size) await run(items.slice(offset, offset + size));
}

async function restore(file: string) {
  const report = JSON.parse(await readFile(file, "utf8")) as { decisions: Decision[] };
  const changed = report.decisions.filter(
    (item) =>
      item.before.isHidden !== item.after.isHidden ||
      item.before.isEnsemblePart !== item.after.isEnsemblePart ||
      item.before.isPrimary !== item.after.isPrimary,
  );
  console.log(`Откат по отчёту ${file}: ${changed.length} снимков.`);
  for (const item of changed) {
    await db.update(photos).set(item.before).where(eq(photos.id, item.photoId));
  }
  console.log("Готово: состояние вернулось к тому, что было до аудита.");
}

async function main() {
  if (RESTORE) return restore(RESTORE);

  console.log(`=== Аудит фото ${APPLY ? "(ПРИМЕНЕНИЕ)" : "(пробный запуск, ничего не меняется)"} ===\n`);

  const estateWhere = and(SLUG ? eq(estates.slug, SLUG) : undefined, REGION ? eq(estates.regionId, REGION) : undefined);
  const estateRows = await db
    .select({
      id: estates.id,
      slug: estates.slug,
      name: estates.name,
      address: estates.address,
      objectType: estates.objectType,
      reg: estates.egrknRegNumber,
      lat: estates.lat,
      lng: estates.lng,
      regionId: estates.regionId,
    })
    .from(estates)
    .where(estateWhere);
  const estateById = new Map(estateRows.map((row) => [row.id, row]));

  const partsRows = await db
    .select({ estateId: estateParts.estateId, count: sql<number>`count(*)::int` })
    .from(estateParts)
    .groupBy(estateParts.estateId);
  const partsCount = new Map(partsRows.map((row) => [row.estateId, row.count]));

  // Скрытое вручную не трогаем. Уже отнесённое к частям ансамбля — тоже.
  const photoRows = (await db.select().from(photos).where(eq(photos.isHidden, false))).filter((row) =>
    estateById.has(row.estateId),
  );
  const candidates = photoRows.filter((row) => !row.isEnsemblePart);
  console.log(`Объектов: ${estateRows.length}. Видимых фото к проверке: ${candidates.length}.`);

  const commonsRows = candidates.filter((row) => row.origin === "commons" || row.origin === "commons-ensemble");
  const regs = [...new Set(commonsRows.map((row) => estateById.get(row.estateId)!.reg))];
  console.log(`\nWikidata: P18 для ${regs.length} объектов…`);
  const p18 = await fetchWikidataImagesByReg(regs, (done, total) => process.stdout.write(`\r  ${done}/${total}`));

  const fileNames = commonsRows.map((row) => fileNameFromUrl(row.url));
  console.log(`\nCommons: описания и геометки для ${new Set(fileNames).size} файлов…`);
  const infos = await fetchCommonsInfo(fileNames, (done, total) => process.stdout.write(`\r  ${done}/${total}`));
  console.log("");

  const decisions: Decision[] = [];
  for (const row of candidates) {
    const estate = estateById.get(row.estateId)!;
    const filename = fileNameFromUrl(row.url);
    const key = normalizeFileName(filename);
    const info = infos.get(key);

    let source: PhotoSource = "none";
    if (REGISTRY_ORIGINS.has(row.origin)) source = "registry";
    else if (row.origin === "commons" && p18.get(estate.reg)?.has(key)) source = "wikidata";

    let verdict: Verdict;
    if (row.origin === "commons-ensemble") {
      // Старые записи: фото части ансамбля, подставленное объекту без своих фото, ещё без пометки.
      verdict = { decision: "part", reason: "фото части ансамбля, а не самого объекта", score: 0 };
    } else if (info?.missing) {
      verdict = { decision: "hide", reason: "файла больше нет на Commons", score: 0 };
    } else {
      verdict = judgePhoto(
        {
          name: estate.name,
          address: estate.address,
          objectType: estate.objectType,
          partsCount: partsCount.get(estate.id) ?? 0,
          lat: estate.lat,
          lng: estate.lng,
        },
        { filename, description: info?.description, source, coord: info?.coord },
      );
    }

    decisions.push({
      photoId: row.id,
      estateId: row.estateId,
      slug: estate.slug,
      name: estate.name,
      file: filename,
      origin: row.origin,
      verdict,
      before: { isHidden: row.isHidden, isEnsemblePart: row.isEnsemblePart, isPrimary: row.isPrimary },
      after: {
        isHidden: verdict.decision === "hide",
        isEnsemblePart: verdict.decision === "part",
        isPrimary: false,
      },
    });
  }

  // Одно главное фото на объект: лучший балл, при равенстве — «дом» перед «прочим».
  const byEstate = new Map<string, Decision[]>();
  for (const item of decisions) byEstate.set(item.estateId, [...(byEstate.get(item.estateId) ?? []), item]);
  const withMainAfter = new Set<string>();
  for (const [estateId, items] of byEstate) {
    const mains = items
      .filter((item) => item.verdict.decision === "main")
      .sort(
        (a, b) =>
          b.verdict.score - a.verdict.score ||
          photoRank(photoKind(a.file)) - photoRank(photoKind(b.file)) ||
          Number(b.before.isPrimary) - Number(a.before.isPrimary) ||
          a.file.localeCompare(b.file),
      );
    if (mains[0]) {
      mains[0].after.isPrimary = true;
      withMainAfter.add(estateId);
    }
  }
  // Объекты, у которых уже были части ансамбля, остаются с фото частей: показываем это в сводке отдельно.
  const withPartsOnly = new Set(photoRows.filter((row) => row.isEnsemblePart).map((row) => row.estateId));

  const withVisibleBefore = new Set(candidates.map((row) => row.estateId));
  const lost = [...withVisibleBefore].filter((id) => !withMainAfter.has(id));

  const counts = { main: 0, part: 0, hide: 0 } as Record<Verdict["decision"], number>;
  const reasons = new Map<string, number>();
  for (const item of decisions) {
    counts[item.verdict.decision] += 1;
    if (item.verdict.decision !== "main") {
      const reason = item.verdict.reason.replace(/\d+(\.\d+)? км/, "N км");
      reasons.set(`${item.verdict.decision}: ${reason}`, (reasons.get(`${item.verdict.decision}: ${reason}`) ?? 0) + 1);
    }
  }
  const changed = decisions.filter(
    (item) =>
      item.before.isHidden !== item.after.isHidden ||
      item.before.isEnsemblePart !== item.after.isEnsemblePart ||
      item.before.isPrimary !== item.after.isPrimary,
  );

  console.log("\n=== Итог ===");
  console.log(`Снимков: оставить главными кандидатами ${counts.main}, в «части ансамбля» ${counts.part}, скрыть ${counts.hide}.`);
  console.log(`Объектов с проверенным главным фото: было с любым фото ${withVisibleBefore.size} -> станет ${withMainAfter.size}.`);
  console.log(`Объектов, которые останутся без главного фото: ${lost.length} (из них с фото частей ансамбля: ${lost.filter((id) => withPartsOnly.has(id)).length}).`);
  console.log("\nПричины, по которым снимок не стал главным:");
  for (const [reason, count] of [...reasons].sort((a, b) => b[1] - a[1])) console.log(`  ${String(count).padStart(5)}  ${reason}`);

  if (SLUG) {
    console.log(`\n--- ${SLUG} ---`);
    for (const item of decisions) {
      const mark = item.after.isPrimary ? "ГЛАВНОЕ" : item.verdict.decision;
      console.log(`  [${mark}] ${item.file}\n          ${item.verdict.reason} (источник: ${item.origin})`);
    }
  } else if (SAMPLE > 0) {
    // Выборка для глазной проверки: 15-20 карточек вместо 4000.
    const pick = <T,>(items: T[]) => items.sort(() => Math.random() - 0.5).slice(0, SAMPLE);
    console.log(`\nВыборка новых главных фото (проверьте ${SAMPLE} глазами в браузере):`);
    for (const item of pick(decisions.filter((entry) => entry.after.isPrimary && !entry.before.isPrimary))) {
      console.log(`  /estates/${item.slug}\n      ${item.file} — ${item.verdict.reason}`);
    }
    console.log(`\nВыборка скрытых (проверьте, что скрыто справедливо):`);
    for (const item of pick(decisions.filter((entry) => entry.verdict.decision === "hide"))) {
      console.log(`  /estates/${item.slug}\n      ${item.file} — ${item.verdict.reason}`);
    }
  }

  await mkdir("data", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportFile = path.join("data", `photo-audit-${stamp}${APPLY ? "-applied" : ""}.json`);
  await writeFile(
    reportFile,
    JSON.stringify({ createdAt: new Date().toISOString(), applied: APPLY, counts, decisions: changed }, null, 1),
  );
  console.log(`\nОтчёт: ${reportFile} (изменений: ${changed.length})`);

  if (!APPLY) {
    console.log("Пробный запуск: база не тронута. Для применения добавьте --apply.");
    return;
  }

  const toHide = changed.filter((item) => item.after.isHidden && !item.before.isHidden).map((item) => item.photoId);
  const toPart = changed.filter((item) => item.after.isEnsemblePart && !item.before.isEnsemblePart).map((item) => item.photoId);
  const toPrimary = changed.filter((item) => item.after.isPrimary && !item.before.isPrimary).map((item) => item.photoId);
  const toDemote = changed
    .filter((item) => !item.after.isPrimary && item.before.isPrimary)
    .map((item) => item.photoId);

  await chunked(toHide, 500, (ids) => db.update(photos).set({ isHidden: true, isPrimary: false }).where(inArray(photos.id, ids)));
  await chunked(toPart, 500, (ids) => db.update(photos).set({ isEnsemblePart: true, isPrimary: false }).where(inArray(photos.id, ids)));
  await chunked(toDemote, 500, (ids) => db.update(photos).set({ isPrimary: false }).where(inArray(photos.id, ids)));
  await chunked(toPrimary, 500, (ids) => db.update(photos).set({ isPrimary: true }).where(inArray(photos.id, ids)));

  console.log(
    `Применено: скрыто ${toHide.length}, в части ансамбля ${toPart.length}, снят флаг главного ${toDemote.length}, назначено главным ${toPrimary.length}.`,
  );
  console.log(`Откат: npm run photos:audit -- --restore=${reportFile}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pg.end());
