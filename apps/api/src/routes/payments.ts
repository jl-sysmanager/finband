import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PAYMENT_METHODS, studentPaymentSchema, teacherPayoutPaymentSchema } from "@finband/shared";
import { calculateTeacherPayout } from "../lib/teacher-payout.js";
import { feeStatus, payoutStatus } from "../lib/fee-status.js";
import { prisma } from "../lib/prisma.js";

async function syncFeePaid(feeId: string) {
  const fee = await prisma.studentFee.findUnique({
    where: { id: feeId },
    include: { payments: true },
  });
  if (!fee) return;
  const amountPaid = fee.payments.reduce((s, p) => s + p.amount, 0);
  await prisma.studentFee.update({
    where: { id: feeId },
    data: {
      amountPaid,
      status: feeStatus(fee.totalAmount, amountPaid),
    },
  });
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
  amount: z.number().positive().optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  paidAt: z.string().optional(),
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

    const payment = await prisma.studentPayment.create({
      data: {
        feeId: d.feeId,
        amount: d.amount,
        method: d.method,
        paidAt: d.paidAt ? new Date(d.paidAt) : new Date(),
        notes: d.notes,
      },
    });

    await syncFeePaid(fee.id);
    return payment;
  });

  app.patch("/student-payments/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = studentPaymentPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }
    const existing = await prisma.studentPayment.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: "Cobro no encontrado" });

    const payment = await prisma.studentPayment.update({
      where: { id },
      data: {
        ...parsed.data,
        paidAt: parsed.data.paidAt ? new Date(parsed.data.paidAt) : undefined,
      },
    });
    await syncFeePaid(existing.feeId);
    return payment;
  });

  app.delete("/student-fees/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const fee = await prisma.studentFee.findUnique({
      where: { id },
      include: { payments: true },
    });
    if (!fee) return reply.status(404).send({ error: "Cuota no encontrada" });
    await prisma.studentFee.delete({ where: { id } });
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
    const existing = await prisma.studentPayment.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: "Cobro no encontrado" });
    await prisma.studentPayment.delete({ where: { id } });
    await syncFeePaid(existing.feeId);
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

  async function upsertTeacherPayout(teacherId: string, yearMonth: string) {
    const calc = await calculateTeacherPayout(teacherId, yearMonth);
    if (calc.amount <= 0) return false;
    const existing = await prisma.teacherPayout.findUnique({
      where: { teacherId_yearMonth: { teacherId, yearMonth } },
    });
    const amountPaid = existing ? Math.min(existing.amountPaid, calc.amount) : 0;
    await prisma.teacherPayout.upsert({
      where: { teacherId_yearMonth: { teacherId, yearMonth } },
      create: {
        teacherId,
        yearMonth,
        baseAmount: calc.baseAmount,
        transportAmount: calc.transportAmount,
        workDays: calc.workDays,
        amount: calc.amount,
        amountPaid: 0,
        status: payoutStatus(calc.amount, 0),
      },
      update: {
        baseAmount: calc.baseAmount,
        transportAmount: calc.transportAmount,
        workDays: calc.workDays,
        amount: calc.amount,
        amountPaid,
        status: payoutStatus(calc.amount, amountPaid),
      },
    });
    return true;
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
      const calc = await calculateTeacherPayout(teacherId, yearMonth);
      if (calc.amount <= 0) return { generated: 0, yearMonth, amount: 0 };
      await upsertTeacherPayout(teacherId, yearMonth);
      return { generated: 1, yearMonth, amount: calc.amount };
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
    const payout = await prisma.teacherPayout.findUnique({ where: { id: d.payoutId } });
    if (!payout) return reply.status(404).send({ error: "Liquidación no encontrada" });

    const newPaid = payout.amountPaid + d.amount;
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

  app.patch("/teacher-payouts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { amountPaid?: number; notes?: string | null };
    const payout = await prisma.teacherPayout.findUnique({ where: { id } });
    if (!payout) return reply.status(404).send({ error: "Liquidación no encontrada" });

    const amountPaid = body.amountPaid ?? payout.amountPaid;
    if (amountPaid < 0 || amountPaid > payout.amount) {
      return reply.status(400).send({ error: "Importe pagado inválido" });
    }

    return prisma.teacherPayout.update({
      where: { id },
      data: {
        amountPaid,
        status: payoutStatus(payout.amount, amountPaid),
        paidAt: amountPaid <= 0 ? null : payout.paidAt,
        notes: body.notes === undefined ? undefined : body.notes,
      },
    });
  });

  app.delete("/teacher-payouts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const payout = await prisma.teacherPayout.findUnique({ where: { id } });
    if (!payout) return reply.status(404).send({ error: "Liquidación no encontrada" });
    await prisma.teacherPayout.delete({ where: { id } });
    return { ok: true };
  });
}
