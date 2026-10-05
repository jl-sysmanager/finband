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

function slotDurationHours(
  startTime: string,
  endTime: string,
  fallbackMinutes: number,
): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  let mins = eh! * 60 + em! - (sh! * 60 + sm!);
  if (mins <= 0) mins = fallbackMinutes;
  return mins / 60;
}

function weeksInMonth(yearMonth: string): number {
  const [y, m] = yearMonth.split("-").map(Number);
  const daysInMonth = new Date(y!, m!, 0).getDate();
  return daysInMonth / 7;
}

/** Sesiones e horas previstas en el mes según clases asignadas y franjas horarias. */
export function scheduleTotalsForMonth(
  classGroups: Array<{
    durationMinutes: number;
    scheduleSlots: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
  }>,
  yearMonth: string,
) {
  let sessionCount = 0;
  let totalHours = 0;
  const weekdays = new Set<number>();

  for (const group of classGroups) {
    for (const slot of group.scheduleSlots) {
      const occ = countWorkDaysInMonth(yearMonth, [slot.dayOfWeek]);
      sessionCount += occ;
      totalHours += occ * slotDurationHours(slot.startTime, slot.endTime, group.durationMinutes);
      weekdays.add(slot.dayOfWeek);
    }
  }

  const workDays = countWorkDaysInMonth(yearMonth, [...weekdays]);
  return { sessionCount, totalHours, workDays, classCount: classGroups.length };
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

  const schedule = scheduleTotalsForMonth(teacher.classGroups, yearMonth);
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
