/**
 * Обогащение wiki_condition из Википедии, Wikidata и вводного текста.
 *
 * Важно: каталог читает coalesce(statements, wiki_condition) в src/db/queries.ts —
 * без колонки после npm run db:migrate фильтр «состояние» всегда пустой.
 *
 * Запуск: npm run enrich:conditions
 *   --dry-run — только статистика, без UPDATE
 */
import { eq, sql } from "drizzle-orm";
import { db } from "../src/db";
import { estates } from "../src/db/schema";
import type { ConditionId } from "../src/lib/labels";
import {
  conditionFromCategories,
  conditionFromText,
  CONDITION_SOURCE_PRIORITY,
  type ConditionSignal,
  pickConditionSignal,
  wikidataToCondition,
} from "../src/lib/condition-inference";

const USER_AGENT = "Usadebki/0.1 (https://usadebki-beta.vercel.app; estate catalog enrichment)";
const DRY_RUN = process.argv.includes("--dry-run");

async function assertWikiConditionColumn() {
  const rows = await db.execute<{ column_name: string }>(sql`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'estates'
      and column_name = 'wiki_condition'
  `);
  if (rows.length === 0) {
    console.error("Нет колонки estates.wiki_condition. Сначала: npm run db:generate && npm run db:migrate");
    process.exit(1);
  }
}

