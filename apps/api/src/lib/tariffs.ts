import type { ClassType, Student } from "@prisma/client";
import { feeStatus } from "./fee-status.js";
import { withLock } from "./locks.js";
import { roundMoney, subtractMoney, sumMoney } from "./money.js";
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

type EnrollmentWithClass = {
  classGroup: { type: ClassType };
};

function ruleSpecificity(rule: {
  instrument: string | null;
  level: string | null;
  classType: ClassType | null;
  priority: number;
}): number {
  let score = rule.priority;
  if (rule.instrument) score += 100;
  if (rule.level) score += 50;
  if (rule.classType) score += 25;
  return score;
}

export async function resolveTariffAmount(
  student: Pick<Student, "mainInstrument" | "level">,
  enrollment: EnrollmentWithClass,
): Promise<{ amount: number; ruleName: string | null }> {
  const rules = await prisma.tariffRule.findMany({ where: { active: true } });
  const type = enrollment.classGroup.type;

  const matching = rules.filter((r) => {
    if (r.instrument && r.instrument !== student.mainInstrument) return false;
    if (r.level && r.level !== student.level) return false;
    if (r.classType && r.classType !== type) return false;
    return true;
  });

  if (matching.length === 0) {
    return { amount: 0, ruleName: null };
  }

  matching.sort(
    (a, b) => ruleSpecificity(b) - ruleSpecificity(a),
  );
  const best = matching[0]!;
  return { amount: best.amount, ruleName: best.name };
}

export async function calculateStudentMonthlyFee(
  studentId: string,
  yearMonth: string = currentYearMonth(),
): Promise<{
  baseAmount: number;
  discountAmount: number;
  totalAmount: number;
  lineItems: Array<{ label: string; amount: number }>;
}> {
  const student = await prisma.student.findFirst({
    where: { id: studentId, deletedAt: null },
    include: {
      enrollments: {
        where: { active: true, classGroup: { deletedAt: null } },
        include: { classGroup: true },
      },
      discounts: { where: { active: true } },
    },
  });

  if (!student) {
    throw new Error("Alumno no encontrado");
  }

  const lineItems: Array<{ label: string; amount: number }> = [];

  if (student.monthlyFee != null && student.monthlyFee > 0) {
    lineItems.push({ label: "Cuota fija", amount: roundMoney(student.monthlyFee) });
  } else {
    for (const enr of student.enrollments) {
      const { amount, ruleName } = await resolveTariffAmount(student, enr);
      if (amount > 0) {
        lineItems.push({
          label: `${enr.classGroup.name}${ruleName ? ` (${ruleName})` : ""}`,
          amount: roundMoney(amount),
        });
      }
    }
  }
  const baseAmount = sumMoney(lineItems.map((l) => l.amount));

  const discounts = student.discounts
    .filter((d) => discountAppliesToMonth(d, yearMonth))
    .map((d) => (d.type === "PERCENT" ? roundMoney((baseAmount * d.value) / 100) : roundMoney(d.value)));
  const discountAmount = Math.min(sumMoney(discounts), baseAmount);
  const totalAmount = subtractMoney(baseAmount, discountAmount);

  return { baseAmount, discountAmount, totalAmount, lineItems };
}

/**
 * Crea o recalcula la cuota del mes. Nunca toca una cuota con cobros: su importe
 * ya se ha liquidado (total o parcialmente) y cambiarlo descuadraría los recibos.
 */
async function upsertStudentFeeForMonth(
  studentId: string,
  yearMonth: string,
  calc: Awaited<ReturnType<typeof calculateStudentMonthlyFee>>,
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
  const students = await prisma.student.findMany({
    where: { deletedAt: null, status: "ACTIVE" },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const existingFees = await prisma.studentFee.findMany({
    where: { yearMonth },
    include: { payments: { select: { id: true } } },
  });
  const feeByStudent = new Map(existingFees.map((f) => [f.studentId, f]));

  const rows: Array<{
    studentId: string;
    studentName: string;
    totalAmount: number;
    issue: FeeGenerateIssue;
    existingFeeId: string | null;
    amountPaid: number;
  }> = [];

  const calcs = new Map<string, Awaited<ReturnType<typeof calculateStudentMonthlyFee>>>();
  for (const student of students) {
    const calc = await calculateStudentMonthlyFee(student.id, yearMonth);
    calcs.set(student.id, calc);
    const existing = feeByStudent.get(student.id);
    let issue: FeeGenerateIssue = "ready";
    if (calc.totalAmount <= 0) issue = "no_amount";
    else if (existing && (existing.amountPaid > 0 || existing.payments.length > 0)) {
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
      totalEligibleAmount: sumMoney(eligible.map((r) => r.totalAmount)),
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
