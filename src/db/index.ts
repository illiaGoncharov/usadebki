import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Sql = ReturnType<typeof postgres>;

const globalForDb = globalThis as unknown as { sql?: Sql };

function createSql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Не задан DATABASE_URL");
  }
  // Pooled Neon/Vercel: без prepared statements (PgBouncer).
  const pooled = /-pooler\.|pgbouncer=true/i.test(url);
  return postgres(url, { max: 10, prepare: !pooled });
}

export const sql = globalForDb.sql ?? createSql();

if (process.env.NODE_ENV !== "production") {
  globalForDb.sql = sql;
}

export const db = drizzle(sql, { schema });
