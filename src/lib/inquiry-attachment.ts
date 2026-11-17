import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export type ParsedAttachment = {
  buffer: Buffer;
  filename: string;
  contentType: string;
};

export async function readInquiryAttachment(value: FormDataEntryValue | null): Promise<ParsedAttachment | null> {
  if (!(value instanceof File) || value.size === 0) return null;
  if (value.size > MAX_BYTES) throw new Error("Файл больше 4 МБ — сожмите или пришлите ссылку.");
  const contentType = value.type || "application/octet-stream";
  if (!ALLOWED.has(contentType)) throw new Error("Нужен снимок JPEG, PNG или WebP.");
  const filename = (value.name || "photo.jpg").replace(/[^\w.\-()а-яёА-ЯЁ ]+/g, "_").slice(0, 120);
  const buffer = Buffer.from(await value.arrayBuffer());
  return { filename, contentType, buffer };
}

/** Локально кладём в data/inquiry-uploads (на Vercel без Blob — только письмо). */
export async function saveInquiryAttachment(inquiryId: string, file: ParsedAttachment): Promise<string | null> {
  if (process.env.VERCEL === "1") return null;
  const dir = path.join(process.cwd(), "data", "inquiry-uploads");
  await mkdir(dir, { recursive: true });
  const safe = file.filename.replace(/\s+/g, "_");
  const rel = path.join("data", "inquiry-uploads", `${inquiryId}-${safe}`);
  const full = path.join(process.cwd(), rel);
  await writeFile(full, file.buffer);
  return rel;
}