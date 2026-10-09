import fs from "node:fs/promises";
import path from "node:path";
import { resolveSqlitePath } from "./database-path.js";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const LOGO_PREFIX = "school-logo";

const MIME_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

export function resolveDataDir(): string {
  return path.dirname(resolveSqlitePath());
}

export function logoAbsolutePath(relativePath: string): string {
  const dataDir = resolveDataDir();
  const base = path.basename(relativePath);
  if (base !== relativePath || base.includes("..")) {
    throw new Error("Ruta de logotipo inválida");
  }
  return path.join(dataDir, base);
}

export async function ensureDataDir() {
  await fs.mkdir(resolveDataDir(), { recursive: true });
}

export function logoMimeFromFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

export async function readLogoBuffer(relativePath: string | null | undefined): Promise<Buffer | null> {
  if (!relativePath) return null;
  try {
    const abs = logoAbsolutePath(relativePath);
    return await fs.readFile(abs);
  } catch {
    return null;
  }
}

export async function removeLogoFiles() {
  const dataDir = resolveDataDir();
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dataDir);
  } catch {
    return;
  }
  await Promise.all(
    entries
      .filter((f) => f.startsWith(LOGO_PREFIX))
      .map((f) => fs.unlink(path.join(dataDir, f)).catch(() => undefined)),
  );
}

export async function saveSchoolLogoFile(
  buffer: Buffer,
  mimeType: string,
): Promise<{ relativePath: string; mimeType: string }> {
  const ext = MIME_EXT[mimeType];
  if (!ext) {
    throw new Error("Formato no permitido. Use PNG, JPEG o WebP.");
  }
  if (buffer.length === 0) {
    throw new Error("Archivo vacío");
  }
  if (buffer.length > MAX_LOGO_BYTES) {
    throw new Error("La imagen no puede superar 2 MB");
  }

  await ensureDataDir();
  await removeLogoFiles();
  const relativePath = `${LOGO_PREFIX}${ext}`;
  const abs = logoAbsolutePath(relativePath);
  await fs.writeFile(abs, buffer);
  return { relativePath, mimeType };
}

export { MAX_LOGO_BYTES };
