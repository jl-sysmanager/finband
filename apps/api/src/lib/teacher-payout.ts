import {
  cancellationKey,
  monthBounds,
  scheduleTotalsInRange,
} from "./schedule-occurrences.js";
import { localIsoDate } from "./dates.js";
import { roundCents } from "./money.js";
import { prisma } from "./prisma.js";

export type PayoutBasis =
  | "monthlySalary"
  | "costPerClass"
  | "hourlyRate"
  | "hourlyWeeklyEstimate"
  | "none";

/** Importes en céntimos. */
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

type ScheduleGroup = {
  durationMinutes: number;
  deletedAt?: Date | null;
  scheduleSlots: Array<{ id: string; dayOfWeek: number; startTime: string; endTime: string }>;
};

/** Sesiones e horas del mes según franjas, excluyendo suspensiones puntuales. */
function scheduleTotalsForMonth(classGroups: ScheduleGroup[], yearMonth: string, cancelled: Set<string>) {
  const { from, to } = monthBounds(yearMonth);
  // Una clase borrada cuenta hasta el día en que se borró (incluido).
  const groups = classGroups
    .map((g) => ({ ...g, activeUntil: g.deletedAt ? localIsoDate(g.deletedAt) : null }))
    .filter((g) => !g.activeUntil || g.activeUntil >= from);
  return scheduleTotalsInRange(from, to, groups, cancelled);
}

/** Base de la liquidación en céntimos a partir de las tarifas del profesor (en céntimos). */
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
        baseAmount: roundCents(schedule.totalHours * teacher.hourlyRate),
        basis: "hourlyRate",
      };
    }
    const weekly = teacher.weeklyHours ?? 0;
    if (weekly > 0) {
      return {
        baseAmount: roundCents(teacher.hourlyRate * weekly * weeksInMonth(yearMonth)),
        basis: "hourlyWeeklyEstimate",
      };
    }
  }

  return { baseAmount: 0, basis: "none" };
}

/**
 * Liquidaciones del mes de varios profesores con dos consultas en total
 * (profesores con horarios y suspensiones del mes). `"active"` = todos los no borrados.
 */
export async function calculateTeacherPayouts(
  teachers: string[] | "active",
  yearMonth: string,
): Promise<Map<string, PayoutCalculation>> {
  const { from, to } = monthBounds(yearMonth);
  const where = teachers === "active" ? { deletedAt: null } : { id: { in: teachers } };
  const [rows, cancellations] = await Promise.all([
    prisma.teacher.findMany({
      where,
      include: { classGroups: { include: { scheduleSlots: true } } },
    }),
    prisma.classScheduleCancellation.findMany({
      where: {
        sessionDate: { gte: from, lte: to },
        scheduleSlot: { classGroup: { teacher: where } },
      },
      select: { scheduleSlotId: true, sessionDate: true },
    }),
  ]);
  // Las claves llevan el id de la franja, así que un único conjunto sirve para todos.
  const cancelled = new Set(cancellations.map((c) => cancellationKey(c.scheduleSlotId, c.sessionDate)));

  const result = new Map<string, PayoutCalculation>();
  for (const teacher of rows) {
    const schedule = scheduleTotalsForMonth(teacher.classGroups, yearMonth, cancelled);
    const { baseAmount, basis } = computeBaseFromTeacherConfig(teacher, schedule, yearMonth);
    const transportAmount = teacher.transportCostPerDay * schedule.workDays;
    result.set(teacher.id, {
      baseAmount,
      transportAmount,
      workDays: schedule.workDays,
      amount: baseAmount + transportAmount,
      basis,
      sessionCount: schedule.sessionCount,
      totalHours: schedule.totalHours,
    });
  }
  return result;
}

export async function calculateTeacherPayout(
  teacherId: string,
  yearMonth: string,
): Promise<PayoutCalculation> {
  const calc = (await calculateTeacherPayouts([teacherId], yearMonth)).get(teacherId);
  if (!calc) {
    throw new Error("Profesor no encontrado");
  }
  return calc;
}
