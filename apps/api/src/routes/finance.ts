import type { FastifyInstance } from "fastify";
import { expenseEntrySchema, incomeEntrySchema } from "@finband/shared";
import { recordAudit } from "../lib/audit.js";
import { prisma } from "../lib/prisma.js";

export async function financeRoutes(app: FastifyInstance) {
  app.get("/incomes", async (request) => {
    const q = request.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = {};
    if (q.categoryId) where.categoryId = q.categoryId;
    if (q.from || q.to) {
      where.date = {};
      if (q.from) (where.date as Record<string, Date>).gte = new Date(q.from);
      if (q.to) (where.date as Record<string, Date>).lte = new Date(q.to);
    }
    return prisma.incomeEntry.findMany({
      where,
      include: { category: true },
      orderBy: { date: "desc" },
    });
  });

  app.post("/incomes", async (request, reply) => {
    const parsed = incomeEntrySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }
    const d = parsed.data;
    return prisma.incomeEntry.create({
      data: {
        date: new Date(d.date),
        concept: d.concept,
        categoryId: d.categoryId,
        amount: d.amount,
        method: d.method ?? null,
        notes: d.notes,
      },
    });
  });

  app.patch("/incomes/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = incomeEntrySchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }
    const d = parsed.data;
    return prisma.incomeEntry.update({
      where: { id },
      data: {
        ...d,
        date: d.date ? new Date(d.date) : undefined,
      },
    });
  });

  app.delete("/incomes/:id", async (request) => {
    const { id } = request.params as { id: string };
    await prisma.incomeEntry.delete({ where: { id } });
    await recordAudit(request, { action: "DELETE", entityType: "income", entityId: id });
    return { ok: true };
  });

  app.get("/expenses", async (request) => {
    const q = request.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = {};
    if (q.categoryId) where.categoryId = q.categoryId;
    if (q.from || q.to) {
      where.date = {};
      if (q.from) (where.date as Record<string, Date>).gte = new Date(q.from);
      if (q.to) (where.date as Record<string, Date>).lte = new Date(q.to);
    }
    return prisma.expenseEntry.findMany({
      where,
      include: { category: true },
      orderBy: { date: "desc" },
    });
  });

  app.post("/expenses", async (request, reply) => {
    const parsed = expenseEntrySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }
    const d = parsed.data;
    return prisma.expenseEntry.create({
      data: {
        date: new Date(d.date),
        concept: d.concept,
        categoryId: d.categoryId,
        amount: d.amount,
        notes: d.notes,
      },
    });
  });

  app.patch("/expenses/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = expenseEntrySchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }
    const d = parsed.data;
    return prisma.expenseEntry.update({
      where: { id },
      data: {
        ...d,
        date: d.date ? new Date(d.date) : undefined,
      },
    });
  });

  app.delete("/expenses/:id", async (request) => {
    const { id } = request.params as { id: string };
    await prisma.expenseEntry.delete({ where: { id } });
    await recordAudit(request, { action: "DELETE", entityType: "expense", entityId: id });
    return { ok: true };
  });
}
