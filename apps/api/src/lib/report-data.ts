import { balanceByMonth, balanceInEuros, sumBalances } from "./balance.js";
import { calendarDateOf, localIsoDate, monthDateRange, yearMonthOf } from "./dates.js";
import { fromCents } from "./money.js";
import { prisma } from "./prisma.js";

/*
 * Datos de los informes. Todos trabajan sobre un rango de meses "YYYY-MM"
 * (desde/hasta, inclusivos; un único mes = informe mensual), suman en céntimos y
 * devuelven euros: el resultado va tal cual a la respuesta JSON, al PDF y al Excel.
 */

export const MAX_RANGE_MONTHS = 36;

export class InvalidRangeError extends Error {}

/** Meses del rango, en orden. Falla si el rango está invertido o es demasiado largo. */
export function monthsBetween(monthFrom: string, monthTo: string): string[] {
  if (monthFrom > monthTo) {
    throw new InvalidRangeError("El mes inicial no puede ser posterior al final");
  }
  const months: string[] = [];
  let [y, m] = monthFrom.split("-").map(Number) as [number, number];
  for (;;) {
    const ym = `${y}-${String(m).padStart(2, "0")}`;
    months.push(ym);
    if (ym === monthTo) break;
    if (months.length >= MAX_RANGE_MONTHS) {
      throw new InvalidRangeError(`El rango no puede superar ${MAX_RANGE_MONTHS} meses`);
    }
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

const rate = (part: number, total: number) =>
  total > 0 ? Math.round((part / total) * 1000) / 10 : 0;

const personName = (p: { firstName: string; lastName: string }) => `${p.lastName}, ${p.firstName}`;

// ---------------------------------------------------------------------------
// Balance del centro
// ---------------------------------------------------------------------------

export async function reportBalance(monthFrom: string, monthTo: string) {
  const months = monthsBetween(monthFrom, monthTo);
  const [byMonth, fees, payouts] = await Promise.all([
    balanceByMonth(months),
    prisma.studentFee.aggregate({
      where: { yearMonth: { gte: monthFrom, lte: monthTo } },
      _sum: { totalAmount: true, amountPaid: true },
    }),
    prisma.teacherPayout.aggregate({
      where: { yearMonth: { gte: monthFrom, lte: monthTo } },
      _sum: { amount: true, amountPaid: true },
    }),
  ]);

  const issued = fees._sum.totalAmount ?? 0;
  const collectedOnFees = fees._sum.amountPaid ?? 0;
  const settled = payouts._sum.amount ?? 0;
  const paidOnPayouts = payouts._sum.amountPaid ?? 0;

  return {
    monthFrom,
    monthTo,
    rows: [...byMonth].map(([month, b]) => ({ month, ...balanceInEuros(b) })),
    totals: balanceInEuros(sumBalances([...byMonth.values()])),
    // Cuotas y liquidaciones correspondientes a los meses del periodo.
    indicators: {
      feesIssued: fromCents(issued),
      feesCollected: fromCents(collectedOnFees),
      feesPending: fromCents(issued - collectedOnFees),
      collectionRate: rate(collectedOnFees, issued),
      payoutsSettled: fromCents(settled),
      payoutsPaid: fromCents(paidOnPayouts),
      payoutsPending: fromCents(settled - paidOnPayouts),
    },
  };
}

// ---------------------------------------------------------------------------
// Alumnos
// ---------------------------------------------------------------------------

export async function reportStudents(monthFrom: string, monthTo: string) {
  const months = monthsBetween(monthFrom, monthTo);
  const [fees, activeStudents] = await Promise.all([
    prisma.studentFee.findMany({
      where: { yearMonth: { gte: monthFrom, lte: monthTo } },
      select: {
        studentId: true,
        yearMonth: true,
        totalAmount: true,
        discountAmount: true,
        amountPaid: true,
        student: { select: { firstName: true, lastName: true } },
        payments: {
          select: { paidAt: true, amount: true, method: true },
          orderBy: { paidAt: "asc" },
        },
      },
      orderBy: [{ yearMonth: "asc" }],
    }),
    prisma.student.findMany({
      where: { deletedAt: null, status: "ACTIVE" },
      select: { id: true, firstName: true, lastName: true, createdAt: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);

  type Acc = {
    name: string;
    fees: number;
    issued: number;
    discount: number;
    collected: number;
    byMonth: Record<string, { issued: number; collected: number }>;
  };
  const perStudent = new Map<string, Acc>();
  const payments: Array<{ date: string; student: string; yearMonth: string; amount: number; method: string }> = [];
  for (const f of fees) {
    const acc = perStudent.get(f.studentId) ?? {
      name: personName(f.student),
      fees: 0,
      issued: 0,
      discount: 0,
      collected: 0,
      byMonth: {},
    };
    acc.fees += 1;
    acc.issued += f.totalAmount;
    acc.discount += f.discountAmount;
    acc.collected += f.amountPaid;
    acc.byMonth[f.yearMonth] = { issued: f.totalAmount, collected: f.amountPaid };
    perStudent.set(f.studentId, acc);
    for (const p of f.payments) {
      payments.push({
        date: localIsoDate(p.paidAt),
        student: acc.name,
        yearMonth: f.yearMonth,
        amount: fromCents(p.amount),
        method: p.method,
      });
    }
  }

  const rows = [...perStudent.values()]
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .map((a) => ({
      student: a.name,
      fees: a.fees,
      issued: fromCents(a.issued),
      discount: fromCents(a.discount),
      collected: fromCents(a.collected),
      pending: fromCents(a.issued - a.collected),
      byMonth: Object.fromEntries(
        Object.entries(a.byMonth).map(([m, v]) => [
          m,
          { issued: fromCents(v.issued), collected: fromCents(v.collected) },
        ]),
      ),
    }));

  // Alumnos activos sin cuota en algún mes del periodo: desde su alta y hasta el mes
  // en curso (las cuotas de meses futuros aún no se han generado, no faltan).
  const withFee = new Set(fees.map((f) => `${f.studentId}|${f.yearMonth}`));
  const current = yearMonthOf();
  const expectedMonths = months.filter((m) => m <= current);
  const withoutFee = activeStudents
    .map((s) => ({
      student: personName(s),
      months: expectedMonths.filter(
        (m) => monthDateRange(m).end >= s.createdAt && !withFee.has(`${s.id}|${m}`),
      ),
    }))
    .filter((s) => s.months.length > 0);

  const issued = [...perStudent.values()].reduce((t, a) => t + a.issued, 0);
  const discount = [...perStudent.values()].reduce((t, a) => t + a.discount, 0);
  const collected = [...perStudent.values()].reduce((t, a) => t + a.collected, 0);

  return {
    monthFrom,
    monthTo,
    months,
    rows,
    totals: {
      students: rows.length,
      fees: fees.length,
      issued: fromCents(issued),
      discount: fromCents(discount),
      collected: fromCents(collected),
      pending: fromCents(issued - collected),
      collectionRate: rate(collected, issued),
    },
    withoutFee,
    payments: payments.sort((a, b) => a.date.localeCompare(b.date)),
  };
}

// ---------------------------------------------------------------------------
// Profesores
// ---------------------------------------------------------------------------

export async function reportTeachers(monthFrom: string, monthTo: string) {
  const months = monthsBetween(monthFrom, monthTo);
  const payouts = await prisma.teacherPayout.findMany({
    where: { yearMonth: { gte: monthFrom, lte: monthTo } },
    select: {
      teacherId: true,
      yearMonth: true,
      workDays: true,
      baseAmount: true,
      transportAmount: true,
      amount: true,
      amountPaid: true,
      teacher: { select: { firstName: true, lastName: true } },
      payments: { select: { paidAt: true, amount: true, notes: true }, orderBy: { paidAt: "asc" } },
    },
    orderBy: [{ yearMonth: "asc" }],
  });

  type Acc = {
    name: string;
    payouts: number;
    workDays: number;
    base: number;
    transport: number;
    settled: number;
    paid: number;
    byMonth: Record<string, { settled: number; paid: number }>;
  };
  const perTeacher = new Map<string, Acc>();
  const payments: Array<{ date: string; teacher: string; yearMonth: string; amount: number; notes: string }> = [];
  for (const p of payouts) {
    const acc = perTeacher.get(p.teacherId) ?? {
      name: personName(p.teacher),
      payouts: 0,
      workDays: 0,
      base: 0,
      transport: 0,
      settled: 0,
      paid: 0,
      byMonth: {},
    };
    acc.payouts += 1;
    acc.workDays += p.workDays;
    acc.base += p.baseAmount;
    acc.transport += p.transportAmount;
    acc.settled += p.amount;
    acc.paid += p.amountPaid;
    acc.byMonth[p.yearMonth] = { settled: p.amount, paid: p.amountPaid };
    perTeacher.set(p.teacherId, acc);
    for (const pay of p.payments) {
      payments.push({
        date: localIsoDate(pay.paidAt),
        teacher: acc.name,
        yearMonth: p.yearMonth,
        amount: fromCents(pay.amount),
        notes: pay.notes ?? "",
      });
    }
  }

  const accs = [...perTeacher.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  const sum = (pick: (a: Acc) => number) => accs.reduce((t, a) => t + pick(a), 0);

  return {
    monthFrom,
    monthTo,
    months,
    rows: accs.map((a) => ({
      teacher: a.name,
      payouts: a.payouts,
      workDays: a.workDays,
      base: fromCents(a.base),
      transport: fromCents(a.transport),
      settled: fromCents(a.settled),
      paid: fromCents(a.paid),
      pending: fromCents(a.settled - a.paid),
      byMonth: Object.fromEntries(
        Object.entries(a.byMonth).map(([m, v]) => [
          m,
          { settled: fromCents(v.settled), paid: fromCents(v.paid) },
        ]),
      ),
    })),
    totals: {
      teachers: accs.length,
      workDays: sum((a) => a.workDays),
      base: fromCents(sum((a) => a.base)),
      transport: fromCents(sum((a) => a.transport)),
      settled: fromCents(sum((a) => a.settled)),
      paid: fromCents(sum((a) => a.paid)),
      pending: fromCents(sum((a) => a.settled - a.paid)),
      paymentRate: rate(sum((a) => a.paid), sum((a) => a.settled)),
    },
    payments: payments.sort((a, b) => a.date.localeCompare(b.date)),
  };
}

// ---------------------------------------------------------------------------
// Deuda pendiente (a fecha)
// ---------------------------------------------------------------------------

const AGING_BUCKETS = [
  { key: "current", label: "No vencido", maxDays: 0 },
  { key: "d1_30", label: "1–30 días", maxDays: 30 },
  { key: "d31_60", label: "31–60 días", maxDays: 60 },
  { key: "d61_90", label: "61–90 días", maxDays: 90 },
  { key: "d90plus", label: "Más de 90 días", maxDays: Infinity },
] as const;

/**
 * Cuotas con importe pendiente, por antigüedad de la deuda. Incluye a los alumnos
 * dados de baja o inactivos: dejar el centro no cancela lo que se debe.
 */
export async function reportDebt(asOf = new Date()) {
  const fees = await prisma.studentFee.findMany({
    where: { status: { in: ["PENDING", "PARTIAL"] } },
    select: {
      yearMonth: true,
      totalAmount: true,
      amountPaid: true,
      dueDate: true,
      student: { select: { firstName: true, lastName: true, status: true, deletedAt: true } },
    },
  });

  const totals = new Map<string, number>(AGING_BUCKETS.map((b) => [b.key, 0]));
  const details: Array<{
    student: string;
    /** Alumno dado de baja o inactivo. */
    inactive: boolean;
    yearMonth: string;
    dueDate: string;
    daysOverdue: number;
    bucket: string;
    pending: number;
  }> = [];

  for (const f of fees) {
    const pending = f.totalAmount - f.amountPaid;
    if (pending <= 0) continue;
    const due = f.dueDate ?? monthDateRange(f.yearMonth).end;
    const daysOverdue = Math.max(0, Math.floor((asOf.getTime() - due.getTime()) / 86_400_000));
    const bucket = AGING_BUCKETS.find((b) => daysOverdue <= b.maxDays)!;
    totals.set(bucket.key, totals.get(bucket.key)! + pending);
    const inactive = !!f.student.deletedAt || f.student.status !== "ACTIVE";
    details.push({
      student: inactive ? `${personName(f.student)} (baja)` : personName(f.student),
      inactive,
      yearMonth: f.yearMonth,
      dueDate: calendarDateOf(due),
      daysOverdue,
      bucket: bucket.label,
      pending: fromCents(pending),
    });
  }

  details.sort((a, b) => b.daysOverdue - a.daysOverdue || b.pending - a.pending);
  const totalPending = [...totals.values()].reduce((t, v) => t + v, 0);

  return {
    asOf: localIsoDate(asOf),
    totalPending: fromCents(totalPending),
    students: new Set(details.map((d) => d.student)).size,
    summary: AGING_BUCKETS.map((b) => ({ bucket: b.label, amount: fromCents(totals.get(b.key)!) })),
    details,
  };
}
