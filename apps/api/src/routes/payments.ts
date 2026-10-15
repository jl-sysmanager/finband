import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { PAYMENT_METHODS, positiveAmountSchema, studentPaymentSchema } from "@finband/shared";
import { instantRangeFilter, parseCalendarDate, yearMonthRangeFilter } from "../lib/dates.js";
import { feeStatus } from "../lib/fee-status.js";
import { recordAudit } from "../lib/audit.js";
import { withLock } from "../lib/locks.js";
import { formatMoneyEs } from "../lib/money-format.js";
import { fromCents, sumCents } from "../lib/money.js";
import { buildFeeReminder } from "../lib/reminders.js";
import { prisma } from "../lib/prisma.js";
import { feeLockKey } from "../lib/tariffs.js";
import { teacherPayoutRoutes } from "./teacher-payouts.js";

/** Error de negocio que la ruta convierte en una respuesta 4xx. */
class PaymentRejected extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
  }
}

function overpaymentMessage(pendingCents: number) {
  return `El cobro supera el importe pendiente (${formatMoneyEs(Math.max(0, pendingCents))})`;
}

/** Recalcula lo cobrado de una cuota a partir de sus cobros (fuente de verdad). */
async function syncFeePaid(tx: Prisma.TransactionClient, feeId: string) {
  const fee = await tx.studentFee.findUniqueOrThrow({
    where: { id: feeId },
    include: { payments: { select: { amount: true } } },
  });
  const amountPaid = sumCents(fee.payments.map((p) => p.amount));
  await tx.studentFee.update({
    where: { id: feeId },
    data: { amountPaid, status: feeStatus(fee.totalAmount, amountPaid) },
  });
}

/**
 * Ejecuta un cambio sobre los cobros de una cuota de forma serializada y atómica:
 * nadie más puede cobrar esa cuota mientras tanto y, si algo falla, no queda un
 * cobro sin su cuota actualizada.
 */
async function withFee<T>(
  fee: { id: string; studentId: string; yearMonth: string },
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return withLock(feeLockKey(fee.studentId, fee.yearMonth), () =>
    prisma.$transaction(async (tx) => {
      const result = await fn(tx);
      await syncFeePaid(tx, fee.id);
      return result;
    }),
  );
}

async function pendingOnFee(
  tx: Prisma.TransactionClient,
  feeId: string,
  excludePaymentId?: string,
) {
  const fee = await tx.studentFee.findUniqueOrThrow({
    where: { id: feeId },
    include: { payments: { select: { id: true, amount: true } } },
  });
  const paid = sumCents(
    fee.payments.filter((p) => p.id !== excludePaymentId).map((p) => p.amount),
  );
  return fee.totalAmount - paid;
}

const studentPaymentPatchSchema = z.object({
  amount: positiveAmountSchema.optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  paidAt: z.string().optional(),
  notes: z.string().optional().nullable(),
});

