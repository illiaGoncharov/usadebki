/**
 * Обогащение локального каталога карточками hist-usadba.narod.ru.
 *
 * Берём владельцев до 1917, архитекторов и короткую заметку (место, сохранность).
 * Состояние пишем только если своей правки в statements ещё нет.
 * Повторный запуск сначала снимает свои прошлые записи (origin = hist-usadba).
 *
 *   npm run enrich:hist-usadba
 *   npm run enrich:hist-usadba -- --dry-run
 *   npm run enrich:hist-usadba -- --region=калуж
 *   npm run enrich:hist-usadba -- --cache-only
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../src/db";
import { estatePeople, estates, people, sources, statements } from "../src/db/schema";
import {
  assertOwnerParser,
  type HistCard,
  listEstatesInRegion,
  listRegionIndexes,
  matchHistCard,
  parseEstateHtml,
  regionsForLabel,
  fetchHistHtml,
  histNetworkFails,
  readHistCache,
} from "./sources/hist-usadba";

const DRY_RUN = process.argv.includes("--dry-run");
const CACHE_ONLY = process.argv.includes("--cache-only");
const ORIGIN = "hist-usadba";
const regionArg = process.argv.find((arg) => arg.startsWith("--region="))?.split("=")[1]?.toLowerCase();
const limitArg = Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? "0");

function noteText(card: HistCard) {
  const parts: string[] = [];
  if (card.ownersRaw) parts.push(`Владельцы до 1917: ${card.ownersRaw}`);
  if (card.architectsRaw) parts.push(`Архитектор: ${card.architectsRaw}`);
  if (card.preservation) parts.push(`Сохранность: ${card.preservation}`);
  if (card.location) parts.push(`Место: ${card.location}`);
  if (card.visitors) parts.push(`Бывали: ${card.visitors}`);
  const text = parts.join(" ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > 900 ? `${text.slice(0, 897)}…` : text;
}

async function findOrCreatePerson(name: string) {
  const [found] = await db
    .select({ id: people.id })
    .from(people)
    .where(sql`lower(${people.name}) = ${name.toLowerCase()}`)
    .limit(1);
  if (found) return found.id;
  const [created] = await db.insert(people).values({ name }).returning({ id: people.id });
  if (!created) throw new Error("Человек не записался");
  return created.id;
}

async function sourceFor(card: HistCard) {
  const title = `hist-usadba: ${card.title}`;
  const [found] = await db.select({ id: sources.id }).from(sources).where(eq(sources.url, card.url)).limit(1);
  if (found) return found.id;
  const [created] = await db
    .insert(sources)
    .values({
      type: "article",
      title,
      author: "Алексей Лобунов",
      url: card.url,
      note: "Исторические усадьбы России, hist-usadba.narod.ru",
    })
    .returning({ id: sources.id });
  if (!created) throw new Error("Источник не записался");
  return created.id;
}

async function main() {
  assertOwnerParser();

  const indexes = await listRegionIndexes();
  const chosen = regionArg ? indexes.filter((item) => item.label.toLowerCase().includes(regionArg)) : indexes;
  if (chosen.length === 0) {
    console.error(regionArg ? `Нет области «${regionArg}» на сайте.` : "На главной нет списка областей.");
    process.exit(1);
  }
  console.log(`Областей на сайте: ${chosen.length}`);

  const listed: { url: string; title: string; regionLabel: string }[] = [];
  for (const region of chosen) {
    const items = await listEstatesInRegion(region.url, region.label);
    console.log(`  ${region.label}: ${items.length}`);
    listed.push(...items);
  }

  const unique = new Map<string, { url: string; title: string; regionLabel: string }>();
  for (const item of listed) unique.set(item.url, item);
  let pages = [...unique.values()];
  if (limitArg > 0) pages = pages.slice(0, limitArg);
  console.log(`Карточек к разбору: ${pages.length}`);

  const cards: HistCard[] = [];
  let empty = 0;
  let failureStreak = 0;
  let offline = false;
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index]!;
    const failsBefore = histNetworkFails();
    const html = offline || CACHE_ONLY ? await readHistCache(page.url) : await fetchHistHtml(page.url);
    if (!offline && histNetworkFails() > failsBefore) {
      failureStreak += 1;
      if (failureStreak >= 3) {
        offline = true;
        console.log("Сайт перестал отвечать. Дальше только уже скачанные страницы, остальное — следующим запуском.");
      }
    } else if (html) {
      failureStreak = 0;
    }
    if (!html) {
      empty += 1;
      continue;
    }
    const card = parseEstateHtml(html, page);
    if (!card) empty += 1;
    else cards.push(card);
    if ((index + 1) % 50 === 0) console.log(`  разобрано ${index + 1}/${pages.length}`);
  }
  console.log(`С полями: ${cards.length}, пустых или без ответа: ${empty}`);

  const rows = await db
    .select({
      id: estates.id,
      canonicalEstateId: estates.canonicalEstateId,
      slug: estates.slug,
      name: estates.name,
      regionName: estates.regionName,
      address: estates.address,
    })
    .from(estates);

  const regionNames = [...new Set(rows.map((row) => row.regionName))];
  const byPublicId = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const publicId = row.canonicalEstateId ?? row.id;
    if (!byPublicId.has(publicId) || row.id === publicId) byPublicId.set(publicId, row);
  }
  const catalog = [...byPublicId.values()].map((row) => ({
    ...row,
    id: row.canonicalEstateId ?? row.id,
    canonicalEstateId: null,
  }));

  type Hit = { card: HistCard; estateId: string; slug: string; name: string };
  const hits: Hit[] = [];
  const ambiguous: string[] = [];
  const unmatched: string[] = [];
  for (const card of cards) {
    const names = regionsForLabel(card.regionLabel, regionNames);
    if (names.length === 0) {
      unmatched.push(`${card.title} — нет региона «${card.regionLabel}»`);
      continue;
    }
    const estate = matchHistCard(card, catalog, names);
    if (!estate) {
      ambiguous.push(`${card.regionLabel}: ${card.title}`);
      continue;
    }
    if (hits.some((hit) => hit.estateId === estate.id)) {
      ambiguous.push(`уже занята ${estate.slug}: ${card.title}`);
      continue;
    }
    hits.push({ card, estateId: estate.id, slug: estate.slug, name: estate.name });
  }

  console.log(`Сопоставлено: ${hits.length}`);
  console.log(`Без уверенного совпадения: ${ambiguous.length + unmatched.length}`);
  console.log("Примеры:");
  for (const hit of hits.slice(0, 12)) {
    console.log(`  ${hit.card.title} → ${hit.name} (${hit.slug}) владельцы: ${hit.card.owners.join("; ") || "—"}`);
  }

  await mkdir(path.join(process.cwd(), "data/hist-usadba"), { recursive: true });
  await writeFile(
    path.join(process.cwd(), "data/hist-usadba/last-run.json"),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        dryRun: DRY_RUN,
        cards: cards.length,
        matched: hits.map((hit) => ({
          title: hit.card.title,
          slug: hit.slug,
          owners: hit.card.owners,
          architects: hit.card.architects,
          condition: hit.card.condition,
          url: hit.card.url,
        })),
        skipped: [...unmatched, ...ambiguous].slice(0, 400),
      },
      null,
      2,
    ),
  );

  if (DRY_RUN) {
    console.log("\n--dry-run: в базу не писал. Отчёт: data/hist-usadba/last-run.json");
    process.exit(0);
  }

  const previousSources = await db
    .select({ id: sources.id })
    .from(sources)
    .where(sql`${sources.url} like 'https://hist-usadba.narod.ru/%'`);
  const previousIds = previousSources.map((row) => row.id);
  if (previousIds.length > 0) {
    await db.delete(statements).where(inArray(statements.sourceId, previousIds));
  }
  await db.delete(estatePeople).where(eq(estatePeople.origin, ORIGIN));

  const humanCondition = new Set(
    (
      await db
        .select({ estateId: statements.estateId })
        .from(statements)
        .where(and(eq(statements.predicate, "condition"), eq(statements.status, "accepted")))
    ).map((row) => row.estateId),
  );

  let peopleLinks = 0;
  let notes = 0;
  let conditions = 0;
  for (const hit of hits) {
    const sourceId = await sourceFor(hit.card);
    const names = hit.card.owners;
    const revolution = /191[0-7]/.test(hit.card.ownersRaw ?? "");
    for (let index = 0; index < names.length; index += 1) {
      const personId = await findOrCreatePerson(names[index]!);
      const role = revolution && index === names.length - 1 ? "last_owner" : "owner";
      const [exists] = await db
        .select({ id: estatePeople.id })
        .from(estatePeople)
        .where(and(eq(estatePeople.estateId, hit.estateId), eq(estatePeople.personId, personId), eq(estatePeople.role, role)))
        .limit(1);
      if (exists) continue;
      await db.insert(estatePeople).values({
        estateId: hit.estateId,
        personId,
        role,
        sourceId,
        origin: ORIGIN,
      });
      peopleLinks += 1;
    }
    for (const name of hit.card.architects) {
      const personId = await findOrCreatePerson(name);
      const [exists] = await db
        .select({ id: estatePeople.id })
        .from(estatePeople)
        .where(
          and(eq(estatePeople.estateId, hit.estateId), eq(estatePeople.personId, personId), eq(estatePeople.role, "architect")),
        )
        .limit(1);
      if (exists) continue;
      await db.insert(estatePeople).values({
        estateId: hit.estateId,
        personId,
        role: "architect",
        sourceId,
        origin: ORIGIN,
      });
      peopleLinks += 1;
    }

    const text = noteText(hit.card);
    if (text) {
      await db.insert(statements).values({
        estateId: hit.estateId,
        predicate: "note",
        text,
        sourceId,
        status: "accepted",
      });
      notes += 1;
    }
    if (hit.card.condition && !humanCondition.has(hit.estateId)) {
      await db.insert(statements).values({
        estateId: hit.estateId,
        predicate: "condition",
        text: hit.card.condition,
        sourceId,
        status: "accepted",
      });
      conditions += 1;
      humanCondition.add(hit.estateId);
    }
  }

  console.log(`\nЗаписано связей людей: ${peopleLinks}`);
  console.log(`Заметок: ${notes}`);
  console.log(`Состояний (где своей правки не было): ${conditions}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
