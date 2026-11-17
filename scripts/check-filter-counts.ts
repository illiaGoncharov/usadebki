import { sql } from "drizzle-orm";
import { db, sql as pg } from "../src/db";

async function main() {
  const [row] = await db.execute<{
    total: number;
    with_summary: number;
    with_photo: number;
    text_only: number;
    photo_and_text: number;
    wikipedia: number;
  }>(sql`
    select
      (select count(*)::int from estates) as total,
      (select count(*)::int from estates where summary is not null and trim(summary) <> '') as with_summary,
      (select count(*)::int from estates e where exists (select 1 from photos p where p.estate_id = e.id)) as with_photo,
      (select count(*)::int from estates where summary is not null and trim(summary) <> '') as text_only,
      (select count(*)::int from estates e
        where e.summary is not null and trim(e.summary) <> ''
        and exists (select 1 from lateral (
          select url from photos where estate_id = e.id limit 1
        ) p)) as photo_and_text,
      (select count(*)::int from estates where summary_source = 'wikipedia') as wikipedia
  `);
  console.log("Сводка:", row);
  console.log("\nРегионы ~430–460 записей:");
  const regions = await db.execute<{
    region_id: string;
    region_name: string;
    total: number;
    with_text: number;
    with_photo: number;
  }>(sql`
    select e.region_id, e.region_name,
      count(*)::int as total,
      count(*) filter (where e.summary is not null and trim(e.summary) <> '')::int as with_text,
      count(*) filter (where exists (select 1 from photos p where p.estate_id = e.id))::int as with_photo
    from estates e
    group by e.region_id, e.region_name
    having count(*) between 430 and 460
    order by count(*) desc
  `);
  for (const item of regions) console.log(item);

  const slices = await db.execute<{ label: string; n: number }>(sql`
    select 'text only' as label, count(*)::int as n from estates where summary is not null and trim(summary) <> ''
    union all
    select 'photo only', count(*)::int from estates e where exists (select 1 from photos p where p.estate_id = e.id)
      and (e.summary is null or trim(e.summary) = '')
    union all
    select 'photo+text', count(*)::int from estates e
      where summary is not null and trim(summary) <> ''
      and exists (select 1 from photos p where p.estate_id = e.id)
    union all
    select 'wikipedia text', count(*)::int from estates where summary_source = 'wikipedia'
    union all
    select 'region 77 text', count(*)::int from estates where region_id = '77' and summary is not null
    union all
    select 'region 77 photo+text', count(*)::int from estates e where region_id = '77'
      and summary is not null and exists (select 1 from photos p where p.estate_id = e.id)
  `);
  console.log("\nСрезы:");
  for (const item of slices) console.log(item);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pg.end({ timeout: 5 }));