import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const BETA_BASE = "https://usadebki-beta.vercel.app";
const CHECK_SLUG = "usadba-golitsynyh-sad-im-baumana-771420762600005";

/** То же, что в локальной drizzle.__drizzle_migrations — baseline после restore, если журнал пуст. */
const DRIZZLE_BASELINE = [
  {
    id: 1,
    hash: "e0220d4a0f924d321623ea6a1a26e447d7a71481ca47aa43f0d4f25b5538e09e",
    created_at: 1794849068885,
  },
  {
    id: 2,
    hash: "9467d0a0f6662bdd3bc6012a560ac2ac695eb711dad044a2283a987c5e33f912",
    created_at: 1794901073198,
  },
  {
    id: 3,
    hash: "dd1306e9d6de9d8bb353aba7700178f7f7a78efed3f4871fe4c7d7ea26a868b1",
    created_at: 1794911796563,
  },
] as const;

async function main() {
  const url = process.env.NEON_DATABASE_URL?.trim();
  if (!url) {
    console.error("В .env задайте NEON_DATABASE_URL — pooled-строка из Neon → Connect → Copy.");
    process.exit(1);
  }

  console.log("1/4 Локальный дамп (data/usadebki.dump)…");
  execSync("npm run db:dump", { stdio: "inherit", cwd: process.cwd() });

  const dump = path.join(process.cwd(), "data", "usadebki.dump");
  if (!existsSync(dump)) {
    console.error("Дамп не создан.");
    process.exit(1);
  }

  const dataDir = path.join(process.cwd(), "data");
  console.log("2/4 pg_restore в Neon (--clean --if-exists)…");
  execSync(
    [
      "docker run --rm -i",
      `-v ${JSON.stringify(dataDir)}:/data`,
      "postgres:16-alpine",
      `pg_restore -d ${JSON.stringify(url)} --clean --if-exists --no-owner --no-acl /data/usadebki.dump`,
    ].join(" "),
    { stdio: "inherit" },
  );

  // Без prepare: pooled Neon; search_path после pg_restore часто пустой.
  const sql = postgres(url, { max: 1, prepare: false });

  try {
    console.log("3/4 search_path + схема photos и журнал drizzle…");
    // pg_restore --clean сбрасывает search_path у роли/БД → Vercel видит «relation does not exist».
    await sql.unsafe("ALTER DATABASE neondb SET search_path TO public");
    await sql.unsafe("ALTER ROLE CURRENT_USER SET search_path TO public");
    await sql.unsafe("SELECT set_config('search_path', 'public', false)");

    const cols = await sql<{ column_name: string }[]>`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'photos'
        and column_name in ('is_hidden', 'is_ensemble_part')
    `;
    if (cols.length < 2) {
      console.error(
        "На Neon нет колонок photos.is_hidden / is_ensemble_part — карточки будут отдавать 500.",
      );
      process.exit(1);
    }

    const [{ count: conditionCol }] = await sql<{ count: string }[]>`
      select count(*)::text as count
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'estates'
        and column_name = 'wiki_condition'
    `;
    if (Number(conditionCol) === 0) {
      console.error(
        "На Neon нет estates.wiki_condition — фильтр «состояние» на бете пустой. npm run db:migrate:neon или beta:publish с дампом после миграции.",
      );
      process.exit(1);
    }

    const [{ count: journalCount }] = await sql<{ count: string }[]>`
      select count(*)::text as count from drizzle.__drizzle_migrations
    `;
    if (Number(journalCount) === 0) {
      console.log("Журнал drizzle пуст — записываем baseline миграций 0000–0002.");
      for (const row of DRIZZLE_BASELINE) {
        await sql`
          insert into drizzle.__drizzle_migrations (id, hash, created_at)
          values (${row.id}, ${row.hash}, ${row.created_at})
        `;
      }
    }

    console.log(`4/4 HTTP ${BETA_BASE}/estates/${CHECK_SLUG}…`);
    let ok = false;
    let lastStatus = 0;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(`${BETA_BASE}/estates/${CHECK_SLUG}`, { redirect: "follow" });
        lastStatus = response.status;
        if (response.ok) {
          ok = true;
          break;
        }
      } catch {
        // Neon или сеть могут сбрасывать сокет сразу после pg_restore
      }
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 2500));
      }
    }
    if (!ok) {
      console.error(`Бета вернула ${lastStatus}. Код на Vercel мог отставать от схемы — проверьте деплой.`);
      process.exit(1);
    }

    console.log("Готово: Neon обновлён, карточка на бете отвечает 200.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});