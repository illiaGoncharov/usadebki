/**
 * Снимок правок «уточнить» и обращений с /feedback в data/crowdsource/.
 * Источник правды — Postgres (contributions, inquiries); архив для бэкапа и разбора вне админки.
 *
 *   npm run crowdsource:archive
 *   npm run crowdsource:archive -- --stdout   только JSON в консоль, без записи
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { db } from "../src/db";
import { contributions, estates, inquiries } from "../src/db/schema";

const STDOUT = process.argv.includes("--stdout");
const OUT_DIR = path.join(process.cwd(), "data/crowdsource");

async function main() {
  const contributionRows = await db
    .select({
      id: contributions.id,
      estateId: contributions.estateId,
      estateSlug: estates.slug,
      estateName: estates.name,
      predicate: contributions.predicate,
      text: contributions.text,
      authorName: contributions.authorName,
      contact: contributions.contact,
      sourceTitle: contributions.sourceTitle,
      sourcePage: contributions.sourcePage,
      sourceUrl: contributions.sourceUrl,
      status: contributions.status,
      createdAt: contributions.createdAt,
    })
    .from(contributions)
    .innerJoin(estates, eq(estates.id, contributions.estateId))
    .orderBy(desc(contributions.createdAt));

  const inquiryRows = await db
    .select({
      id: inquiries.id,
      topic: inquiries.topic,
      estateSlug: inquiries.estateSlug,
      estateName: inquiries.estateName,
      message: inquiries.message,
      authorName: inquiries.authorName,
      contact: inquiries.contact,
      pageUrl: inquiries.pageUrl,
      suggestedPhotoUrl: inquiries.suggestedPhotoUrl,
      attachmentFilename: inquiries.attachmentFilename,
      attachmentPath: inquiries.attachmentPath,
      emailSent: inquiries.emailSent,
      createdAt: inquiries.createdAt,
    })
    .from(inquiries)
    .orderBy(desc(inquiries.createdAt));

  const payload = {
    exportedAt: new Date().toISOString(),
    contributions: contributionRows,
    inquiries: inquiryRows,
    stats: {
      contributions: {
        total: contributionRows.length,
        pending: contributionRows.filter((row) => row.status === "pending").length,
        accepted: contributionRows.filter((row) => row.status === "accepted").length,
      },
      inquiries: { total: inquiryRows.length },
    },
  };

  const json = JSON.stringify(payload, null, 2);

  if (STDOUT) {
    console.log(json);
    return;
  }

  await mkdir(OUT_DIR, { recursive: true });
  const stamp = payload.exportedAt.replace(/[:.]/g, "-");
  const stamped = path.join(OUT_DIR, `archive-${stamp}.json`);
  const latest = path.join(OUT_DIR, "latest.json");
  await writeFile(stamped, json, "utf8");
  await writeFile(latest, json, "utf8");

  console.log(`Записано: ${stamped}`);
  console.log(`Актуальная копия: ${latest}`);
  console.log(
    `Правки: ${payload.stats.contributions.total} (ожидают: ${payload.stats.contributions.pending}), обращений: ${payload.stats.inquiries.total}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});