import { prisma } from "./prisma.js";

export function parseYearMonth(yearMonth: string) {
  const [y, m] = yearMonth.split("-").map(Number);
  return { year: y!, month: m! };
}

export function lastDayOfYearMonth(yearMonth: string) {
  const { year, month } = parseYearMonth(yearMonth);
  return new Date(year, month, 0, 23, 59, 59, 999);
}

export function previousYearMonth(yearMonth: string) {
  const { year, month } = parseYearMonth(yearMonth);
  const d = new Date(year, month - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function feeDueDate(fee: { yearMonth: string; dueDate: Date | null }) {
  if (fee.dueDate) return fee.dueDate;
  return lastDayOfYearMonth(fee.yearMonth);
}

const AGING_LABELS: Record<string, string> = {
  current: "Al corriente (no vencido)",
  d1_30: "1–30 días",
  d31_60: "31–60 días",
  d61_90: "61–90 días",
  d90plus: "Más de 90 días",
};

export async function reportDebtAging(asOf = new Date()) {
  const fees = await prisma.studentFee.findMany({
    where: { status: { in: ["PENDING", "PARTIAL"] } },
    include: { student: { select: { firstName: true, lastName: true, deletedAt: true, status: true } } },
  });

  const buckets = {
    current: 0,
    d1_30: 0,
    d31_60: 0,
    d61_90: 0,
    d90plus: 0,
  };
  const details: Array<{
    student: string;
    yearMonth: string;
    pending: number;
    dueDate: string;
    bucket: string;
  }> = [];

  for (const f of fees) {
    if (f.student.deletedAt || f.student.status !== "ACTIVE") continue;
    const pending = f.totalAmount - f.amountPaid;
    if (pending <= 0.001) continue;

    const due = feeDueDate(f);
    const msPerDay = 86400000;
    const daysOverdue = Math.floor((asOf.getTime() - due.getTime()) / msPerDay);

    let key: keyof typeof buckets = "current";
    if (daysOverdue <= 0) key = "current";
    else if (daysOverdue <= 30) key = "d1_30";
    else if (daysOverdue <= 60) key = "d31_60";
    else if (daysOverdue <= 90) key = "d61_90";
    else key = "d90plus";

    buckets[key] += pending;
    details.push({
      student: `${f.student.lastName}, ${f.student.firstName}`,
      yearMonth: f.yearMonth,
      pending: Math.round(pending * 100) / 100,
      dueDate: due.toISOString().slice(0, 10),
      bucket: AGING_LABELS[key]!,
    });
  }

  details.sort((a, b) => b.pending - a.pending);

  const summary = (Object.keys(buckets) as Array<keyof typeof buckets>).map((k) => ({
    bucket: AGING_LABELS[k]!,
    amount: Math.round(buckets[k] * 100) / 100,
  }));

  const totalPending = summary.reduce((s, r) => s + r.amount, 0);

  return { asOf: asOf.toISOString().slice(0, 10), summary, totalPending, details };
}

export async function reportFeesIssuedCollected(yearMonth: string) {
  const fees = await prisma.studentFee.findMany({
    where: { yearMonth },
    include: { student: { select: { firstName: true, lastName: true } } },
    orderBy: { student: { lastName: "asc" } },
  });

  let issued = 0;
  let collected = 0;
  const rows = fees.map((f) => {
    issued += f.totalAmount;
    collected += f.amountPaid;
    const pending = f.totalAmount - f.amountPaid;
    return {
      student: `${f.student.lastName}, ${f.student.firstName}`,
      issued: f.totalAmount,
      collected: f.amountPaid,
      pending,
      status: f.status,
    };
  });

  const pending = issued - collected;
  const collectionRate = issued > 0 ? Math.round((collected / issued) * 1000) / 10 : 0;

  return {
    yearMonth,
    totals: {
      issued: Math.round(issued * 100) / 100,
      collected: Math.round(collected * 100) / 100,
      pending: Math.round(pending * 100) / 100,
      collectionRate,
      feeCount: fees.length,
    },
    rows,
  };
}

export async function reportPayoutsExpectedPaid(yearMonth: string) {
  const payouts = await prisma.teacherPayout.findMany({
    where: { yearMonth },
    include: { teacher: { select: { firstName: true, lastName: true } } },
    orderBy: { teacher: { lastName: "asc" } },
  });

  let expected = 0;
  let paid = 0;
  const rows = payouts.map((p) => {
    expected += p.amount;
    paid += p.amountPaid;
    return {
      teacher: `${p.teacher.lastName}, ${p.teacher.firstName}`,
      expected: p.amount,
      paid: p.amountPaid,
      pending: p.amount - p.amountPaid,
      status: p.status,
    };
  });

  const pending = expected - paid;
  const paymentRate = expected > 0 ? Math.round((paid / expected) * 1000) / 10 : 0;

  return {
    yearMonth,
    totals: {
      expected: Math.round(expected * 100) / 100,
      paid: Math.round(paid * 100) / 100,
      pending: Math.round(pending * 100) / 100,
      paymentRate,
      payoutCount: payouts.length,
    },
    rows,
  };
}

async function monthFinancials(yearMonth: string) {
  const { start, end } = (() => {
    const { year, month } = parseYearMonth(yearMonth);
    return {
      start: new Date(year, month - 1, 1),
      end: new Date(year, month, 0, 23, 59, 59, 999),
    };
  })();

  const [incomeAgg, expenseAgg, feePaymentsAgg, activeStudents, feeStats, payoutStats] =
    await Promise.all([
      prisma.incomeEntry.aggregate({
        where: { date: { gte: start, lte: end } },
        _sum: { amount: true },
      }),
      prisma.expenseEntry.aggregate({
        where: { date: { gte: start, lte: end } },
        _sum: { amount: true },
      }),
      prisma.studentPayment.aggregate({
        where: { paidAt: { gte: start, lte: end } },
        _sum: { amount: true },
      }),
      prisma.student.count({ where: { deletedAt: null, status: "ACTIVE" } }),
      reportFeesIssuedCollected(yearMonth),
      reportPayoutsExpectedPaid(yearMonth),
    ]);

  const income = incomeAgg._sum.amount ?? 0;
  const expenses = expenseAgg._sum.amount ?? 0;
  const feeCollections = feePaymentsAgg._sum.amount ?? 0;

  return {
    income,
    expenses,
    accountingBalance: income - expenses,
    feeCollections,
    activeStudents,
    feesIssued: feeStats.totals.issued,
    feesCollectedOnFees: feeStats.totals.collected,
    feesPending: feeStats.totals.pending,
    collectionRate: feeStats.totals.collectionRate,
    payoutsExpected: payoutStats.totals.expected,
    payoutsPaid: payoutStats.totals.paid,
    payoutsPending: payoutStats.totals.pending,
    cashFlowHint: feeCollections - payoutStats.totals.paid,
  };
}

export async function reportExecutiveMonthly(yearMonth: string) {
  const current = await monthFinancials(yearMonth);
  const prevYm = previousYearMonth(yearMonth);
  const previous = await monthFinancials(prevYm);

  const delta = (cur: number, prev: number) =>
    prev === 0 ? (cur === 0 ? 0 : 100) : Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;

  return {
    yearMonth,
    previousMonth: prevYm,
    kpis: [
      { label: "Alumnos activos", value: current.activeStudents, unit: "count" as const },
      {
        label: "Cuotas emitidas (mes)",
        value: current.feesIssued,
        unit: "money" as const,
        deltaPct: delta(current.feesIssued, previous.feesIssued),
      },
      {
        label: "Cuotas cobradas (mes)",
        value: current.feesCollectedOnFees,
        unit: "money" as const,
        deltaPct: delta(current.feesCollectedOnFees, previous.feesCollectedOnFees),
      },
      {
        label: "Pendiente de cobro (cuotas del mes)",
        value: current.feesPending,
        unit: "money" as const,
      },
      {
        label: "Tasa de cobro (cuotas del mes)",
        value: current.collectionRate,
        unit: "percent" as const,
      },
      {
        label: "Ingresos contabilizados",
        value: current.income,
        unit: "money" as const,
        deltaPct: delta(current.income, previous.income),
      },
      {
        label: "Gastos contabilizados",
        value: current.expenses,
        unit: "money" as const,
        deltaPct: delta(current.expenses, previous.expenses),
      },
      {
        label: "Resultado contable (ing − gasto)",
        value: current.accountingBalance,
        unit: "money" as const,
      },
      {
        label: "Cobros registrados (recibos)",
        value: current.feeCollections,
        unit: "money" as const,
      },
      {
        label: "Liquidaciones previstas",
        value: current.payoutsExpected,
        unit: "money" as const,
      },
      {
        label: "Liquidaciones pagadas",
        value: current.payoutsPaid,
        unit: "money" as const,
      },
      {
        label: "Liquidaciones pendientes",
        value: current.payoutsPending,
        unit: "money" as const,
      },
      {
        label: "Cobros − pagos docentes (mes)",
        value: current.cashFlowHint,
        unit: "money" as const,
      },
    ],
  };
}

export async function reportStudentsWithoutFee(yearMonth: string) {
  const [students, fees] = await Promise.all([
    prisma.student.findMany({
      where: { deletedAt: null, status: "ACTIVE" },
      include: {
        primaryTeacher: { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.studentFee.findMany({
      where: { yearMonth },
      select: { studentId: true },
    }),
  ]);

  const withFee = new Set(fees.map((f) => f.studentId));
  const rows = students
    .filter((s) => !withFee.has(s.id))
    .map((s) => ({
      student: `${s.lastName}, ${s.firstName}`,
      instrument: s.mainInstrument ?? "—",
      level: s.level ?? "—",
      teacher: s.primaryTeacher
        ? `${s.primaryTeacher.lastName}, ${s.primaryTeacher.firstName}`
        : "—",
    }));

  return { yearMonth, count: rows.length, activeStudents: students.length, rows };
}
