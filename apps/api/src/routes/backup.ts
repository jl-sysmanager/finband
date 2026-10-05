import multipart from "@fastify/multipart";
import type { FastifyInstance } from "fastify";
import fs from "node:fs/promises";
import path from "node:path";
import {
  assertSqliteBuffer,
  assertSqliteFile,
  resolveSqlitePath,
} from "../lib/database-path.js";
import { prisma } from "../lib/prisma.js";

const MAX_BACKUP_BYTES = 80 * 1024 * 1024;

function backupFilename() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `finband-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.sqlite`;
}

export async function backupRoutes(app: FastifyInstance) {
  await app.register(multipart, {
    limits: { fileSize: MAX_BACKUP_BYTES, files: 1 },
  });

  app.get("/database", async (_request, reply) => {
    const dbPath = resolveSqlitePath();
    await assertSqliteFile(dbPath);
    const data = await fs.readFile(dbPath);
    return reply
      .header("Content-Type", "application/octet-stream")
      .header("Content-Disposition", `attachment; filename="${backupFilename()}"`)
      .send(data);
  });

  app.post("/restore", async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: "Archivo requerido (.sqlite)" });
    }

    const chunks: Buffer[] = [];
    for await (const chunk of data.file) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    if (buffer.length === 0) {
      return reply.status(400).send({ error: "Archivo vacío" });
    }
    if (buffer.length > MAX_BACKUP_BYTES) {
      return reply.status(400).send({ error: "Archivo demasiado grande" });
    }

    try {
      await assertSqliteBuffer(buffer);
    } catch (e) {
      return reply.status(400).send({
        error: e instanceof Error ? e.message : "Archivo inválido",
      });
    }

    const dbPath = resolveSqlitePath();
    await fs.mkdir(path.dirname(dbPath), { recursive: true });

    const safetyCopy = `${dbPath}.pre-restore-${Date.now()}.bak`;
    try {
      await fs.copyFile(dbPath, safetyCopy);
    } catch {
      /* primera restauración sin DB previa */
    }

    await prisma.$disconnect();

    try {
      await fs.writeFile(dbPath, buffer);
      await assertSqliteFile(dbPath);
      await prisma.$connect();
      await prisma.$queryRaw`PRAGMA quick_check`;
    } catch (e) {
      try {
        await fs.copyFile(safetyCopy, dbPath);
      } catch {
        /* ignore */
      }
      await prisma.$connect();
      return reply.status(400).send({
        error: "No se pudo restaurar la copia. Se mantuvo la base anterior.",
        details: e instanceof Error ? e.message : undefined,
      });
    }

    return {
      ok: true,
      message: "Copia restaurada. Recargue la página para ver los datos actualizados.",
      safetyBackup: path.basename(safetyCopy),
    };
  });
}
