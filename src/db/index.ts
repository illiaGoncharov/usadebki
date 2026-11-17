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
  // Pooled Neon/Vercel: без prepared statements (PgBouncer); один коннект на инстанс serverless.
  const pooled = /-pooler\.|pgbouncer=true/i.test(url);
  return postgres(url, { max: 1, prepare: !pooled, idle_timeout: 20, connect_timeout: 10 });
}

export const sql = globalForDb.sql ?? createSql();
globalForDb.sql = sql;

export const db = drizzle(sql, { schema });
