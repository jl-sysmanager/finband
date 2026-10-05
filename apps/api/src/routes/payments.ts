import type { FastifyInstance } from "fastify";
import type { FeeStatus, PayoutStatus } from "@prisma/client";
import { studentPaymentSchema, teacherPayoutPaymentSchema } from "@finband/shared";
import { prisma } from "../lib/prisma.js";

function feeStatus(total: number, paid: number): FeeStatus {
  if (paid <= 0) return "PENDING";
  if (paid >= total) return "PAID";
  return "PARTIAL";
}

function payoutStatus(total: number, paid: number): PayoutStatus {
  if (paid <= 0) return "PENDING";
  if (paid >= total) return "PAID";
  return "PARTIAL";
}

export async function paymentRoutes(app: FastifyInstance) {
  app.get("/student-fees", async (request) => {
    const q = request.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = {};
    if (q.yearMonth) where.yearMonth = q.yearMonth;
    if (q.status) where.status = q.status;
    return prisma.studentFee.findMany({
      where,
      include: {
        student: true,
        payments: { orderBy: { paidAt: "desc" } },
      },
      orderBy: { yearMonth: "desc" },
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

    const newPaid = fee.amountPaid + d.amount;
    await prisma.studentFee.update({
      where: { id: fee.id },
      data: {
        amountPaid: newPaid,
        status: feeStatus(fee.totalAmount, newPaid),
      },
    });

    return payment;
  });

  app.get("/teacher-payouts", async (request) => {
    const q = request.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = {};
    if (q.yearMonth) where.yearMonth = q.yearMonth;
    if (q.status) where.status = q.status;
    return prisma.teacherPayout.findMany({
      where,
      include: { teacher: true },
      orderBy: { yearMonth: "desc" },
    });
  });

  app.post("/teacher-payouts/generate", async (request, reply) => {
    const { yearMonth } = request.body as { yearMonth?: string };
    if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
      return reply.status(400).send({ error: "yearMonth inválido (YYYY-MM)" });
    }
    const teachers = await prisma.teacher.findMany({ where: { deletedAt: null } });
    let count = 0;
    for (const t of teachers) {
      let amount = t.monthlySalary ?? 0;
      if (!amount && t.costPerClass) {
        const classes = await prisma.classGroup.count({ where: { teacherId: t.id } });
        amount = t.costPerClass * classes * 4;
      }
      if (!amount && t.hourlyRate && t.weeklyHours) {
        amount = t.hourlyRate * t.weeklyHours * 4;
      }
      if (amount <= 0) continue;
      await prisma.teacherPayout.upsert({
        where: { teacherId_yearMonth: { teacherId: t.id, yearMonth } },
        create: { teacherId: t.id, yearMonth, amount },
        update: { amount },
      });
      count++;
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
}
