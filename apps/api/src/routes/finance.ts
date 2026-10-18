import type { FastifyInstance } from "fastify";
import { expenseEntrySchema, incomeEntrySchema } from "@finband/shared";
import { recordAudit } from "../lib/audit.js";
import { prisma } from "../lib/prisma.js";
import { paymentMethodError } from "../lib/payment-methods.js";
import { calendarRangeFilter, parseCalendarDate } from "../lib/dates.js";

const MANAGED_MESSAGE: Record<"income" | "expense", string> = {
  income:
    "Esta categoría la gestiona la app: los cobros de cuotas se registran en Pagos y ya cuentan en el balance.",
  expense:
    "Esta categoría la gestiona la app: los pagos a profesores se registran en sus liquidaciones y ya cuentan en el balance.",
};

/** Error si la categoría no admite apuntes manuales (se duplicarían en el balance). */
async function managedCategoryError(kind: "income" | "expense", categoryId: string | undefined) {
  if (!categoryId) return null;
  const category =
    kind === "income"
      ? await prisma.incomeCategory.findUnique({ where: { id: categoryId } })
      : await prisma.expenseCategory.findUnique({ where: { id: categoryId } });
  return category?.managedByApp ? MANAGED_MESSAGE[kind] : null;
}

export async function financeRoutes(app: FastifyInstance) {
  app.get("/incomes", async (request) => {
    const q = request.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = {};
    if (q.categoryId) where.categoryId = q.categoryId;
    const dateRange = calendarRangeFilter(q.from, q.to);
    if (dateRange) where.date = dateRange;
    return prisma.incomeEntry.findMany({
      where,
      include: { category: true, paymentMethod: { select: { label: true } } },
      orderBy: { date: "desc" },
    });
  });

  app.post("/incomes", async (request, reply) => {
    const parsed = incomeEntrySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }
    const d = parsed.data;
    const managed = await managedCategoryError("income", d.categoryId);
    if (managed) return reply.status(400).send({ error: managed });
    const methodError = await paymentMethodError(d.method);
    if (methodError) return reply.status(400).send({ error: methodError });
    const saved = await prisma.incomeEntry.create({
      data: {
        date: parseCalendarDate(d.date),
        concept: d.concept,
        categoryId: d.categoryId,
        amount: d.amount,
        method: d.method ?? null,
        notes: d.notes,
      },
    });
    await recordAudit(request, {
      action: "CREATE",
      entityType: "income",
      entityId: saved.id,
      details: null,
    });
    return saved;
  });

  app.patch("/incomes/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = incomeEntrySchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }
    const d = parsed.data;
    // Los apuntes antiguos de una categoría gestionada se pueden corregir o mover a
    // otra categoría, pero no se puede llevar un apunte nuevo a una gestionada.
    const current = await prisma.incomeEntry.findUnique({
      where: { id },
      select: { categoryId: true, method: true },
    });
    if (!current) return reply.status(404).send({ error: "Apunte no encontrado" });
    const methodError = await paymentMethodError(d.method, current.method);
    if (methodError) return reply.status(400).send({ error: methodError });
    if (d.categoryId !== current.categoryId) {
      const managed = await managedCategoryError("income", d.categoryId);
      if (managed) return reply.status(400).send({ error: managed });
    }
    const saved = await prisma.incomeEntry.update({
      where: { id },
      data: {
        ...d,
        date: d.date ? parseCalendarDate(d.date) : undefined,
      },
    });
    await recordAudit(request, {
      action: "UPDATE",
      entityType: "income",
      entityId: saved.id,
      details: { fields: Object.keys((request.body ?? {}) as object) },
    });
    return saved;
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
    const dateRange = calendarRangeFilter(q.from, q.to);
    if (dateRange) where.date = dateRange;
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
    const managed = await managedCategoryError("expense", d.categoryId);
    if (managed) return reply.status(400).send({ error: managed });
    const saved = await prisma.expenseEntry.create({
      data: {
        date: parseCalendarDate(d.date),
        concept: d.concept,
        categoryId: d.categoryId,
        amount: d.amount,
        notes: d.notes,
      },
    });
    await recordAudit(request, {
      action: "CREATE",
      entityType: "expense",
      entityId: saved.id,
      details: null,
    });
    return saved;
  });

  app.patch("/expenses/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = expenseEntrySchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }
    const d = parsed.data;
    // Los apuntes antiguos de una categoría gestionada se pueden corregir o mover a
    // otra categoría, pero no se puede llevar un apunte nuevo a una gestionada.
    const current = await prisma.expenseEntry.findUnique({ where: { id }, select: { categoryId: true } });
    if (!current) return reply.status(404).send({ error: "Apunte no encontrado" });
    if (d.categoryId !== current.categoryId) {
      const managed = await managedCategoryError("expense", d.categoryId);
      if (managed) return reply.status(400).send({ error: managed });
    }
    const saved = await prisma.expenseEntry.update({
      where: { id },
      data: {
        ...d,
        date: d.date ? parseCalendarDate(d.date) : undefined,
      },
    });
    await recordAudit(request, {
      action: "UPDATE",
      entityType: "expense",
      entityId: saved.id,
      details: { fields: Object.keys((request.body ?? {}) as object) },
    });
    return saved;
  });

  app.delete("/expenses/:id", async (request) => {
    const { id } = request.params as { id: string };
    await prisma.expenseEntry.delete({ where: { id } });
    await recordAudit(request, { action: "DELETE", entityType: "expense", entityId: id });
    return { ok: true };
  });
}
