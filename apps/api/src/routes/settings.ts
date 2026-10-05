import type { FastifyInstance } from "fastify";
import { academicYearSchema, categorySchema, schoolSettingsSchema } from "@finband/shared";
import { prisma } from "../lib/prisma.js";

export async function settingsRoutes(app: FastifyInstance) {
  app.get("/school", async () => {
    return prisma.schoolSettings.findUnique({
      where: { id: "default" },
      include: { activeYear: true },
    });
  });

  app.patch("/school", async (request, reply) => {
    const parsed = schoolSettingsSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }
    return prisma.schoolSettings.upsert({
      where: { id: "default" },
      create: { id: "default", name: parsed.data.name ?? "Escuela", ...parsed.data },
      update: parsed.data,
    });
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
