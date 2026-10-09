import type { FastifyInstance } from "fastify";
import { previewFeesForMonth } from "../lib/tariffs.js";
import { prisma } from "../lib/prisma.js";

function monthBounds(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
  const ym = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  return { start, end, ym };
}

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/summary", async () => {
    const { start, end, ym } = monthBounds();

    const [
      students,
      teachers,
      classes,
      incomeAgg,
      expenseAgg,
      pendingFees,
      pendingPayouts,
    ] = await Promise.all([
      prisma.student.count({ where: { deletedAt: null, status: "ACTIVE" } }),
      prisma.teacher.count({ where: { deletedAt: null } }),
      prisma.classGroup.count(),
      prisma.incomeEntry.aggregate({
        where: { date: { gte: start, lte: end } },
        _sum: { amount: true },
      }),
      prisma.expenseEntry.aggregate({
        where: { date: { gte: start, lte: end } },
        _sum: { amount: true },
      }),
      prisma.studentFee.findMany({
        where: { yearMonth: ym, status: { in: ["PENDING", "PARTIAL"] } },
      }),
      prisma.teacherPayout.findMany({
        where: { yearMonth: ym, status: { in: ["PENDING", "PARTIAL"] } },
      }),
    ]);

    const income = incomeAgg._sum.amount ?? 0;
    const expenses = expenseAgg._sum.amount ?? 0;
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
      monthlyIncome: income,
      monthlyExpenses: expenses,
      monthlyBalance: income - expenses,
      pendingCollections,
      pendingTeacherPay,
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

    const [incomes, expenses] = await Promise.all([
      prisma.incomeEntry.findMany({ where: { date: { gte: start } } }),
      prisma.expenseEntry.findMany({ where: { date: { gte: start } } }),
    ]);

    const incomeByMonth = new Map<string, number>();
    const expenseByMonth = new Map<string, number>();
    for (const m of months) {
      incomeByMonth.set(m, 0);
      expenseByMonth.set(m, 0);
    }

    for (const row of incomes) {
      const key = `${row.date.getFullYear()}-${String(row.date.getMonth() + 1).padStart(2, "0")}`;
      if (incomeByMonth.has(key)) {
        incomeByMonth.set(key, (incomeByMonth.get(key) ?? 0) + row.amount);
      }
    }
    for (const row of expenses) {
      const key = `${row.date.getFullYear()}-${String(row.date.getMonth() + 1).padStart(2, "0")}`;
      if (expenseByMonth.has(key)) {
        expenseByMonth.set(key, (expenseByMonth.get(key) ?? 0) + row.amount);
      }
    }

    return months.map((month) => ({
      month,
      income: incomeByMonth.get(month) ?? 0,
      expenses: expenseByMonth.get(month) ?? 0,
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
        amount: i.amount,
      })),
      ...expenses.map((e) => ({
        type: "expense" as const,
        date: e.date,
        concept: e.concept,
        category: e.category.name,
        amount: e.amount,
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
        prisma.studentFee.findMany({
          where: { status: { in: ["PENDING", "PARTIAL"] } },
          include: { student: { select: { firstName: true, lastName: true, status: true, deletedAt: true } } },
          orderBy: { yearMonth: "desc" },
          take: 200,
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
        prisma.classGroup.count({ where: { scheduleSlots: { none: {} } } }),
        prisma.classGroup.findMany({
          where: { scheduleSlots: { none: {} } },
          include: { teacher: { select: { firstName: true, lastName: true } } },
          take: 10,
        }),
      ]);

    const unpaidAll = unpaidFees
      .filter((f) => !f.student.deletedAt && f.student.status === "ACTIVE")
      .map((f) => ({
        id: f.id,
        studentId: f.studentId,
        studentName: `${f.student.lastName}, ${f.student.firstName}`,
        yearMonth: f.yearMonth,
        pending: Math.max(0, f.totalAmount - f.amountPaid),
      }))
      .filter((f) => f.pending > 0.001)
      .sort((a, b) => b.pending - a.pending);

    const withoutFeeAll = feePreview.rows.filter((r) => r.totalAmount > 0 && !r.existingFeeId);

    return {
      yearMonth,
      studentsWithoutFee: {
        count: withoutFeeAll.length,
        items: withoutFeeAll.slice(0, 8).map((r) => ({
          studentId: r.studentId,
          studentName: r.studentName,
          totalAmount: r.totalAmount,
        })),
      },
      unpaidFees: {
        count: unpaidAll.length,
        totalPending: unpaidAll.reduce((s, f) => s + f.pending, 0),
        items: unpaidAll.slice(0, 10),
      },
      pendingPayouts: {
        count: pendingPayouts.length,
        totalPending: pendingPayouts.reduce((s, p) => s + (p.amount - p.amountPaid), 0),
        items: pendingPayouts.map((p) => ({
          id: p.id,
          teacherName: `${p.teacher.lastName}, ${p.teacher.firstName}`,
          yearMonth: p.yearMonth,
          pending: p.amount - p.amountPaid,
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
      include: { student: true },
      orderBy: { dueDate: "asc" },
      take: 20,
    });
    return fees.map((f) => ({
      id: f.id,
      studentName: `${f.student.firstName} ${f.student.lastName}`,
      dueDate: f.dueDate,
      pending: f.totalAmount - f.amountPaid,
      status: f.status,
    }));
  });
}
