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
  thumb: string; // thumbnail URL
  link: string; // pastvu.com link
  lat: number;
  lng: number;
};

/**
 * Загружает исторические фото рядом с координатами.
 * @param lat широта
 * @param lng долгота
 * @param radiusKm радиус поиска в км (по умолчанию 0.5 км = 500 м)
 * @param limit максимум фото (по умолчанию 10)
 */
export async function fetchNearbyHistoricalPhotos(
  lat: number,
  lng: number,
  radiusKm: number = 0.5,
  limit: number = 10
): Promise<PastVuPhoto[]> {
  try {
    const params = new URLSearchParams({
      method: "photo.giveNearestPhotos",
      params: JSON.stringify({
        geo: [lat, lng],
        distance: Math.round(radiusKm * 1000),
        limit: Math.min(limit, 30),
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
        link: `https://pastvu.com/${p.cid}`,
        lat: p.geo![0],
        lng: p.geo![1],
      }))
      .sort((a, b) => {
        // Сортируем по году (старые первыми)
        const yearA = a.year || 9999;
        const yearB = b.year || 9999;
        return yearA - yearB;
      })
      .slice(0, limit);
  } catch (error) {
    console.warn("PastVu fetch error:", error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Форматирует год или диапазон лет для отображения.
 */
export function formatPastVuYear(year: number | null, year2: number | null): string {
  if (!year) return "дата не указана";
  if (year2 && year2 !== year) return `${year}–${year2}`;
  return String(year);
}
