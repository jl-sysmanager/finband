import {
  cancellationKey,
  monthBounds,
  scheduleTotalsInRange,
} from "./schedule-occurrences.js";
import { prisma } from "./prisma.js";

export type PayoutBasis =
  | "monthlySalary"
  | "costPerClass"
  | "hourlyRate"
  | "hourlyWeeklyEstimate"
  | "none";

export type PayoutCalculation = {
  baseAmount: number;
  transportAmount: number;
  workDays: number;
  amount: number;
  basis: PayoutBasis;
  sessionCount: number;
  totalHours: number;
};

/** Días laborables del mes según días de la semana ISO (1=lunes … 7=domingo). */
export function countWorkDaysInMonth(yearMonth: string, weekdays: number[]): number {
  if (weekdays.length === 0) return 0;
  const set = new Set(weekdays);
  const [y, m] = yearMonth.split("-").map(Number);
  const daysInMonth = new Date(y!, m!, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(y!, m! - 1, d);
    const iso = date.getDay() === 0 ? 7 : date.getDay();
    if (set.has(iso)) count++;
  }
  return count;
}

function weeksInMonth(yearMonth: string): number {
  const [y, m] = yearMonth.split("-").map(Number);
  const daysInMonth = new Date(y!, m!, 0).getDate();
  return daysInMonth / 7;
}

async function cancelledKeysForTeacher(teacherId: string, from: string, to: string) {
  const rows = await prisma.classScheduleCancellation.findMany({
    where: {
      sessionDate: { gte: from, lte: to },
      scheduleSlot: { classGroup: { teacherId } },
    },
  });
  return new Set(rows.map((r) => cancellationKey(r.scheduleSlotId, r.sessionDate)));
}

/** Sesiones e horas del mes según franjas, excluyendo suspensiones puntuales. */
export async function scheduleTotalsForMonth(
  classGroups: Array<{
    durationMinutes: number;
    scheduleSlots: Array<{ id: string; dayOfWeek: number; startTime: string; endTime: string }>;
  }>,
  yearMonth: string,
  teacherId: string,
) {
  const { from, to } = monthBounds(yearMonth);
  const cancelled = await cancelledKeysForTeacher(teacherId, from, to);
  return scheduleTotalsInRange(from, to, classGroups, cancelled);
}

export function computeBaseFromTeacherConfig(
  teacher: {
    monthlySalary: number | null;
    costPerClass: number | null;
    hourlyRate: number;
    weeklyHours: number | null;
  },
  schedule: { sessionCount: number; totalHours: number; classCount: number },
  yearMonth: string,
): { baseAmount: number; basis: PayoutBasis } {
  const salary = teacher.monthlySalary ?? 0;
  if (salary > 0) {
    return { baseAmount: salary, basis: "monthlySalary" };
  }

  const perClass = teacher.costPerClass ?? 0;
  if (perClass > 0) {
    const baseAmount =
      schedule.sessionCount > 0
        ? schedule.sessionCount * perClass
        : schedule.classCount * perClass * 4;
    return { baseAmount, basis: "costPerClass" };
  }

  if (teacher.hourlyRate > 0) {
    if (schedule.totalHours > 0) {
      return {
        baseAmount: schedule.totalHours * teacher.hourlyRate,
        basis: "hourlyRate",
      };
    }
    const weekly = teacher.weeklyHours ?? 0;
    if (weekly > 0) {
      return {
        baseAmount: teacher.hourlyRate * weekly * weeksInMonth(yearMonth),
        basis: "hourlyWeeklyEstimate",
      };
    }
  }

  return { baseAmount: 0, basis: "none" };
}

export async function calculateTeacherPayout(
  teacherId: string,
  yearMonth: string,
): Promise<PayoutCalculation> {
  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    include: {
      classGroups: {
        include: { scheduleSlots: true },
      },
    },
  });
  if (!teacher) {
    throw new Error("Profesor no encontrado");
  }

  const schedule = await scheduleTotalsForMonth(teacher.classGroups, yearMonth, teacherId);
  const { baseAmount, basis } = computeBaseFromTeacherConfig(teacher, schedule, yearMonth);

  const transportAmount = (teacher.transportCostPerDay ?? 0) * schedule.workDays;
  const amount = baseAmount + transportAmount;

  return {
    baseAmount,
    transportAmount,
    workDays: schedule.workDays,
    amount,
    basis,
    sessionCount: schedule.sessionCount,
    totalHours: schedule.totalHours,
  };
}