export async function paymentRoutes(app: FastifyInstance) {
  await app.register(teacherPayoutRoutes);

  app.get("/student-fees", async (request) => {
    const q = request.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = {};
    const monthRange = yearMonthRangeFilter(q.monthFrom, q.monthTo);
    if (monthRange) where.yearMonth = monthRange;
    else if (q.yearMonth) where.yearMonth = q.yearMonth;
    if (q.status) where.status = q.status;
    if (q.search) {
      where.student = {
        OR: [
          { firstName: { contains: q.search } },
          { lastName: { contains: q.search } },
        ],
      };
    }
    const paymentDateFilter = instantRangeFilter(q.paidFrom, q.paidTo);
    const paymentsInclude = paymentDateFilter
      ? { where: { paidAt: paymentDateFilter }, orderBy: { paidAt: "desc" as const } }
      : { orderBy: { paidAt: "desc" as const } };
    return prisma.studentFee.findMany({
      where,
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
        payments: paymentsInclude,
      },
      orderBy: [{ yearMonth: "desc" }, { student: { lastName: "asc" } }],
    });
  });

  app.post("/student-payments", async (request, reply) => {
    const parsed = studentPaymentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }
    const d = parsed.data;
    const fee = await prisma.studentFee.findUnique({ where: { id: d.feeId } });
    if (!fee) return reply.status(404).send({ error: "Cuota no encontrada" });

    try {
      const payment = await withFee(fee, async (tx) => {
        const pending = await pendingOnFee(tx, fee.id);
        if (d.amount > pending) {
          throw new PaymentRejected(overpaymentMessage(pending));
        }
        return tx.studentPayment.create({
          data: {
            feeId: fee.id,
            amount: d.amount,
            method: d.method,
            paidAt: d.paidAt ? parseCalendarDate(d.paidAt) : new Date(),
            notes: d.notes,
          },
        });
      });
      await recordAudit(request, {
        action: "CREATE",
        entityType: "student_payment",
        entityId: payment.id,
        details: { feeId: fee.id, amount: fromCents(payment.amount), method: payment.method },
      });
      return payment;
    } catch (e) {
      if (e instanceof PaymentRejected) return reply.status(e.statusCode).send({ error: e.message });
      throw e;
    }
  });

  app.patch("/student-payments/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = studentPaymentPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }
    const existing = await prisma.studentPayment.findUnique({
      where: { id },
      include: { fee: { select: { id: true, studentId: true, yearMonth: true } } },
    });
    if (!existing) return reply.status(404).send({ error: "Cobro no encontrado" });
    const d = parsed.data;

    try {
      const payment = await withFee(existing.fee, async (tx) => {
        if (d.amount !== undefined) {
          const pending = await pendingOnFee(tx, existing.feeId, id);
          if (d.amount > pending) {
            throw new PaymentRejected(overpaymentMessage(pending));
          }
        }
        return tx.studentPayment.update({
          where: { id },
          data: {
            ...d,
            paidAt: d.paidAt ? parseCalendarDate(d.paidAt) : undefined,
          },
        });
      });
      await recordAudit(request, {
        action: "UPDATE",
        entityType: "student_payment",
        entityId: id,
        details: {
          feeId: existing.feeId,
          ...(d.amount !== undefined && d.amount !== existing.amount
            ? { amount: `${fromCents(existing.amount)} → ${fromCents(payment.amount)}` }
            : {}),
          ...(d.method && d.method !== existing.method ? { method: `${existing.method} → ${d.method}` } : {}),
        },
      });
      return payment;
    } catch (e) {
      if (e instanceof PaymentRejected) return reply.status(e.statusCode).send({ error: e.message });
      throw e;
    }
  });

  app.get("/student-fees/:id/reminder", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await buildFeeReminder(id);
    } catch {
      return reply.status(404).send({ error: "Cuota no encontrada" });
    }
  });

  app.post("/student-fees/:id/reminder", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { channel?: string };
    try {
      const payload = await buildFeeReminder(id);
      await recordAudit(request, {
        action: "REMINDER",
        entityType: "student_fee",
        entityId: id,
        details: { channel: body.channel ?? "manual", studentId: payload.studentId },
      });
      return payload;
    } catch {
      return reply.status(404).send({ error: "Cuota no encontrada" });
    }
  });

  app.delete("/student-fees/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const fee = await prisma.studentFee.findUnique({
      where: { id },
      include: { payments: true },
    });
    if (!fee) return reply.status(404).send({ error: "Cuota no encontrada" });
    await withLock(feeLockKey(fee.studentId, fee.yearMonth), () =>
      prisma.studentFee.delete({ where: { id } }),
    );
    await recordAudit(request, {
      action: "DELETE",
      entityType: "student_fee",
      entityId: id,
      details: { yearMonth: fee.yearMonth, studentId: fee.studentId },
    });
    return { ok: true, removedPayments: fee.payments.length };
  });

  app.delete("/student-payments/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.studentPayment.findUnique({
      where: { id },
      include: { fee: { select: { id: true, studentId: true, yearMonth: true } } },
    });
    if (!existing) return reply.status(404).send({ error: "Cobro no encontrado" });
    await withFee(existing.fee, (tx) => tx.studentPayment.delete({ where: { id } }));
    await recordAudit(request, {
      action: "DELETE",
      entityType: "student_payment",
      entityId: id,
      details: { feeId: existing.feeId, amount: fromCents(existing.amount) },
    });
    return { ok: true };
  });
}
