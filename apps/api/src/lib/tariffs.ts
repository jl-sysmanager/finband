import type { ClassType, Student } from "@prisma/client";
import { prisma } from "./prisma.js";

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

export async function calculateStudentMonthlyFee(studentId: string): Promise<{
  baseAmount: number;
  discountAmount: number;
  totalAmount: number;
  lineItems: Array<{ label: string; amount: number }>;
}> {
  const student = await prisma.student.findFirst({
    where: { id: studentId, deletedAt: null },
    include: {
      enrollments: {
        where: { active: true },
        include: { classGroup: true },
      },
      discounts: { where: { active: true } },
    },
  });

  if (!student) {
    throw new Error("Alumno no encontrado");
  }

  const lineItems: Array<{ label: string; amount: number }> = [];
  let baseAmount = 0;

  if (student.monthlyFee != null && student.monthlyFee > 0) {
    baseAmount = student.monthlyFee;
    lineItems.push({ label: "Cuota fija", amount: student.monthlyFee });
  } else {
    for (const enr of student.enrollments) {
      const { amount, ruleName } = await resolveTariffAmount(student, enr);
      if (amount > 0) {
        baseAmount += amount;
        lineItems.push({
          label: `${enr.classGroup.name}${ruleName ? ` (${ruleName})` : ""}`,
          amount,
        });
      }
    }
  }

  const now = new Date();
  let discountAmount = 0;
  for (const d of student.discounts) {
    if (d.validFrom && d.validFrom > now) continue;
    if (d.validTo && d.validTo < now) continue;
    if (d.type === "PERCENT") {
      discountAmount += (baseAmount * d.value) / 100;
    } else {
      discountAmount += d.value;
    }
  }
  discountAmount = Math.min(discountAmount, baseAmount);
  const totalAmount = Math.max(0, baseAmount - discountAmount);

  return { baseAmount, discountAmount, totalAmount, lineItems };
}

export async function generateFeesForMonth(yearMonth: string): Promise<number> {
  const students = await prisma.student.findMany({
    where: { deletedAt: null, status: "ACTIVE" },
  });

  let created = 0;
  for (const student of students) {
    const calc = await calculateStudentMonthlyFee(student.id);
    if (calc.totalAmount <= 0) continue;

    const [y, m] = yearMonth.split("-").map(Number);
    const dueDate = new Date(y!, m!, 5);

    await prisma.studentFee.upsert({
      where: {
        studentId_yearMonth: { studentId: student.id, yearMonth },
      },
      create: {
        studentId: student.id,
        yearMonth,
        baseAmount: calc.baseAmount,
        discountAmount: calc.discountAmount,
        totalAmount: calc.totalAmount,
        lineItems: JSON.stringify(calc.lineItems),
        dueDate,
        status: "PENDING",
      },
      update: {
        baseAmount: calc.baseAmount,
        discountAmount: calc.discountAmount,
        totalAmount: calc.totalAmount,
        lineItems: JSON.stringify(calc.lineItems),
      },
    });
    created++;
  }
  return created;
}
