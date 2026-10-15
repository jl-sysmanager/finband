import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  nonNegativeAmountSchema,
  PAYMENT_METHODS,
  positiveAmountSchema,
  studentPaymentSchema,
  teacherPayoutPaymentSchema,
} from "@finband/shared";
import { calculateTeacherPayout } from "../lib/teacher-payout.js";
import { feeStatus, payoutStatus } from "../lib/fee-status.js";
import { recordAudit } from "../lib/audit.js";
import { withLock } from "../lib/locks.js";
import { formatMoneyEs } from "../lib/money-format.js";
import { roundMoney, subtractMoney, sumMoney, toCents } from "../lib/money.js";
import { buildFeeReminder } from "../lib/reminders.js";
import { prisma } from "../lib/prisma.js";
import { feeLockKey } from "../lib/tariffs.js";

/** Error de negocio que la ruta convierte en una respuesta 4xx. */
class PaymentRejected extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
  }
}

function overpaymentMessage(pending: number) {
  return `El cobro supera el importe pendiente (${formatMoneyEs(Math.max(0, pending))})`;
}

/** Recalcula lo cobrado de una cuota a partir de sus cobros (fuente de verdad). */
async function syncFeePaid(tx: Prisma.TransactionClient, feeId: string) {
  const fee = await tx.studentFee.findUniqueOrThrow({
    where: { id: feeId },
    include: { payments: { select: { amount: true } } },
  });
  const amountPaid = sumMoney(fee.payments.map((p) => p.amount));
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
  const paid = sumMoney(
    fee.payments.filter((p) => p.id !== excludePaymentId).map((p) => p.amount),
  );
  return subtractMoney(fee.totalAmount, paid);
}

function endOfDay(dateStr: string) {
  const d = new Date(dateStr);
  d.setHours(23, 59, 59, 999);
  return d;
}

function paidAtRange(from?: string, to?: string) {
  if (!from && !to) return undefined;
  const paidAt: Record<string, Date> = {};
  if (from) paidAt.gte = new Date(from);
  if (to) paidAt.lte = endOfDay(to);
  return paidAt;
}

function yearMonthRange(from?: string, to?: string) {
  if (!from && !to) return undefined;
  const yearMonth: Record<string, string> = {};
  if (from) yearMonth.gte = from;
  if (to) yearMonth.lte = to;
  return yearMonth;
}

const studentPaymentPatchSchema = z.object({
  amount: positiveAmountSchema.optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  paidAt: z.string().optional(),
  notes: z.string().optional().nullable(),
});

const teacherPayoutPatchSchema = z.object({
  amountPaid: nonNegativeAmountSchema.optional(),
  notes: z.string().optional().nullable(),
});

