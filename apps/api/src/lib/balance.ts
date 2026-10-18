import { monthDateRange, yearMonthOf } from "./dates.js";
import { fromCents } from "./money.js";
import { prisma } from "./prisma.js";

/**
 * Balance del centro, en céntimos:
 *   ingresos manuales + cobros de cuotas − gastos manuales − pagos a profesores.
 *
 * Los cobros y los pagos a profesores salen de lo registrado en la app. Los apuntes
 * manuales de categorías `managedByApp` (p. ej. "Cuotas mensuales", "Profesores")
 * no cuentan para no duplicarlos; se devuelven aparte solo como información.
 */
export type BalanceCents = {
  income: number;
  feeCollections: number;
  expense: number;
  teacherPayments: number;
  balance: number;
  excludedManualIncome: number;
  excludedManualExpense: number;
};

const empty = (): Omit<BalanceCents, "balance"> => ({
  income: 0,
  feeCollections: 0,
  expense: 0,
  teacherPayments: 0,
  excludedManualIncome: 0,
  excludedManualExpense: 0,
});

const withBalance = (t: Omit<BalanceCents, "balance">): BalanceCents => ({
  ...t,
  balance: t.income + t.feeCollections - t.expense - t.teacherPayments,
});

async function movementsBetween(start: Date, end: Date) {
  return Promise.all([
    prisma.incomeEntry.findMany({
      where: { date: { gte: start, lte: end } },
      select: { date: true, amount: true, category: { select: { managedByApp: true } } },
    }),
    prisma.expenseEntry.findMany({
      where: { date: { gte: start, lte: end } },
      select: { date: true, amount: true, category: { select: { managedByApp: true } } },
    }),
    prisma.studentPayment.findMany({
      where: { paidAt: { gte: start, lte: end } },
      select: { paidAt: true, amount: true },
    }),
    prisma.teacherPayoutPayment.findMany({
      where: { paidAt: { gte: start, lte: end } },
      select: { paidAt: true, amount: true },
    }),
  ]);
}

/** Balance de cada mes del rango (claves "YYYY-MM" en la zona de la escuela). */
export async function balanceByMonth(months: string[]): Promise<Map<string, BalanceCents>> {
  const totals = new Map(months.map((m) => [m, empty()]));
  if (months.length === 0) return new Map();
  const start = monthDateRange(months[0]!).start;
  const end = monthDateRange(months[months.length - 1]!).end;
  const [incomes, expenses, collections, teacherPayments] = await movementsBetween(start, end);

  const add = (date: Date, apply: (t: Omit<BalanceCents, "balance">) => void) => {
    const t = totals.get(yearMonthOf(date));
    if (t) apply(t);
  };
  for (const r of incomes) {
    add(r.date, (t) => {
      if (r.category.managedByApp) t.excludedManualIncome += r.amount;
      else t.income += r.amount;
    });
  }
  for (const r of expenses) {
    add(r.date, (t) => {
      if (r.category.managedByApp) t.excludedManualExpense += r.amount;
      else t.expense += r.amount;
    });
  }
  for (const r of collections) add(r.paidAt, (t) => (t.feeCollections += r.amount));
  for (const r of teacherPayments) add(r.paidAt, (t) => (t.teacherPayments += r.amount));

  return new Map([...totals].map(([m, t]) => [m, withBalance(t)]));
}

export async function balanceForMonth(yearMonth: string): Promise<BalanceCents> {
  return (await balanceByMonth([yearMonth])).get(yearMonth)!;
}

export function sumBalances(rows: BalanceCents[]): BalanceCents {
  const t = empty();
  for (const r of rows) {
    t.income += r.income;
    t.feeCollections += r.feeCollections;
    t.expense += r.expense;
    t.teacherPayments += r.teacherPayments;
    t.excludedManualIncome += r.excludedManualIncome;
    t.excludedManualExpense += r.excludedManualExpense;
  }
  return withBalance(t);
}

/** Mismas cifras en euros para la respuesta HTTP, PDF y Excel. */
export function balanceInEuros(b: BalanceCents) {
  return {
    income: fromCents(b.income),
    feeCollections: fromCents(b.feeCollections),
    expense: fromCents(b.expense),
    teacherPayments: fromCents(b.teacherPayments),
    balance: fromCents(b.balance),
    excludedManualIncome: fromCents(b.excludedManualIncome),
    excludedManualExpense: fromCents(b.excludedManualExpense),
  };
}
