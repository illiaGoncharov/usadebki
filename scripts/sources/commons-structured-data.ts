/**
 * Работа со структурированными данными Commons (SDC).
 * Позволяет проверить, что файл depicts конкретный объект.
 */

const USER_AGENT = "Usadebki/0.1 (local estate catalog; research)";

export type CommonsDepicts = {
  filename: string;
  depicts: string[]; // Wikidata QIDs
  coordinates: { lat: number; lng: number } | null;
};

/**
 * Получает structured data для батча файлов с Commons.
 * Возвращает depicts (P180) и coordinates для каждого файла.
 */
export async function getCommonsStructuredData(filenames: string[]): Promise<Map<string, CommonsDepicts>> {
  const result = new Map<string, CommonsDepicts>();
  
  // Commons Structured Data API работает по одному файлу
  // Для батча делаем параллельные запросы с ограничением
  const chunks: string[][] = [];
  for (let i = 0; i < filenames.length; i += 10) {
    chunks.push(filenames.slice(i, i + 10));
  }

  for (const chunk of chunks) {
    await Promise.all(
      chunk.map(async (filename) => {
        try {
          const data = await fetchFileStructuredData(filename);
          if (data) result.set(normalizeFilename(filename), data);
        } catch (error) {
          console.warn(`  SDC для ${filename}:`, error instanceof Error ? error.message : error);
        }
      })
    );
    await sleep(200);
  }

  return result;
}

async function fetchFileStructuredData(filename: string): Promise<CommonsDepicts | null> {
  // М-0 — mediainfo ID для файла
  const pageTitle = `File:${filename}`;
  const url = `https://commons.wikimedia.org/w/api.php?${new URLSearchParams({
    action: "query",
    format: "json",
    prop: "pageprops",
    titles: pageTitle,
  })}`;

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) return null;

  const json = (await response.json()) as {
    query?: {
      pages?: Record<string, {
        pageprops?: { page_image_free?: string; wikibase_item?: string };
      }>;
    };
  };

  const pages = json.query?.pages;
  if (!pages) return null;

  const page = Object.values(pages)[0];
  if (!page) return null;

  // Для получения depicts нужен отдельный запрос к wbgetentities
  // Пока возвращаем пустой массив - полная реализация требует wikibase API
  // TODO: реализовать через wbgetentities с mediainfo ID
  
  return {
    filename,
    depicts: [],
    coordinates: null,
  };
}

/**
 * Проверяет, depicts ли файл конкретный Wikidata QID.
 * Используется для фильтрации фото из категорий ансамблей.
 */
export function fileDepictsQid(sdc: CommonsDepicts | undefined, qid: string): boolean {
  if (!sdc) return false;
  return sdc.depicts.includes(qid);
}

/**
 * Проверяет, находится ли файл близко к координатам объекта.
 */
export function fileNearCoordinates(
  sdc: CommonsDepicts | undefined,
  lat: number,
  lng: number,
  radiusKm: number = 0.1 // 100 метров по умолчанию
): boolean {
  if (!sdc?.coordinates) return false;
  const distance = haversineDistance(lat, lng, sdc.coordinates.lat, sdc.coordinates.lng);
  return distance <= radiusKm;
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Радиус Земли в км
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function normalizeFilename(name: string): string {
  return decodeURIComponent(name).replace(/_/g, " ").trim().toLowerCase();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