export async function paymentRoutes(app: FastifyInstance) {
  app.get("/student-fees", async (request) => {
    const q = request.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = {};
    const monthRange = yearMonthRange(q.monthFrom, q.monthTo);
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
    const paymentDateFilter = paidAtRange(q.paidFrom, q.paidTo);
    const paymentsInclude = paymentDateFilter
      ? { where: { paidAt: paymentDateFilter }, orderBy: { paidAt: "desc" as const } }
      : { orderBy: { paidAt: "desc" as const } };
    return prisma.studentFee.findMany({
      where,
      include: {
        student: true,
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
        if (toCents(d.amount) > toCents(pending)) {
          throw new PaymentRejected(overpaymentMessage(pending));
        }
        return tx.studentPayment.create({
          data: {
            feeId: fee.id,
            amount: roundMoney(d.amount),
            method: d.method,
            paidAt: d.paidAt ? new Date(d.paidAt) : new Date(),
            notes: d.notes,
          },
        });
      });
      await recordAudit(request, {
        action: "CREATE",
        entityType: "student_payment",
        entityId: payment.id,
        details: { feeId: fee.id, amount: payment.amount, method: payment.method },
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
          if (toCents(d.amount) > toCents(pending)) {
            throw new PaymentRejected(overpaymentMessage(pending));
          }
        }
        return tx.studentPayment.update({
          where: { id },
          data: {
            ...d,
            amount: d.amount === undefined ? undefined : roundMoney(d.amount),
            paidAt: d.paidAt ? new Date(d.paidAt) : undefined,
          },
        });
      });
      await recordAudit(request, {
        action: "UPDATE",
        entityType: "student_payment",
        entityId: id,
        details: {
          feeId: existing.feeId,
          ...(d.amount !== undefined && toCents(d.amount) !== toCents(existing.amount)
            ? { amount: `${existing.amount} → ${payment.amount}` }
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

  app.get("/teacher-payouts/calculate", async (request, reply) => {
    const q = request.query as { teacherId?: string; yearMonth?: string };
    if (!q.teacherId || !q.yearMonth) {
      return reply.status(400).send({ error: "teacherId y yearMonth requeridos" });
    }
    if (!/^\d{4}-\d{2}$/.test(q.yearMonth)) {
      return reply.status(400).send({ error: "yearMonth inválido (YYYY-MM)" });
    }
    try {
      return await calculateTeacherPayout(q.teacherId, q.yearMonth);
    } catch {
      return reply.status(404).send({ error: "Profesor no encontrado" });
    }
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
      details: { feeId: existing.feeId, amount: existing.amount },
    });
    return { ok: true };
  });

  app.get("/teacher-payouts", async (request) => {
    const q = request.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = {};
    const monthRange = yearMonthRange(q.monthFrom, q.monthTo);
    if (monthRange) where.yearMonth = monthRange;
    else if (q.yearMonth) where.yearMonth = q.yearMonth;
    if (q.status) where.status = q.status;
    if (q.search) {
      where.teacher = {
        OR: [
          { firstName: { contains: q.search } },
          { lastName: { contains: q.search } },
        ],
      };
    }
    const paidRange = paidAtRange(q.paidFrom, q.paidTo);
    if (paidRange) where.paidAt = paidRange;
    return prisma.teacherPayout.findMany({
      where,
      include: { teacher: true },
      orderBy: [{ yearMonth: "desc" }, { teacher: { lastName: "asc" } }],
    });
  });

  const payoutLockKey = (teacherId: string, yearMonth: string) =>
    `payout:${teacherId}:${yearMonth}`;

  /**
   * Crea o recalcula la liquidación. Lo ya pagado se conserva aunque el nuevo
   * importe sea menor: es dinero que salió de caja y no debe desaparecer.
   */
  async function upsertTeacherPayout(teacherId: string, yearMonth: string) {
    const calc = await calculateTeacherPayout(teacherId, yearMonth);
    if (calc.amount <= 0) return null;
    return withLock(payoutLockKey(teacherId, yearMonth), async () => {
      const existing = await prisma.teacherPayout.findUnique({
        where: { teacherId_yearMonth: { teacherId, yearMonth } },
      });
      const amountPaid = existing?.amountPaid ?? 0;
      const fields = {
        baseAmount: calc.baseAmount,
        transportAmount: calc.transportAmount,
        workDays: calc.workDays,
        amount: calc.amount,
        status: payoutStatus(calc.amount, amountPaid),
      };
      await prisma.teacherPayout.upsert({
        where: { teacherId_yearMonth: { teacherId, yearMonth } },
        create: { teacherId, yearMonth, ...fields, amountPaid: 0 },
        update: fields,
      });
      return calc;
    });
  }

  app.post("/teacher-payouts/generate", async (request, reply) => {
    const { yearMonth, teacherId } = request.body as { yearMonth?: string; teacherId?: string };
    if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
      return reply.status(400).send({ error: "yearMonth inválido (YYYY-MM)" });
    }
    if (teacherId) {
      const teacher = await prisma.teacher.findFirst({
        where: { id: teacherId, deletedAt: null },
      });
      if (!teacher) return reply.status(404).send({ error: "Profesor no encontrado" });
      const calc = await upsertTeacherPayout(teacherId, yearMonth);
      return { generated: calc ? 1 : 0, yearMonth, amount: calc?.amount ?? 0 };
    }
    const teachers = await prisma.teacher.findMany({ where: { deletedAt: null } });
    let count = 0;
    for (const t of teachers) {
      if (await upsertTeacherPayout(t.id, yearMonth)) count++;
    }
    return { generated: count, yearMonth };
  });

  app.post("/teacher-payouts/pay", async (request, reply) => {
    const parsed = teacherPayoutPaymentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }
    const d = parsed.data;
    const found = await prisma.teacherPayout.findUnique({ where: { id: d.payoutId } });
    if (!found) return reply.status(404).send({ error: "Liquidación no encontrada" });

    const result = await withLock(payoutLockKey(found.teacherId, found.yearMonth), async () => {
      const payout = await prisma.teacherPayout.findUniqueOrThrow({ where: { id: found.id } });
      const pending = subtractMoney(payout.amount, payout.amountPaid);
      if (toCents(d.amount) > toCents(pending)) {
        return { error: `El pago supera el importe pendiente (${formatMoneyEs(Math.max(0, pending))})` };
      }
      const newPaid = sumMoney([payout.amountPaid, d.amount]);
      return prisma.teacherPayout.update({
        where: { id: payout.id },
        data: {
          amountPaid: newPaid,
          status: payoutStatus(payout.amount, newPaid),
          paidAt: d.paidAt ? new Date(d.paidAt) : new Date(),
          notes: d.notes ?? payout.notes,
        },
      });
    });
    if ("error" in result) return reply.status(400).send(result);
    await recordAudit(request, {
      action: "PAY",
      entityType: "teacher_payout",
      entityId: result.id,
      details: { amount: roundMoney(d.amount), amountPaid: result.amountPaid },
    });
    return result;
  });

  app.patch("/teacher-payouts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = teacherPayoutPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }
    const body = parsed.data;
    const found = await prisma.teacherPayout.findUnique({ where: { id } });
    if (!found) return reply.status(404).send({ error: "Liquidación no encontrada" });

    const result = await withLock(payoutLockKey(found.teacherId, found.yearMonth), async () => {
      const payout = await prisma.teacherPayout.findUniqueOrThrow({ where: { id } });
      const amountPaid = roundMoney(body.amountPaid ?? payout.amountPaid);
      if (body.amountPaid !== undefined && toCents(amountPaid) > toCents(payout.amount)) {
        return null;
      }
      const updated = await prisma.teacherPayout.update({
        where: { id },
        data: {
          amountPaid,
          status: payoutStatus(payout.amount, amountPaid),
          paidAt: amountPaid <= 0 ? null : payout.paidAt,
          notes: body.notes === undefined ? undefined : body.notes,
        },
      });
      return { updated, previousPaid: payout.amountPaid };
    });
    if (!result) return reply.status(400).send({ error: "Importe pagado inválido" });
    if (toCents(result.previousPaid) !== toCents(result.updated.amountPaid)) {
      await recordAudit(request, {
        action: "UPDATE",
        entityType: "teacher_payout",
        entityId: id,
        details: { amountPaid: `${result.previousPaid} → ${result.updated.amountPaid}` },
      });
    }
    return result.updated;
  });

  app.delete("/teacher-payouts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const payout = await prisma.teacherPayout.findUnique({ where: { id } });
    if (!payout) return reply.status(404).send({ error: "Liquidación no encontrada" });
    await prisma.teacherPayout.delete({ where: { id } });
    await recordAudit(request, {
      action: "DELETE",
      entityType: "teacher_payout",
      entityId: id,
      details: { yearMonth: payout.yearMonth, teacherId: payout.teacherId },
    });
    return { ok: true };
  });
}
