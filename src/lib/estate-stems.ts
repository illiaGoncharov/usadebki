import { decodePhotoName } from "./photo";

/** Отличительные фрагменты названия объекта для сопоставления с именем файла (в т.ч. латиница в Commons). */
export function estateNameStems(name: string): string[] {
  const raw = name
    .toLowerCase()
    .replace(/[«»"—–]/g, " ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 4);
  const extra: string[] = [];
  for (const w of raw) {
    if (w.startsWith("богослов")) extra.push("bogoslov");
    if (w.startsWith("зинов")) extra.push("zinov");
    if (w.startsWith("ясн") && w.includes("полян")) extra.push("yasnaya", "polyana");
  }
  return [...new Set([...raw, ...extra])];
}

export function filenameMatchesEstate(filename: string, stems: string[]): boolean {
  const low = decodePhotoName(filename).toLowerCase();
  return stems.some((s) => low.includes(s));
}