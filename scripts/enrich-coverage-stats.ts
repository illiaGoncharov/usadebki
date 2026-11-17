/**
 * Скрипт для сбора статистики покрытия усадеб фотографиями и текстами.
 * Показывает: общее количество, % с фото, % с текстом, разбивку по источникам и регионам.
 */
import { count, eq, isNotNull, sql as sqlOp } from "drizzle-orm";
import { db, sql as pg } from "../src/db";
import { estates, photos } from "../src/db/schema";

async function main() {
  console.log("=== Статистика покрытия усадеб ===\n");

  // Общая статистика
  const [totalRow] = await db
    .select({ count: count() })
    .from(estates);
  const total = totalRow?.count ?? 0;

  const [withPhotoRow] = await db
    .select({ count: sqlOp<number>`count(distinct ${estates.id})::int` })
    .from(estates)
    .innerJoin(photos, eq(photos.estateId, estates.id));
  const withPhoto = withPhotoRow?.count ?? 0;

  const [withTextRow] = await db
    .select({ count: count() })
    .from(estates)
    .where(isNotNull(estates.summary));
  const withText = withTextRow?.count ?? 0;

  console.log(`Всего усадеб: ${total}`);
  console.log(`С фотографиями: ${withPhoto} (${percent(withPhoto, total)})`);
  console.log(`С текстом: ${withText} (${percent(withText, total)})`);
  console.log("");

  // Статистика по источникам фото
  const photoSources = await db.execute<{
    origin: string;
    count: number;
    ensemble_part: number;
  }>(sqlOp`
    select 
      origin,
      count(*)::int as count,
      count(case when is_ensemble_part then 1 end)::int as ensemble_part
    from photos
    where not is_hidden
    group by origin
    order by count(*) desc
  `);

  console.log("=== Фото по источникам ===");
  for (const source of photoSources) {
    const ensembleNote = source.ensemble_part > 0 ? ` (из них частей ансамбля: ${source.ensemble_part})` : "";
    console.log(`  ${source.origin}: ${source.count}${ensembleNote}`);
  }
  console.log("");

  // Статистика по регионам (топ-20)
  const regionStats = await db.execute<{
    region_id: string;
    region_name: string;
    total: number;
    with_photo: number;
    with_text: number;
  }>(sqlOp`
    select 
      e.region_id,
      e.region_name,
      count(distinct e.id)::int as total,
      count(distinct case when exists(select 1 from photos p where p.estate_id = e.id) then e.id end)::int as with_photo,
      count(distinct case when e.summary is not null then e.id end)::int as with_text
    from estates e
    group by e.region_id, e.region_name
    order by count(distinct e.id) desc
    limit 20
  `);

  console.log("=== Топ-20 регионов по количеству усадеб ===");
  console.log(
    "Регион".padEnd(30) +
    "Всего".padEnd(10) +
    "С фото".padEnd(15) +
    "С текстом".padEnd(15)
  );
  console.log("-".repeat(70));

  for (const row of regionStats) {
    const photoPercent = percent(row.with_photo, row.total);
    const textPercent = percent(row.with_text, row.total);
    console.log(
      row.region_name.slice(0, 28).padEnd(30) +
      String(row.total).padEnd(10) +
      `${row.with_photo} (${photoPercent})`.padEnd(15) +
      `${row.with_text} (${textPercent})`.padEnd(15)
    );
  }
  console.log("");

  // Усадьбы без фото (топ регионов)
  const regionsNeedingPhotos = await db.execute<{
    region_name: string;
    without_photo: number;
  }>(sqlOp`
    select 
      e.region_name,
      count(*)::int as without_photo
    from estates e
    where not exists (
      select 1 from photos p where p.estate_id = e.id
    )
    group by e.region_name
    order by count(*) desc
    limit 10
  `);

  console.log("=== Топ-10 регионов по количеству усадеб БЕЗ фото ===");
  for (const row of regionsNeedingPhotos) {
    console.log(`  ${row.region_name}: ${row.without_photo}`);
  }
}

function percent(part: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => pg.end({ timeout: 5 }));
