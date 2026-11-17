/**
 * Интеграция с PastVu — исторические фотографии.
 * API: https://pastvu.com/api
 * Лицензия: некоммерческое использование, показываем превью со ссылками.
 */

const USER_AGENT = "Usadebki/0.1 (open catalog; contact via GitHub illiaGoncharov/usadebki)";
const PASTVU_API = "https://pastvu.com/_api";

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
    // PastVu API: /photo/giveNearestPhotos
    const url = `${PASTVU_API}/photo/giveNearestPhotos`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        geo: [lng, lat], // PastVu использует [lng, lat]
        z: 15, // zoom level
        distance: radiusKm * 1000, // в метрах
        limit,
        except: [],
        year: { from: 1800, to: 1990 }, // только старые фото
        type: "photo",
      }),
      next: { revalidate: 86400 }, // кэш на сутки
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.warn(`PastVu API error: ${response.status}`);
      return [];
    }

    const json = (await response.json()) as {
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
        thumb: `https://pastvu.com/_p/d/${p.file}`,
        link: `https://pastvu.com/${p.cid}`,
        lat: p.geo![1],
        lng: p.geo![0],
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
