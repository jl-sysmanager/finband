import type { FastifyInstance } from "fastify";
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
