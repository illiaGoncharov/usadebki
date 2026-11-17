/**
 * Интеграция с PastVu — исторические фотографии.
 * API: https://pastvu.com/api
 * Лицензия: некоммерческое использование, показываем превью со ссылками.
 */

const USER_AGENT = "Usadebki/0.1 (open catalog; contact via GitHub illiaGoncharov/usadebki)";
/** @see https://docs.pastvu.com/dev/api */
const PASTVU_API = "https://api.pastvu.com/api2";

export type PastVuPhoto = {
  cid: number;
  file: string; // filename
  title: string | null;
  year: number | null;
  year2: number | null;
  author: string | null;
  source: string | null;
  thumb: string;
  full: string;
  link: string; // pastvu.com link
  lat: number;
  lng: number;
};

/**
 * Загружает исторические фото рядом с координатами.
 * @param lat широта
 * @param lng долгота
 * @param radiusKm радиус поиска в км (по умолчанию 0.25 км = 250 м)
 * @param limit максимум фото (по умолчанию 10)
 */
export async function fetchNearbyHistoricalPhotos(
  lat: number,
  lng: number,
  radiusKm: number = 0.25,
  limit: number = 10,
  skip: number = 0,
): Promise<PastVuPhoto[]> {
  try {
    const params = new URLSearchParams({
      method: "photo.giveNearestPhotos",
      params: JSON.stringify({
        geo: [lat, lng],
        distance: Math.round(radiusKm * 1000),
        limit: Math.min(limit, 30),
        skip,
        year: 1800,
        year2: 1990,
        type: "photo",
      }),
    });
    const url = `${PASTVU_API}?${params.toString()}`;

    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.warn(`PastVu API error: ${response.status}`);
      return [];
    }

    const json = (await response.json()) as {
      code?: string;
      result?: {
        photos?: Array<{
          cid?: number;
          file?: string;
          title?: string;
          year?: number;
          year2?: number;
          geo?: [number, number];
          author?: string;
          source?: string;
        }>;
      };
    };

    if (json.code) {
      console.warn(`PastVu API error: ${json.code}`);
      return [];
    }

    const photos = json.result?.photos ?? [];
    
    return photos
      .filter((p) => p.cid && p.file && p.geo)
      .map((p) => ({
        cid: p.cid!,
        file: p.file!,
        title: p.title || null,
        year: p.year || null,
        year2: p.year2 || null,
        author: p.author || null,
        source: p.source || null,
        thumb: `https://img.pastvu.com/h/${p.file}`,
        full: `https://img.pastvu.com/d/${p.file}`,
        link: `https://pastvu.com/${p.cid}`,
        lat: p.geo![0],
        lng: p.geo![1],
      }))
      .slice(0, limit);
  } catch (error) {
    console.warn("PastVu fetch error:", error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Несколько страниц подряд: API отдаёт максимум 30 за запрос, а у большого ансамбля
 * первые 30 ближайших снимков часто про один и тот же двор.
 */
export async function fetchNearbyHistoricalPhotosPaged(
  lat: number,
  lng: number,
  radiusKm: number,
  pages: number,
): Promise<PastVuPhoto[]> {
  const chunks = await Promise.all(
    Array.from({ length: pages }, (_, i) => fetchNearbyHistoricalPhotos(lat, lng, radiusKm, 30, i * 30)),
  );
  const seen = new Set<number>();
  return chunks.flat().filter((photo) => (seen.has(photo.cid) ? false : (seen.add(photo.cid), true)));
}

/** Расстояние между точками в метрах (для выбора ближайшего снимка к объекту). */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthM = 6_371_000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return earthM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Самый близкий к координатам объекта кадр из ответа PastVu. */
export function pickClosestPastVuPhoto(photos: PastVuPhoto[], lat: number, lng: number) {
  if (photos.length === 0) return null;
  return [...photos].sort(
    (a, b) => distanceMeters(lat, lng, a.lat, a.lng) - distanceMeters(lat, lng, b.lat, b.lng),
  )[0]!;
}

/** Форматирует год или диапазон лет для отображения. */
export function formatPastVuYear(year: number | null, year2: number | null): string {
  if (!year) return "дата не указана";
  if (year2 && year2 !== year) return `${year}–${year2}`;
  return String(year);
}