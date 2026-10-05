import fs from "node:fs/promises";
import path from "node:path";

const SQLITE_MAGIC = "SQLite format 3";

export function resolveSqlitePath(): string {
  const url = process.env.DATABASE_URL ?? "file:./data/finband.db";
  if (!url.startsWith("file:")) {
    throw new Error("La copia de seguridad solo está disponible con base SQLite");
  }
  let filePath = url.slice("file:".length);
  if (filePath.startsWith("//")) {
    filePath = filePath.slice(1);
  }
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

export async function assertSqliteFile(filePath: string) {
  const handle = await fs.open(filePath, "r");
  try {
    const buf = Buffer.alloc(16);
    await handle.read(buf, 0, 16, 0);
    if (!buf.toString("utf8", 0, 15).startsWith(SQLITE_MAGIC.slice(0, 15))) {
      throw new Error("El archivo no es una base SQLite válida");
    }
  } finally {
    await handle.close();
  }
}

export async function assertSqliteBuffer(data: Buffer) {
  if (data.length < 16) {
    throw new Error("Archivo demasiado pequeño");
  }
  const head = data.subarray(0, 16).toString("utf8");
  if (!head.startsWith(SQLITE_MAGIC.slice(0, 15))) {
    throw new Error("El archivo no es una base SQLite válida");
  }
}
