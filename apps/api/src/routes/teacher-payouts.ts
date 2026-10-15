import type { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { teacherPayoutPaymentSchema } from "@finband/shared";
import { recordAudit } from "../lib/audit.js";
import { instantRangeFilter, parseCalendarDate, yearMonthRangeFilter } from "../lib/dates.js";
import { payoutStatus } from "../lib/fee-status.js";
import { withLock } from "../lib/locks.js";
import { formatMoneyEs } from "../lib/money-format.js";
import { roundMoney, subtractMoney, sumMoney, toCents } from "../lib/money.js";
import { prisma } from "../lib/prisma.js";
import { calculateTeacherPayout } from "../lib/teacher-payout.js";

const YEAR_MONTH = /^\d{4}-\d{2}$/;

const payoutLockKey = (teacherId: string, yearMonth: string) => `payout:${teacherId}:${yearMonth}`;

const teacherPayoutPatchSchema = z.object({
  /** Solo se admite 0: anula todos los pagos. Los pagos se registran uno a uno. */
  amountPaid: z.literal(0).optional(),
  notes: z.string().optional().nullable(),
});

class PayoutRejected extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
  }
}

/** Recalcula lo pagado de una liquidación a partir de su historial de pagos. */
async function syncPayoutPaid(tx: Prisma.TransactionClient, payoutId: string) {
  const payout = await tx.teacherPayout.findUniqueOrThrow({
    where: { id: payoutId },
    include: { payments: { select: { amount: true, paidAt: true } } },
  });
  const amountPaid = sumMoney(payout.payments.map((p) => p.amount));
  const lastPaidAt = payout.payments.reduce<Date | null>(
    (latest, p) => (!latest || p.paidAt > latest ? p.paidAt : latest),
    null,
  );
  return tx.teacherPayout.update({
    where: { id: payoutId },
    data: { amountPaid, status: payoutStatus(payout.amount, amountPaid), paidAt: lastPaidAt },
    include: { payments: { orderBy: { paidAt: "desc" } } },
  });
}

/** Cambio serializado y atómico sobre los pagos de una liquidación. */
function withPayout<T>(
  payout: { id: string; teacherId: string; yearMonth: string },
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return withLock(payoutLockKey(payout.teacherId, payout.yearMonth), () =>
    prisma.$transaction(async (tx) => {
      await fn(tx);
      return syncPayoutPaid(tx, payout.id);
    }),
  );
}

type UpsertResult = "generated" | "no_amount" | "has_payments";

/**
 * Crea o recalcula la liquidación del mes. Una liquidación con pagos queda fija:
 * es el importe que se acordó y pagó, aunque después cambie el horario o la tarifa.
 */
async function upsertTeacherPayout(
  teacherId: string,
  yearMonth: string,
): Promise<{ result: UpsertResult; amount: number }> {
  const calc = await calculateTeacherPayout(teacherId, yearMonth);
  if (calc.amount <= 0) return { result: "no_amount", amount: 0 };
  return withLock(payoutLockKey(teacherId, yearMonth), async () => {
    const existing = await prisma.teacherPayout.findUnique({
      where: { teacherId_yearMonth: { teacherId, yearMonth } },
      include: { _count: { select: { payments: true } } },
    });
    if (existing && existing._count.payments > 0) {
      return { result: "has_payments" as const, amount: existing.amount };
    }
    const fields = {
      baseAmount: calc.baseAmount,
      transportAmount: calc.transportAmount,
      workDays: calc.workDays,
      amount: calc.amount,
      amountPaid: 0,
      status: payoutStatus(calc.amount, 0),
    };
    await prisma.teacherPayout.upsert({
      where: { teacherId_yearMonth: { teacherId, yearMonth } },
      create: { teacherId, yearMonth, ...fields },
      update: fields,
    });
    return { result: "generated" as const, amount: calc.amount };
  });
}

