import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

/**
 * Modo WAL: las lecturas no se bloquean mientras se escribe (y viceversa).
 * Queda guardado en el propio fichero; se vuelve a aplicar tras restaurar una copia.
 */
export async function configureSqlite() {
  await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL");
}
