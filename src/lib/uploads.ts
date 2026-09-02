import { existsSync, mkdirSync, unlinkSync, readdirSync } from "fs";
import { join } from "path";

const UPLOADS_DIR = join(process.cwd(), "uploads");
const ANIME_DIR = join(UPLOADS_DIR, "anime");

export const MAX_FILE_SIZE = 5 * 1024 * 1024;

export function isSafeFileName(name: string): boolean {
  if (!name || name.length > 255) return false;
  if (/[\/\\]|\.\./.test(name)) return false;
  return /^[a-zA-Z0-9._-]+$/.test(name);
}

export function sniffImageExtension(data: Buffer): string | null {
  if (data.length < 4) return null;

  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    return "png";
  }

  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return "jpeg";
  }

  if (
    data[0] === 0x52 &&
    data[1] === 0x49 &&
    data[2] === 0x46 &&
    data[3] === 0x46 &&
    data.length >= 12
  ) {
    const webpMarker = data.toString("ascii", 8, 12);
    if (webpMarker === "WEBP") {
      return "webp";
    }
  }

  return null;
}

export function getContentType(ext: string): string {
  const types: Record<string, string> = {
    png: "image/png",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    webp: "image/webp",
  };
  return types[ext.toLowerCase()] || "application/octet-stream";
}

export async function saveAnimeImage(
  file: File,
  fileName: string
): Promise<{ path: string; ext: string }> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`Файл слишком большой: ${(file.size / 1024 / 1024).toFixed(1)} МБ (максимум 5 МБ)`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const detectedExt = sniffImageExtension(buffer);

  if (!detectedExt) {
    throw new Error("Не удалось определить формат файла. Загружайте PNG, JPEG или WebP.");
  }

  if (!isSafeFileName(fileName)) {
    throw new Error("Неправильное имя файла");
  }

  mkdirSync(ANIME_DIR, { recursive: true });

  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const savedName = `heroine-${timestamp}-${random}.${detectedExt}`;
  const filePath = join(ANIME_DIR, savedName);

  const fs = await import("fs/promises");
  await fs.writeFile(filePath, buffer);

  return { path: savedName, ext: detectedExt };
}

export function deleteAnimeImage(fileName: string): void {
  if (!isSafeFileName(fileName)) return;

  const filePath = join(ANIME_DIR, fileName);
  if (existsSync(filePath) && filePath.startsWith(ANIME_DIR)) {
    unlinkSync(filePath);
  }
}

export function getAnimeImages(): string[] {
  if (!existsSync(ANIME_DIR)) return [];

  try {
    return readdirSync(ANIME_DIR).filter((f) => isSafeFileName(f));
  } catch {
    return [];
  }
}