export async function teacherPayoutRoutes(app: FastifyInstance) {
  app.get("/teacher-payouts/calculate", async (request, reply) => {
    const q = request.query as { teacherId?: string; yearMonth?: string };
    if (!q.teacherId || !q.yearMonth) {
      return reply.status(400).send({ error: "teacherId y yearMonth requeridos" });
    }
    if (!YEAR_MONTH.test(q.yearMonth)) {
      return reply.status(400).send({ error: "yearMonth inválido (YYYY-MM)" });
    }
    try {
      return await calculateTeacherPayout(q.teacherId, q.yearMonth);
    } catch {
      return reply.status(404).send({ error: "Profesor no encontrado" });
    }
  });

  app.get("/teacher-payouts", async (request) => {
    const q = request.query as Record<string, string | undefined>;
    const where: Prisma.TeacherPayoutWhereInput = {};
    const monthRange = yearMonthRangeFilter(q.monthFrom, q.monthTo);
    if (monthRange) where.yearMonth = monthRange;
    else if (q.yearMonth) where.yearMonth = q.yearMonth;
    if (q.status === "PENDING" || q.status === "PARTIAL" || q.status === "PAID") {
      where.status = q.status;
    }
    if (q.search) {
      where.teacher = {
        OR: [{ firstName: { contains: q.search } }, { lastName: { contains: q.search } }],
      };
    }
    const paidRange = instantRangeFilter(q.paidFrom, q.paidTo);
    if (paidRange) where.payments = { some: { paidAt: paidRange } };
    return prisma.teacherPayout.findMany({
      where,
      include: { teacher: true, payments: { orderBy: { paidAt: "desc" } } },
      orderBy: [{ yearMonth: "desc" }, { teacher: { lastName: "asc" } }],
    });
  });

  app.post("/teacher-payouts/generate", async (request, reply) => {
    const { yearMonth, teacherId } = request.body as { yearMonth?: string; teacherId?: string };
    if (!yearMonth || !YEAR_MONTH.test(yearMonth)) {
      return reply.status(400).send({ error: "yearMonth inválido (YYYY-MM)" });
    }
    if (teacherId) {
      const teacher = await prisma.teacher.findFirst({ where: { id: teacherId, deletedAt: null } });
      if (!teacher) return reply.status(404).send({ error: "Profesor no encontrado" });
      const { result, amount } = await upsertTeacherPayout(teacherId, yearMonth);
      if (result === "has_payments") {
        return reply.status(409).send({
          error: "La liquidación de ese mes ya tiene pagos; anúlelos antes de recalcularla",
        });
      }
      return { generated: result === "generated" ? 1 : 0, yearMonth, amount };
    }
    const teachers = await prisma.teacher.findMany({ where: { deletedAt: null } });
    let generated = 0;
    let skippedWithPayments = 0;
    for (const t of teachers) {
      const { result } = await upsertTeacherPayout(t.id, yearMonth);
      if (result === "generated") generated++;
      if (result === "has_payments") skippedWithPayments++;
    }
    return { generated, skippedWithPayments, yearMonth };
  });

  app.post("/teacher-payouts/pay", async (request, reply) => {
    const parsed = teacherPayoutPaymentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }
    const d = parsed.data;
    const found = await prisma.teacherPayout.findUnique({ where: { id: d.payoutId } });
    if (!found) return reply.status(404).send({ error: "Liquidación no encontrada" });

    try {
      let paymentId = "";
      const payout = await withPayout(found, async (tx) => {
        const current = await tx.teacherPayout.findUniqueOrThrow({ where: { id: found.id } });
        const pending = subtractMoney(current.amount, current.amountPaid);
        if (toCents(d.amount) > toCents(pending)) {
          throw new PayoutRejected(
            `El pago supera el importe pendiente (${formatMoneyEs(Math.max(0, pending))})`,
          );
        }
        const payment = await tx.teacherPayoutPayment.create({
          data: {
            payoutId: found.id,
            amount: roundMoney(d.amount),
            paidAt: d.paidAt ? parseCalendarDate(d.paidAt) : new Date(),
            notes: d.notes,
          },
        });
        paymentId = payment.id;
      });
      await recordAudit(request, {
        action: "PAY",
        entityType: "teacher_payout",
        entityId: payout.id,
        details: { paymentId, amount: roundMoney(d.amount), amountPaid: payout.amountPaid },
      });
      return payout;
    } catch (e) {
      if (e instanceof PayoutRejected) return reply.status(e.statusCode).send({ error: e.message });
      throw e;
    }
  });

  app.delete("/teacher-payout-payments/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const payment = await prisma.teacherPayoutPayment.findUnique({
      where: { id },
      include: { payout: { select: { id: true, teacherId: true, yearMonth: true } } },
    });
    if (!payment) return reply.status(404).send({ error: "Pago no encontrado" });
    const payout = await withPayout(payment.payout, (tx) =>
      tx.teacherPayoutPayment.delete({ where: { id } }),
    );
    await recordAudit(request, {
      action: "DELETE",
      entityType: "teacher_payout_payment",
      entityId: id,
      details: { payoutId: payout.id, amount: payment.amount },
    });
    return payout;
  });

  app.patch("/teacher-payouts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = teacherPayoutPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Datos inválidos: los pagos se registran o anulan uno a uno",
        details: parsed.error.flatten(),
      });
    }
    const body = parsed.data;
    const found = await prisma.teacherPayout.findUnique({ where: { id } });
    if (!found) return reply.status(404).send({ error: "Liquidación no encontrada" });

    const payout = await withPayout(found, async (tx) => {
      if (body.amountPaid === 0) {
        await tx.teacherPayoutPayment.deleteMany({ where: { payoutId: id } });
      }
      if (body.notes !== undefined) {
        await tx.teacherPayout.update({ where: { id }, data: { notes: body.notes } });
      }
    });
    if (body.amountPaid === 0 && found.amountPaid > 0) {
      await recordAudit(request, {
        action: "VOID_PAYMENTS",
        entityType: "teacher_payout",
        entityId: id,
        details: { amountPaid: `${found.amountPaid} → 0` },
      });
    }
    return payout;
  });

  app.delete("/teacher-payouts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const payout = await prisma.teacherPayout.findUnique({ where: { id } });
    if (!payout) return reply.status(404).send({ error: "Liquidación no encontrada" });
    await withLock(payoutLockKey(payout.teacherId, payout.yearMonth), () =>
      prisma.teacherPayout.delete({ where: { id } }),
    );
    await recordAudit(request, {
      action: "DELETE",
      entityType: "teacher_payout",
      entityId: id,
      details: { yearMonth: payout.yearMonth, teacherId: payout.teacherId, amountPaid: payout.amountPaid },
    });
    return { ok: true };
  });
}
