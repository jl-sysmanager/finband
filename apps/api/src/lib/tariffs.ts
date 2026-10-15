import type { ClassType, Prisma, Student } from "@prisma/client";
import { feeStatus } from "./fee-status.js";
import { withLock } from "./locks.js";
import { percentOfCents, sumCents } from "./money.js";
import { prisma } from "./prisma.js";
import { monthBounds } from "./schedule-occurrences.js";
import { calendarDateInMonth, calendarDateOf, yearMonthOf } from "./dates.js";

export class FeeHasPaymentsError extends Error {
  constructor() {
    super("La cuota de ese mes ya tiene cobros; elimínelos antes de regenerarla");
  }
}

export const currentYearMonth = yearMonthOf;

/** Un descuento se aplica si su vigencia se solapa con el mes de la cuota. */
function discountAppliesToMonth(
  d: { validFrom: Date | null; validTo: Date | null },
  yearMonth: string,
) {
  const { from, to } = monthBounds(yearMonth);
  if (d.validFrom && calendarDateOf(d.validFrom) > to) return false;
  if (d.validTo && calendarDateOf(d.validTo) < from) return false;
  return true;
}

export function feeLockKey(studentId: string, yearMonth: string) {
  return `fee:${studentId}:${yearMonth}`;
}

type TariffRuleRow = {
  name: string;
  instrument: string | null;
  level: string | null;
  classType: ClassType | null;
  priority: number;
  amount: number;
};

function ruleSpecificity(rule: TariffRuleRow): number {
  let score = rule.priority;
  if (rule.instrument) score += 100;
  if (rule.level) score += 50;
  if (rule.classType) score += 25;
  return score;
}

/** Tarifa más específica que encaja con el alumno y el tipo de clase. */
export function pickTariff(
  rules: TariffRuleRow[],
  student: Pick<Student, "mainInstrument" | "level">,
  classType: ClassType,
): { amount: number; ruleName: string | null } {
  let best: TariffRuleRow | null = null;
  for (const r of rules) {
    if (r.instrument && r.instrument !== student.mainInstrument) continue;
    if (r.level && r.level !== student.level) continue;
    if (r.classType && r.classType !== classType) continue;
    if (!best || ruleSpecificity(r) > ruleSpecificity(best)) best = r;
  }
  return best ? { amount: best.amount, ruleName: best.name } : { amount: 0, ruleName: null };
}

/** Lo que hace falta cargar de un alumno para calcular su cuota. */
const FEE_STUDENT_INCLUDE = {
  enrollments: {
    where: { active: true, classGroup: { deletedAt: null } },
    include: { classGroup: { select: { name: true, type: true } } },
  },
  discounts: { where: { active: true } },
} satisfies Prisma.StudentInclude;

type FeeStudent = Prisma.StudentGetPayload<{ include: typeof FEE_STUDENT_INCLUDE }>;

export type FeeCalculation = {
  baseAmount: number;
  discountAmount: number;
  totalAmount: number;
  lineItems: Array<{ label: string; amount: number }>;
};

const loadActiveTariffs = () => prisma.tariffRule.findMany({ where: { active: true } });

/** Cálculo puro (sin consultas): permite calcular a todos los alumnos con 3 consultas. */
function computeStudentFee(
  student: FeeStudent,
  rules: TariffRuleRow[],
  yearMonth: string,
): FeeCalculation {
  const lineItems: Array<{ label: string; amount: number }> = [];

  if (student.monthlyFee != null && student.monthlyFee > 0) {
    lineItems.push({ label: "Cuota fija", amount: student.monthlyFee });
  } else {
    for (const enr of student.enrollments) {
      const { amount, ruleName } = pickTariff(rules, student, enr.classGroup.type);
      if (amount > 0) {
        lineItems.push({
          label: `${enr.classGroup.name}${ruleName ? ` (${ruleName})` : ""}`,
          amount,
        });
      }
    }
  }
  const baseAmount = sumCents(lineItems.map((l) => l.amount));

  // PERCENT guarda centésimas de porcentaje y FIXED céntimos.
  const discounts = student.discounts
    .filter((d) => discountAppliesToMonth(d, yearMonth))
    .map((d) => (d.type === "PERCENT" ? percentOfCents(baseAmount, d.value) : d.value));
  const discountAmount = Math.min(sumCents(discounts), baseAmount);
  const totalAmount = baseAmount - discountAmount;

  return { baseAmount, discountAmount, totalAmount, lineItems };
}

/** Cuota del mes en céntimos (también las líneas de detalle). */
export async function calculateStudentMonthlyFee(
  studentId: string,
  yearMonth: string = currentYearMonth(),
): Promise<FeeCalculation> {
  const [student, rules] = await Promise.all([
    prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
      include: FEE_STUDENT_INCLUDE,
    }),
    loadActiveTariffs(),
  ]);
  if (!student) {
    throw new Error("Alumno no encontrado");
  }
  return computeStudentFee(student, rules, yearMonth);
}

/**
 * Crea o recalcula la cuota del mes. Nunca toca una cuota con cobros: su importe
 * ya se ha liquidado (total o parcialmente) y cambiarlo descuadraría los recibos.
 */
