import multipart from "@fastify/multipart";
import type { FastifyInstance } from "fastify";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { recordAudit } from "../lib/audit.js";
import { assertSqliteBuffer, resolveSqlitePath } from "../lib/database-path.js";
import { configureSqlite, prisma } from "../lib/prisma.js";

const MAX_BACKUP_BYTES = 80 * 1024 * 1024;
const SIDE_FILE_SUFFIXES = ["-journal", "-wal", "-shm"];

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
// apps/api/{src,dist}/routes → raíz del repositorio
const schemaPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../prisma/schema.prisma",
);

let restoreInProgress = false;

function backupFilename() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `finband-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.sqlite`;
}

function sqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Copia coherente de la base abierta (no copia el fichero en mitad de una escritura). */
async function vacuumInto(target: string) {
  await fs.rm(target, { force: true });
  await prisma.$executeRawUnsafe(`VACUUM INTO ${sqlString(target)}`);
}

async function removeSideFiles(dbPath: string) {
  await Promise.all(SIDE_FILE_SUFFIXES.map((s) => fs.rm(dbPath + s, { force: true })));
}

/** Sustituye el fichero de la base de forma atómica, sin journals de la base anterior. */
async function swapDatabaseFile(source: string, dbPath: string) {
  await prisma.$disconnect();
  await removeSideFiles(dbPath);
  await fs.rename(source, dbPath);
  await prisma.$connect();
  await configureSqlite();
}

/** Aplica las migraciones pendientes: la copia puede venir de una versión anterior. */
async function migrateRestoredDatabase(dbPath: string) {
  const prismaCli = require.resolve("prisma/build/index.js");
  await execFileAsync(
    process.execPath,
    [prismaCli, "migrate", "deploy", "--schema", schemaPath],
    { env: { ...process.env, DATABASE_URL: `file:${dbPath}` }, timeout: 120_000 },
  );
}

async function verifyRestoredDatabase() {
  const rows = await prisma.$queryRawUnsafe<Array<{ quick_check: string }>>("PRAGMA quick_check");
  if (rows[0]?.quick_check !== "ok") {
    throw new Error("La copia está dañada (PRAGMA quick_check)");
  }
  const admins = await prisma.user.count({ where: { role: "ADMIN" } });
  if (admins === 0) {
    throw new Error("La copia no contiene ningún usuario administrador");
  }
}

export async function backupRoutes(app: FastifyInstance) {
  await app.register(multipart, {
    limits: { fileSize: MAX_BACKUP_BYTES, files: 1 },
  });

  app.get("/database", async (request, reply) => {
    const dbPath = resolveSqlitePath();
    const snapshot = `${dbPath}.export-${Date.now()}.tmp`;
    try {
      await vacuumInto(snapshot);
      const data = await fs.readFile(snapshot);
      await recordAudit(request, { action: "BACKUP_DOWNLOAD", entityType: "database" });
      return reply
        .header("Content-Type", "application/octet-stream")
        .header("Content-Disposition", `attachment; filename="${backupFilename()}"`)
        .send(data);
    } finally {
      await fs.rm(snapshot, { force: true });
    }
  });

  app.post("/restore", async (request, reply) => {
    if (restoreInProgress) {
      return reply.status(409).send({ error: "Ya hay una restauración en curso" });
    }

    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: "Archivo requerido (.sqlite)" });
    }

    const buffer = await data.toBuffer().catch(() => null);
    if (!buffer || data.file.truncated) {
      return reply.status(400).send({ error: "Archivo demasiado grande" });
    }
    if (buffer.length === 0) {
      return reply.status(400).send({ error: "Archivo vacío" });
    }
    try {
      await assertSqliteBuffer(buffer);
    } catch (e) {
      return reply.status(400).send({
        error: e instanceof Error ? e.message : "Archivo inválido",
      });
    }

    const dbPath = resolveSqlitePath();
    const stamp = Date.now();
    const incoming = `${dbPath}.incoming-${stamp}.tmp`;
    const safetyCopy = `${dbPath}.pre-restore-${stamp}.bak`;
    const username = request.user.username;

    restoreInProgress = true;
    try {
      await fs.mkdir(path.dirname(dbPath), { recursive: true });
      await vacuumInto(safetyCopy);
      await fs.writeFile(incoming, buffer);

      try {
        await swapDatabaseFile(incoming, dbPath);
        await migrateRestoredDatabase(dbPath);
        await verifyRestoredDatabase();
      } catch (e) {
        request.log.error(e, "Restauración fallida; recuperando la base anterior");
        const rollback = `${dbPath}.rollback-${stamp}.tmp`;
        await fs.copyFile(safetyCopy, rollback);
        await swapDatabaseFile(rollback, dbPath);
        return reply.status(400).send({
          error: "No se pudo restaurar la copia. Se mantuvo la base anterior.",
          details: e instanceof Error ? e.message : undefined,
        });
      }

      // Se registra en la base restaurada, que es la que queda en uso.
      await recordAudit(request, {
        action: "RESTORE",
        entityType: "database",
        details: { restoredBy: username, safetyBackup: path.basename(safetyCopy) },
      });

      return {
        ok: true,
        message:
          "Copia restaurada. Recargue la página; puede que deba iniciar sesión de nuevo.",
        safetyBackup: path.basename(safetyCopy),
      };
    } finally {
      await fs.rm(incoming, { force: true });
      restoreInProgress = false;
    }
  });
}
