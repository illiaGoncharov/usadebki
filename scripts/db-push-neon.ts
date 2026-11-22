import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const url = process.env.NEON_DATABASE_URL?.trim();
if (!url) {
  console.error("В .env задайте NEON_DATABASE_URL — pooled-строка из Neon → Connect → Copy.");
  process.exit(1);
}

const dump = path.join(process.cwd(), "data", "usadebki.dump");
if (!existsSync(dump)) {
  console.error("Нет data/usadebki.dump. Сначала: npm run db:dump");
  process.exit(1);
}

const dataDir = path.join(process.cwd(), "data");
execSync(
  [
    "docker run --rm -i",
    `-v ${JSON.stringify(dataDir)}:/data`,
    "postgres:16-alpine",
    `pg_restore -d ${JSON.stringify(url)} --clean --if-exists --no-owner --no-acl /data/usadebki.dump`,
  ].join(" "),
  { stdio: "inherit" },
);

// pg_restore --clean может обнулить search_path — без public приложение на Vercel падает с 500.
const sql = postgres(url, { max: 1, prepare: false });
try {
  await sql.unsafe("ALTER DATABASE neondb SET search_path TO public");
  await sql.unsafe("ALTER ROLE CURRENT_USER SET search_path TO public");
} finally {
  await sql.end({ timeout: 5 });
}

console.log("База на Neon обновлена. Проверка в SQL Editor: select count(*) from estates;");
