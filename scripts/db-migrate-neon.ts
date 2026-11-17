import { execSync } from "node:child_process";
import path from "node:path";

const url = process.env.NEON_DATABASE_URL?.trim();
if (!url) {
  console.error(
    "В .env задайте NEON_DATABASE_URL — pooled-строка из Neon → Connect → Copy.",
  );
  process.exit(1);
}

const kit = path.join(process.cwd(), "node_modules", "drizzle-kit", "bin.cjs");
execSync(`node ${JSON.stringify(kit)} migrate`, {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url },
});

console.log("Миграции применены к Neon.");