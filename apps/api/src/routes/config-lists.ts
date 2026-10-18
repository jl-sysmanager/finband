import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { categorySchema, paymentMethodSchema, reorderSchema } from "@finband/shared";
import { recordAudit } from "../lib/audit.js";
import { prisma } from "../lib/prisma.js";

/*
 * Listas configurables desde Configuración: categorías de ingresos y de gastos y
 * métodos de pago. Se pueden añadir, renombrar y reordenar. Lo que ya tiene
 * registros no se borra (se perdería su clasificación): las categorías se
 * conservan y los métodos de pago se desactivan para dejar de ofrecerse.
 */

type CategoryKind = "income" | "expense";

const CATEGORY = {
  income: {
    label: "categoría de ingresos",
    entity: "income_category",
    countEntries: (id: string) => prisma.incomeEntry.count({ where: { categoryId: id } }),
  },
  expense: {
    label: "categoría de gastos",
    entity: "expense_category",
    countEntries: (id: string) => prisma.expenseEntry.count({ where: { categoryId: id } }),
  },
} as const;

function invalid(reply: FastifyReply, details: unknown) {
  return reply.status(400).send({ error: "Datos inválidos", details });
}

async function nextSortOrder(rows: Array<{ sortOrder: number }>) {
  return rows.reduce((max, r) => Math.max(max, r.sortOrder), -1) + 1;
}

function registerCategoryRoutes(app: FastifyInstance, kind: CategoryKind) {
  const cfg = CATEGORY[kind];
  const base = `/${kind}-categories`;

  app.get(base, async () => {
    const rows =
      kind === "income"
        ? await prisma.incomeCategory.findMany({
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            include: { _count: { select: { entries: true } } },
          })
        : await prisma.expenseCategory.findMany({
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            include: { _count: { select: { entries: true } } },
          });
    return rows.map(({ _count, ...c }) => ({ ...c, entries: _count.entries }));
  });

  app.post(base, async (request, reply) => {
    const parsed = categorySchema.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    const existing =
      kind === "income"
        ? await prisma.incomeCategory.findMany({ select: { sortOrder: true } })
        : await prisma.expenseCategory.findMany({ select: { sortOrder: true } });
    const data = { name: parsed.data.name, sortOrder: parsed.data.sortOrder ?? (await nextSortOrder(existing)) };
    const created =
      kind === "income"
        ? await prisma.incomeCategory.create({ data })
        : await prisma.expenseCategory.create({ data });
    await recordAudit(request, { action: "CREATE", entityType: cfg.entity, entityId: created.id, details: { name: created.name } });
    return created;
  });

  app.patch(`${base}/:id`, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = categorySchema.partial().safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    const updated =
      kind === "income"
        ? await prisma.incomeCategory.update({ where: { id }, data: parsed.data })
        : await prisma.expenseCategory.update({ where: { id }, data: parsed.data });
    await recordAudit(request, {
      action: "UPDATE",
      entityType: cfg.entity,
      entityId: id,
      details: { fields: Object.keys(parsed.data), name: updated.name },
    });
    return updated;
  });

  app.put(`${base}/order`, async (request, reply) => {
    const parsed = reorderSchema.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    await prisma.$transaction(
      parsed.data.ids.map((id, sortOrder) =>
        kind === "income"
          ? prisma.incomeCategory.update({ where: { id }, data: { sortOrder } })
          : prisma.expenseCategory.update({ where: { id }, data: { sortOrder } }),
      ),
    );
    return { ok: true };
  });

  app.delete(`${base}/:id`, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const category =
      kind === "income"
        ? await prisma.incomeCategory.findUnique({ where: { id } })
        : await prisma.expenseCategory.findUnique({ where: { id } });
    if (!category) return reply.status(404).send({ error: "Categoría no encontrada" });
    if (category.managedByApp) {
      return reply.status(409).send({
        error: "Esta categoría la gestiona la app (cobros de cuotas o pagos a profesores) y no se puede borrar; sí se puede renombrar.",
      });
    }
    const entries = await cfg.countEntries(id);
    if (entries > 0) {
      return reply.status(409).send({
        error: `No se puede borrar: tiene ${entries} apunte(s). Cámbielos de categoría antes o renómbrela.`,
      });
    }
    if (kind === "income") await prisma.incomeCategory.delete({ where: { id } });
    else await prisma.expenseCategory.delete({ where: { id } });
    await recordAudit(request, { action: "DELETE", entityType: cfg.entity, entityId: id, details: { name: category.name } });
    return { ok: true };
  });
}

export async function configListRoutes(app: FastifyInstance) {
  registerCategoryRoutes(app, "income");
  registerCategoryRoutes(app, "expense");

  // -------------------------------------------------------------------------
  // Métodos de pago
  // -------------------------------------------------------------------------

  app.get("/payment-methods", async () => {
    const rows = await prisma.paymentMethod.findMany({
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      include: { _count: { select: { studentPayments: true, incomeEntries: true } } },
    });
    return rows.map(({ _count, ...m }) => ({
      ...m,
      uses: _count.studentPayments + _count.incomeEntries,
    }));
  });

  app.post("/payment-methods", async (request, reply) => {
    const parsed = paymentMethodSchema.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    const existing = await prisma.paymentMethod.findMany({ select: { sortOrder: true } });
    const created = await prisma.paymentMethod.create({
      data: {
        label: parsed.data.label,
        active: parsed.data.active ?? true,
        sortOrder: parsed.data.sortOrder ?? (await nextSortOrder(existing)),
      },
    });
    await recordAudit(request, {
      action: "CREATE",
      entityType: "payment_method",
      entityId: created.id,
      details: { label: created.label },
    });
    return created;
  });

  app.patch("/payment-methods/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = paymentMethodSchema.partial().safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    if (parsed.data.active === false) {
      const others = await prisma.paymentMethod.count({ where: { active: true, NOT: { id } } });
      if (others === 0) {
        return reply.status(409).send({ error: "Debe quedar al menos un método de pago activo." });
      }
    }
    const updated = await prisma.paymentMethod.update({ where: { id }, data: parsed.data });
    await recordAudit(request, {
      action: "UPDATE",
      entityType: "payment_method",
      entityId: id,
      details: { ...parsed.data },
    });
    return updated;
  });

  app.put("/payment-methods/order", async (request, reply) => {
    const parsed = reorderSchema.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    await prisma.$transaction(
      parsed.data.ids.map((id, sortOrder) =>
        prisma.paymentMethod.update({ where: { id }, data: { sortOrder } }),
      ),
    );
    return { ok: true };
  });

  app.delete("/payment-methods/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const method = await prisma.paymentMethod.findUnique({
      where: { id },
      include: { _count: { select: { studentPayments: true, incomeEntries: true } } },
    });
    if (!method) return reply.status(404).send({ error: "Método de pago no encontrado" });
    const uses = method._count.studentPayments + method._count.incomeEntries;
    if (uses > 0) {
      return reply.status(409).send({
        error: `No se puede borrar: lo usan ${uses} cobro(s) o ingreso(s). Desactívelo para que deje de ofrecerse.`,
      });
    }
    const others = await prisma.paymentMethod.count({ where: { active: true, NOT: { id } } });
    if (method.active && others === 0) {
      return reply.status(409).send({ error: "Debe quedar al menos un método de pago activo." });
    }
    await prisma.paymentMethod.delete({ where: { id } });
    await recordAudit(request, {
      action: "DELETE",
      entityType: "payment_method",
      entityId: id,
      details: { label: method.label },
    });
    return { ok: true };
  });
}