async function fetchWikidataConditions() {
  const query = `
    SELECT ?egrkn ?item ?p5816 ?p5817 ?p576 WHERE {
      ?item wdt:P5381 ?egrkn .
      OPTIONAL { ?item wdt:P5816 ?p5816 }
      OPTIONAL { ?item wdt:P5817 ?p5817 }
      OPTIONAL { ?item wdt:P576 ?p576 }
      FILTER(BOUND(?p5816) || BOUND(?p5817) || BOUND(?p576))
    }
  `;
  const res = await fetch("https://query.wikidata.org/sparql", {
    method: "POST",
    headers: {
      Accept: "application/sparql-results+json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: new URLSearchParams({ query }),
  });
  if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}`);
  const data = (await res.json()) as {
    results?: {
      bindings?: Array<{
        egrkn?: { value: string };
        item?: { value: string };
        p5816?: { value: string };
        p5817?: { value: string };
        p576?: { value: string };
      }>;
    };
  };
  return data.results?.bindings ?? [];
}

async function fetchWikipediaCategories(titles: string[]) {
  const byTitle = new Map<string, string[]>();
  for (let i = 0; i < titles.length; i += 50) {
    const chunk = titles.slice(i, i + 50);
    const url =
      "https://ru.wikipedia.org/w/api.php?action=query&prop=categories&titles=" +
      encodeURIComponent(chunk.join("|")) +
      "&cllimit=500&format=json";
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) continue;
    const data = (await res.json()) as {
      query?: { pages?: Record<string, { title: string; categories?: Array<{ title: string }> }> };
    };
    for (const page of Object.values(data.query?.pages ?? {})) {
      byTitle.set(page.title, (page.categories ?? []).map((c) => c.title));
    }
    await sleep(150);
  }
  return byTitle;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function addSignal(map: Map<string, ConditionSignal[]>, estateId: string, signal: ConditionSignal) {
  const list = map.get(estateId) ?? [];
  list.push(signal);
  map.set(estateId, list);
}

async function main() {
  console.log("=== enrich:conditions ===\n");
  if (DRY_RUN) console.log("(режим --dry-run: UPDATE в БД не выполняется)\n");

  await assertWikiConditionColumn();

  const allEstates = await db
    .select({
      id: estates.id,
      name: estates.name,
      egrknRegNumber: estates.egrknRegNumber,
      wikidataQid: estates.wikidataQid,
      wikipediaTitle: estates.wikipediaTitle,
      summary: estates.summary,
    })
    .from(estates);

  const byReg = new Map(allEstates.map((e) => [e.egrknRegNumber, e]));
  const byQid = new Map(allEstates.filter((e) => e.wikidataQid).map((e) => [e.wikidataQid!, e]));
  const byTitle = new Map(
    allEstates.filter((e) => e.wikipediaTitle).map((e) => [e.wikipediaTitle!, e]),
  );

  const signals = new Map<string, ConditionSignal[]>();

  // 1. Категории Википедии
  const titles = [...byTitle.keys()];
  console.log(`1/3 Категории Википедии (${titles.length} статей)...`);
  const categories = await fetchWikipediaCategories(titles);
  for (const [title, cats] of categories) {
    const estate = byTitle.get(title);
    if (!estate) continue;
    const cond = conditionFromCategories(cats);
    if (!cond) continue;
    addSignal(signals, estate.id, {
      condition: cond,
      source: "wikipedia_category",
      reason: cats.find((c) => /руин|утрачен|заброшен|музе|восстановлен/i.test(c)) ?? title,
    });
  }
  console.log(`   усадеб с сигналом: ${signals.size}`);

  // 2. Wikidata
  console.log("2/3 Wikidata (ЕГРОКН ↔ QID)...");
  let wikidataHits = 0;
  for (const row of await fetchWikidataConditions()) {
    const qid = row.item?.value.split("/").pop();
    const reg = row.egrkn?.value;
    const estate = (reg ? byReg.get(reg) : null) ?? (qid ? byQid.get(qid) : null);
    if (!estate) continue;
    const p5816 = row.p5816?.value.split("/").pop();
    const p5817 = row.p5817?.value.split("/").pop();
    const cond = wikidataToCondition(p5816, p5817, Boolean(row.p576));
    if (!cond) continue;
    addSignal(signals, estate.id, {
      condition: cond,
      source: "wikidata",
      reason: [p5816 && `P5816=${p5816}`, p5817 && `P5817=${p5817}`, row.p576 && "P576"].filter(Boolean).join(", "),
    });
    wikidataHits += 1;
  }
  console.log(`   привязок Wikidata: ${wikidataHits}`);

  // 3. Ввод текста (только если ещё нет более сильного сигнала не нужен — pick сработает)
  console.log("3/3 Ввод summary...");
  let textHits = 0;
  for (const estate of allEstates) {
    if (!estate.summary) continue;
    const cond = conditionFromText(estate.summary);
    if (!cond) continue;
    addSignal(signals, estate.id, {
      condition: cond,
      source: "summary_text",
      reason: estate.summary.slice(0, 80).replace(/\s+/g, " "),
    });
    textHits += 1;
  }
  console.log(`   срабатываний по тексту: ${textHits}`);

  const resolved = new Map<string, { condition: ConditionId; source: string; reason: string }>();
  for (const [id, list] of signals) {
    const picked = pickConditionSignal(list);
    if (!picked) continue;
    resolved.set(id, {
      condition: picked.condition,
      source: picked.source,
      reason: picked.reason,
    });
  }

  const stats: Record<string, number> = {};
  for (const v of resolved.values()) {
    stats[v.condition] = (stats[v.condition] ?? 0) + 1;
  }

  console.log("\nИтого (после приоритетов):", resolved.size);
  console.log("Разбивка:", stats);
  console.log(
    "Плохое (lost+ruins+neglect):",
    (stats.lost ?? 0) + (stats.ruins ?? 0) + (stats.neglect ?? 0),
  );
  console.log("Приоритеты источников:", CONDITION_SOURCE_PRIORITY);

  if (DRY_RUN) {
    console.log("\n--dry-run: выход без записи.");
    process.exit(0);
  }

  await db.execute(sql`update estates set wiki_condition = null`);
  let updated = 0;
  for (const [id, data] of resolved) {
    await db.update(estates).set({ wikiCondition: data.condition, updatedAt: new Date() }).where(eq(estates.id, id));
    updated += 1;
  }
  console.log(`\nОбновлено wiki_condition: ${updated}`);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});