async function upsertStudentFeeForMonth(
  studentId: string,
  yearMonth: string,
  calc: FeeCalculation,
) {
  // Vence el día 5 del propio mes de la cuota.
  const dueDate = calendarDateInMonth(yearMonth, 5);
  const fields = {
    baseAmount: calc.baseAmount,
    discountAmount: calc.discountAmount,
    totalAmount: calc.totalAmount,
    lineItems: JSON.stringify(calc.lineItems),
  };

  await withLock(feeLockKey(studentId, yearMonth), async () => {
    const existing = await prisma.studentFee.findUnique({
      where: { studentId_yearMonth: { studentId, yearMonth } },
      include: { _count: { select: { payments: true } } },
    });
    if (!existing) {
      await prisma.studentFee.create({
        data: { studentId, yearMonth, ...fields, dueDate, status: "PENDING" },
      });
      return;
    }
    if (existing._count.payments > 0 || existing.amountPaid > 0) {
      throw new FeeHasPaymentsError();
    }
    await prisma.studentFee.update({
      where: { id: existing.id },
      data: { ...fields, status: feeStatus(calc.totalAmount, existing.amountPaid) },
    });
  });
}

export async function generateFeeForStudent(
  studentId: string,
  yearMonth: string,
): Promise<{ totalAmount: number; yearMonth: string }> {
  const student = await prisma.student.findFirst({
    where: { id: studentId, deletedAt: null },
  });
  if (!student) throw new Error("Alumno no encontrado");

  const calc = await calculateStudentMonthlyFee(studentId, yearMonth);
  if (calc.totalAmount <= 0) {
    return { totalAmount: 0, yearMonth };
  }
  await upsertStudentFeeForMonth(studentId, yearMonth, calc);
  return { totalAmount: calc.totalAmount, yearMonth };
}

export type FeeGenerateIssue =
  | "ready"
  | "no_amount"
  | "has_payments"
  | "excluded";

async function computeFeePreview(yearMonth: string) {
  const [students, rules, existingFees] = await Promise.all([
    prisma.student.findMany({
      where: { deletedAt: null, status: "ACTIVE" },
      include: FEE_STUDENT_INCLUDE,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    loadActiveTariffs(),
    prisma.studentFee.findMany({
      where: { yearMonth },
      select: { studentId: true, id: true, amountPaid: true, _count: { select: { payments: true } } },
    }),
  ]);
  const feeByStudent = new Map(existingFees.map((f) => [f.studentId, f]));

  const rows: Array<{
    studentId: string;
    studentName: string;
    totalAmount: number;
    issue: FeeGenerateIssue;
    existingFeeId: string | null;
    amountPaid: number;
  }> = [];

  const calcs = new Map<string, FeeCalculation>();
  for (const student of students) {
    const calc = computeStudentFee(student, rules, yearMonth);
    calcs.set(student.id, calc);
    const existing = feeByStudent.get(student.id);
    let issue: FeeGenerateIssue = "ready";
    if (calc.totalAmount <= 0) issue = "no_amount";
    else if (existing && (existing.amountPaid > 0 || existing._count.payments > 0)) {
      issue = "has_payments";
    }

    rows.push({
      studentId: student.id,
      studentName: `${student.lastName}, ${student.firstName}`,
      totalAmount: calc.totalAmount,
      issue,
      existingFeeId: existing?.id ?? null,
      amountPaid: existing?.amountPaid ?? 0,
    });
  }

  const eligible = rows.filter((r) => r.issue === "ready" && r.totalAmount > 0);
  return {
    yearMonth,
    rows,
    summary: {
      activeStudents: students.length,
      eligible: eligible.length,
      skippedNoAmount: rows.filter((r) => r.issue === "no_amount").length,
      skippedHasPayments: rows.filter((r) => r.issue === "has_payments").length,
      totalEligibleAmount: sumCents(eligible.map((r) => r.totalAmount)),
    },
    calcs,
  };
}

export async function previewFeesForMonth(yearMonth: string) {
  const { calcs: _calcs, ...preview } = await computeFeePreview(yearMonth);
  return preview;
}

export async function generateFeesForMonth(
  yearMonth: string,
  options?: { excludeStudentIds?: string[] },
): Promise<{ generated: number; skipped: number }> {
  const exclude = new Set(options?.excludeStudentIds ?? []);
  const preview = await computeFeePreview(yearMonth);

  let generated = 0;
  let skipped = 0;
  for (const row of preview.rows) {
    if (exclude.has(row.studentId)) {
      skipped++;
      continue;
    }
    if (row.issue !== "ready" || row.totalAmount <= 0) {
      skipped++;
      continue;
    }
    try {
      await upsertStudentFeeForMonth(row.studentId, yearMonth, preview.calcs.get(row.studentId)!);
      generated++;
    } catch (e) {
      // Se cobró algo entre la vista previa y la generación: se respeta la cuota.
      if (!(e instanceof FeeHasPaymentsError)) throw e;
      skipped++;
    }
  }
  return { generated, skipped };
}
