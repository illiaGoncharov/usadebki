/**
 * Извлечение фотографий и паспортных данных из raw_json ЕГРОКН.
 */

export type EgrknPhoto = {
  url: string;
  description?: string;
};

export type EgrknPassportData = {
  createDate?: string;
  architect?: string;
  protectionStatus?: string;
  address?: string;
  mainPhoto?: EgrknPhoto | null;
  additionalPhotos?: EgrknPhoto[];
};

/**
 * Извлекает главное фото из паспорта ЕГРОКН.
 */
export function extractEgrknMainPhoto(rawJson: unknown): EgrknPhoto | null {
  const general = asRecord(rawJson);
  if (!general) return null;

  // Ищем mainPhoto или photos[0]
  const mainPhoto = general.mainPhoto;
  if (mainPhoto && typeof mainPhoto === "object") {
    const photoData = mainPhoto as Record<string, unknown>;
    const url = photoData.url;
    if (typeof url === "string" && url.trim()) {
      return {
        url: url.trim(),
        description: typeof photoData.description === "string" ? photoData.description.trim() : undefined,
      };
    }
  }

  // Fallback: ищем массив photos
  const photos = general.photos;
  if (Array.isArray(photos) && photos.length > 0) {
    const firstPhoto = photos[0];
    if (typeof firstPhoto === "object" && firstPhoto !== null) {
      const photoData = firstPhoto as Record<string, unknown>;
      const url = photoData.url;
      if (typeof url === "string" && url.trim()) {
        return {
          url: url.trim(),
          description: typeof photoData.description === "string" ? photoData.description.trim() : undefined,
        };
      }
    }
  }

  return null;
}

/**
 * Извлекает паспортные данные из raw_json для генерации справочного текста.
 */
export function extractEgrknPassportData(rawJson: unknown): EgrknPassportData {
  const general = asRecord(rawJson);
  if (!general) return {};

  const result: EgrknPassportData = {};

  // Дата создания
  if (typeof general.createDate === "string" && general.createDate.trim()) {
    result.createDate = general.createDate.trim();
  }

  // Архитектор
  if (typeof general.architect === "string" && general.architect.trim()) {
    result.architect = general.architect.trim();
  } else if (Array.isArray(general.architects)) {
    const names = general.architects
      .map((a) => {
        if (typeof a === "string") return a.trim();
        if (typeof a === "object" && a !== null) {
          const rec = a as Record<string, unknown>;
          if (typeof rec.name === "string") return rec.name.trim();
        }
        return null;
      })
      .filter((n): n is string => Boolean(n));
    if (names.length > 0) {
      result.architect = names.join(", ");
    }
  }

  // Статус охраны
  if (typeof general.protectionStatus === "string" && general.protectionStatus.trim()) {
    result.protectionStatus = general.protectionStatus.trim();
  } else if (typeof general.categoryType === "object" && general.categoryType !== null) {
    const cat = general.categoryType as Record<string, unknown>;
    if (typeof cat.value === "string" && cat.value.trim()) {
      result.protectionStatus = cat.value.trim();
    }
  }

  // Адрес
  if (typeof general.address === "object" && general.address !== null) {
    const addr = general.address as Record<string, unknown>;
    if (typeof addr.fullAddress === "string" && addr.fullAddress.trim()) {
      result.address = addr.fullAddress.trim();
    }
  }

  // Главное фото
  result.mainPhoto = extractEgrknMainPhoto(general);

  return result;
}

/**
 * Генерирует короткий справочный текст из паспортных данных ЕГРОКН.
 * Используется только для объектов без текста из других источников.
 */
export function generateReferenceText(data: EgrknPassportData): string | null {
  const parts: string[] = [];

  if (data.createDate) {
    parts.push(`Дата создания: ${data.createDate}.`);
  }

  if (data.architect) {
    parts.push(`Архитектор: ${data.architect}.`);
  }

  if (data.protectionStatus) {
    parts.push(`Статус: ${data.protectionStatus}.`);
  }

  if (data.address) {
    parts.push(`Адрес: ${data.address}.`);
  }

  if (parts.length === 0) return null;

  return parts.join(" ");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
