import multipart from "@fastify/multipart";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { academicYearSchema, categorySchema, schoolSettingsSchema } from "@finband/shared";
import { prisma } from "../lib/prisma.js";
import {
  logoMimeFromFilename,
  readLogoBuffer,
  removeLogoFiles,
  saveSchoolLogoFile,
  MAX_LOGO_BYTES,
} from "../lib/school-logo.js";

function publicBranding(s: {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  logoPath: string | null;
  updatedAt: Date;
}) {
  return {
    name: s.name,
    address: s.address,
    phone: s.phone,
    email: s.email,
    hasLogo: !!s.logoPath,
    updatedAt: s.updatedAt.toISOString(),
  };
}

function schoolPayload(s: Awaited<ReturnType<typeof loadSchool>>) {
  if (!s) return null;
  const { logoBase64: _drop, ...rest } = s;
  return {
    ...rest,
    hasLogo: !!s.logoPath,
    logoBase64: undefined,
  };
}

async function loadSchool() {
  return prisma.schoolSettings.findUnique({
    where: { id: "default" },
    include: { activeYear: true },
  });
}

async function sendLogo(reply: FastifyReply, logoPath: string | null | undefined) {
  const buf = await readLogoBuffer(logoPath);
  if (!buf || !logoPath) {
    return reply.status(404).send({ error: "Sin logotipo" });
  }
  return reply
    .header("Content-Type", logoMimeFromFilename(logoPath))
    .header("Cache-Control", "public, max-age=300")
    .send(buf);
}

/** Rutas públicas (login y PDF vía servidor). */
export async function publicSettingsRoutes(app: FastifyInstance) {
  app.get("/school/branding", async (_request, reply) => {
    const s = await loadSchool();
    if (!s) {
      return reply.send({
        name: "Escuela de Música",
        hasLogo: false,
        updatedAt: new Date(0).toISOString(),
      });
    }
    return publicBranding(s);
  });

  app.get("/school/logo", async (_request, reply) => {
    const s = await loadSchool();
    return sendLogo(reply, s?.logoPath);
  });
}

export async function settingsRoutes(app: FastifyInstance) {
  await app.register(multipart, {
    limits: { fileSize: MAX_LOGO_BYTES, files: 1 },
  });

  app.get("/school", async () => {
    const s = await loadSchool();
    return schoolPayload(s);
  });

  app.patch("/school", async (request, reply) => {
    const parsed = schoolSettingsSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }
    const data = { ...parsed.data };
    delete data.logoBase64;
    await prisma.schoolSettings.upsert({
      where: { id: "default" },
      create: { id: "default", name: data.name ?? "Escuela", ...data },
      update: data,
    });
    return schoolPayload(await loadSchool());
  });

  app.post("/school/logo", async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user.role !== "ADMIN") {
      return reply.status(403).send({ error: "Solo administradores" });
    }
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: "Archivo de imagen requerido" });
    }
    const mime = data.mimetype;
    const chunks: Buffer[] = [];
    for await (const chunk of data.file) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    try {
      const saved = await saveSchoolLogoFile(buffer, mime);
      await prisma.schoolSettings.upsert({
        where: { id: "default" },
        create: {
          id: "default",
          name: "Escuela de Música",
          logoPath: saved.relativePath,
          logoBase64: null,
        },
        update: { logoPath: saved.relativePath, logoBase64: null },
      });
      return { ok: true, hasLogo: true };
    } catch (e) {
      return reply.status(400).send({
        error: e instanceof Error ? e.message : "No se pudo guardar el logotipo",
      });
    }
  });

  app.delete("/school/logo", async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user.role !== "ADMIN") {
      return reply.status(403).send({ error: "Solo administradores" });
    }
    await removeLogoFiles();
    await prisma.schoolSettings.updateMany({
      data: { logoPath: null, logoBase64: null },
    });
    return { ok: true };
  });

  app.get("/academic-years", async () => {
    return prisma.academicYear.findMany({ orderBy: { startDate: "desc" } });
  });

  app.post("/academic-years", async (request, reply) => {
    const parsed = academicYearSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }
    const d = parsed.data;
    if (d.isActive) {
      await prisma.academicYear.updateMany({ data: { isActive: false } });
    }
    return prisma.academicYear.create({
      data: {
        name: d.name,
        startDate: new Date(d.startDate),
        endDate: new Date(d.endDate),
        isActive: d.isActive ?? false,
      },
    });
  });

  app.get("/income-categories", async () => {
    return prisma.incomeCategory.findMany({ orderBy: { sortOrder: "asc" } });
  });

  app.post("/income-categories", async (request, reply) => {
    const parsed = categorySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }
    return prisma.incomeCategory.create({ data: parsed.data });
  });

  app.delete("/income-categories/:id", async (request) => {
    const { id } = request.params as { id: string };
    await prisma.incomeCategory.delete({ where: { id } });
    return { ok: true };
  });

  app.get("/expense-categories", async () => {
    return prisma.expenseCategory.findMany({ orderBy: { sortOrder: "asc" } });
  });

  app.post("/expense-categories", async (request, reply) => {
    const parsed = categorySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }
    return prisma.expenseCategory.create({ data: parsed.data });
  });

  app.delete("/expense-categories/:id", async (request) => {
    const { id } = request.params as { id: string };
    await prisma.expenseCategory.delete({ where: { id } });
    return { ok: true };
  });

  app.get("/payment-methods", async () => {
    return [
      { id: "EFECTIVO", name: "Efectivo" },
      { id: "TRANSFERENCIA", name: "Transferencia" },
      { id: "BIZUM", name: "Bizum" },
      { id: "TARJETA", name: "Tarjeta" },
    ];
  });
}
