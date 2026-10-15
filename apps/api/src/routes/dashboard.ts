import type { FastifyInstance } from "fastify";
import { previewFeesForMonth } from "../lib/tariffs.js";
import { fromCents } from "../lib/money.js";
import { prisma } from "../lib/prisma.js";
import { balanceForMonth } from "../lib/balance.js";
import { calendarDateOf, monthDateRange, yearMonthOf } from "../lib/dates.js";

function monthBounds(date = new Date()) {
  const ym = yearMonthOf(date);
  return { ...monthDateRange(ym), ym };
}

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/summary", async () => {
    const { ym } = monthBounds();

    const [
      students,
      teachers,
      classes,
      balance,
      pendingFees,
      pendingPayouts,
    ] = await Promise.all([
      prisma.student.count({ where: { deletedAt: null, status: "ACTIVE" } }),
      prisma.teacher.count({ where: { deletedAt: null } }),
      prisma.classGroup.count({ where: { deletedAt: null } }),
      balanceForMonth(ym),
      prisma.studentFee.findMany({
        where: { yearMonth: ym, status: { in: ["PENDING", "PARTIAL"] } },
        select: { totalAmount: true, amountPaid: true },
      }),
      prisma.teacherPayout.findMany({
        where: { yearMonth: ym, status: { in: ["PENDING", "PARTIAL"] } },
        select: { amount: true, amountPaid: true },
      }),
    ]);

    const pendingCollections = pendingFees.reduce(
      (s, f) => s + (f.totalAmount - f.amountPaid),
      0,
    );
    const pendingTeacherPay = pendingPayouts.reduce(
      (s, p) => s + (p.amount - p.amountPaid),
      0,
    );

    return {
      students,
      teachers,
      classes,
      // Ingresos = apuntes + cobros de cuotas; gastos = apuntes + pagos a profesores.
      monthlyIncome: fromCents(balance.income + balance.feeCollections),
      monthlyExpenses: fromCents(balance.expense + balance.teacherPayments),
      monthlyBalance: fromCents(balance.balance),
      pendingCollections: fromCents(pendingCollections),
      pendingTeacherPay: fromCents(pendingTeacherPay),
    };
  });

  app.get("/chart", async () => {
    const months: string[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      );
    }
    const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const monthSet = new Set(months);
    const zeroed = () => Object.fromEntries(months.map((m) => [m, 0])) as Record<string, number>;

    const [incomes, expenses, studentPayments, studentFees, teacherPayouts] = await Promise.all([
      // Apuntes manuales sin los de categorías gestionadas por la app (ya están en
      // cobros de cuotas y pagos a profesores).
      prisma.incomeEntry.findMany({
        where: { date: { gte: start }, category: { managedByApp: false } },
        select: { date: true, amount: true },
      }),
      prisma.expenseEntry.findMany({
        where: { date: { gte: start }, category: { managedByApp: false } },
        select: { date: true, amount: true },
      }),
      prisma.studentPayment.findMany({
        where: { paidAt: { gte: start } },
        select: { paidAt: true, amount: true },
      }),
      prisma.studentFee.findMany({
        where: { yearMonth: { in: [...months] } },
        select: { yearMonth: true, totalAmount: true },
      }),
      prisma.teacherPayout.findMany({
        where: { yearMonth: { in: [...months] } },
        select: { yearMonth: true, amountPaid: true },
      }),
    ]);

    const incomeByMonth = zeroed();
    const expenseByMonth = zeroed();
    const feesIssuedByMonth = zeroed();
    const feesCollectedByMonth = zeroed();
    const payoutsPaidByMonth = zeroed();

    for (const row of incomes) {
      const key = calendarDateOf(row.date).slice(0, 7);
      if (monthSet.has(key)) incomeByMonth[key] = (incomeByMonth[key] ?? 0) + row.amount;
    }
    for (const row of expenses) {
      const key = calendarDateOf(row.date).slice(0, 7);
      if (monthSet.has(key)) expenseByMonth[key] = (expenseByMonth[key] ?? 0) + row.amount;
    }
    for (const row of studentPayments) {
      const key = yearMonthOf(row.paidAt);
      if (monthSet.has(key)) feesCollectedByMonth[key] = (feesCollectedByMonth[key] ?? 0) + row.amount;
    }
    for (const row of studentFees) {
      if (monthSet.has(row.yearMonth)) {
        feesIssuedByMonth[row.yearMonth] = (feesIssuedByMonth[row.yearMonth] ?? 0) + row.totalAmount;
      }
    }
    for (const row of teacherPayouts) {
      if (monthSet.has(row.yearMonth)) {
        payoutsPaidByMonth[row.yearMonth] = (payoutsPaidByMonth[row.yearMonth] ?? 0) + row.amountPaid;
      }
    }

    return months.map((month) => ({
      month,
      income: fromCents(incomeByMonth[month] ?? 0),
      expenses: fromCents(expenseByMonth[month] ?? 0),
      feesIssued: fromCents(feesIssuedByMonth[month] ?? 0),
      feesCollected: fromCents(feesCollectedByMonth[month] ?? 0),
      teacherPayoutsPaid: fromCents(payoutsPaidByMonth[month] ?? 0),
    }));
  });

  app.get("/recent-movements", async () => {
    const [incomes, expenses] = await Promise.all([
      prisma.incomeEntry.findMany({
        take: 10,
        orderBy: { date: "desc" },
        include: { category: true },
      }),
      prisma.expenseEntry.findMany({
        take: 10,
        orderBy: { date: "desc" },
        include: { category: true },
      }),
    ]);

    const items = [
      ...incomes.map((i) => ({
        type: "income" as const,
        date: i.date,
        concept: i.concept,
        category: i.category.name,
        amount: fromCents(i.amount),
      })),
      ...expenses.map((e) => ({
        type: "expense" as const,
        date: e.date,
        concept: e.concept,
        category: e.category.name,
        amount: fromCents(e.amount),
      })),
    ]
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 15);

    return items;
  });

  app.get("/action-items", async (request) => {
    const q = request.query as { yearMonth?: string };
    const { ym } = monthBounds();
    const yearMonth = q.yearMonth && /^\d{4}-\d{2}$/.test(q.yearMonth) ? q.yearMonth : ym;

    const [
      feePreview,
      unpaidFees,
      pendingPayouts,
      studentsNoTeacherCount,
      studentsNoTeacher,
      classesNoScheduleCount,
      classesNoSchedule,
    ] = await Promise.all([
        previewFeesForMonth(yearMonth),
        // Todas las pendientes de alumnos activos (antes se cortaba a 200 y se filtraba
        // después, así que el recuento y el total podían salir por debajo).
        prisma.studentFee.findMany({
          where: {
            status: { in: ["PENDING", "PARTIAL"] },
            student: { deletedAt: null, status: "ACTIVE" },
          },
          select: {
            id: true,
            studentId: true,
            yearMonth: true,
            totalAmount: true,
            amountPaid: true,
            student: { select: { firstName: true, lastName: true } },
          },
        }),
        prisma.teacherPayout.findMany({
          where: { yearMonth, status: { in: ["PENDING", "PARTIAL"] } },
          include: { teacher: { select: { firstName: true, lastName: true } } },
        }),
        prisma.student.count({
          where: { deletedAt: null, status: "ACTIVE", primaryTeacherId: null },
        }),
        prisma.student.findMany({
          where: {
            deletedAt: null,
            status: "ACTIVE",
            primaryTeacherId: null,
          },
          orderBy: { lastName: "asc" },
          take: 10,
          select: { id: true, firstName: true, lastName: true },
        }),
        prisma.classGroup.count({ where: { deletedAt: null, scheduleSlots: { none: {} } } }),
        prisma.classGroup.findMany({
          where: { deletedAt: null, scheduleSlots: { none: {} } },
          include: { teacher: { select: { firstName: true, lastName: true } } },
          take: 10,
        }),
      ]);

    const unpaidAll = unpaidFees
      .map((f) => ({
        id: f.id,
        studentId: f.studentId,
        studentName: `${f.student.lastName}, ${f.student.firstName}`,
        yearMonth: f.yearMonth,
        pending: Math.max(0, f.totalAmount - f.amountPaid),
      }))
      .filter((f) => f.pending > 0)
      .sort((a, b) => b.pending - a.pending);

    const withoutFeeAll = feePreview.rows.filter((r) => r.totalAmount > 0 && !r.existingFeeId);

    return {
      yearMonth,
      studentsWithoutFee: {
        count: withoutFeeAll.length,
        items: withoutFeeAll.slice(0, 8).map((r) => ({
          studentId: r.studentId,
          studentName: r.studentName,
          totalAmount: fromCents(r.totalAmount),
        })),
      },
      unpaidFees: {
        count: unpaidAll.length,
        totalPending: fromCents(unpaidAll.reduce((s, f) => s + f.pending, 0)),
        items: unpaidAll.slice(0, 10).map((f) => ({ ...f, pending: fromCents(f.pending) })),
      },
      pendingPayouts: {
        count: pendingPayouts.length,
        totalPending: fromCents(pendingPayouts.reduce((s, p) => s + (p.amount - p.amountPaid), 0)),
        items: pendingPayouts.map((p) => ({
          id: p.id,
          teacherName: `${p.teacher.lastName}, ${p.teacher.firstName}`,
          yearMonth: p.yearMonth,
          pending: fromCents(p.amount - p.amountPaid),
        })),
      },
      studentsWithoutTeacher: {
        count: studentsNoTeacherCount,
        items: studentsNoTeacher.map((s) => ({
          id: s.id,
          name: `${s.lastName}, ${s.firstName}`,
        })),
      },
      classesWithoutSchedule: {
        count: classesNoScheduleCount,
        items: classesNoSchedule.map((c) => ({
          id: c.id,
          name: c.name,
          teacherName: `${c.teacher.lastName}, ${c.teacher.firstName}`,
        })),
      },
    };
  });

  app.get("/upcoming-due", async () => {
    const { ym } = monthBounds();
    const fees = await prisma.studentFee.findMany({
      where: { yearMonth: ym, status: { in: ["PENDING", "PARTIAL"] } },
      include: { student: { select: { firstName: true, lastName: true } } },
      orderBy: { dueDate: "asc" },
      take: 20,
    });
    return fees.map((f) => ({
      id: f.id,
      studentName: `${f.student.firstName} ${f.student.lastName}`,
      dueDate: f.dueDate,
      pending: fromCents(f.totalAmount - f.amountPaid),
      status: f.status,
    }));
  });
}
