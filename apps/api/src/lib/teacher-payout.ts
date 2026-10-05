import { prisma } from "./prisma.js";

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

export async function calculateTeacherPayout(
  teacherId: string,
  yearMonth: string,
): Promise<{
  baseAmount: number;
  transportAmount: number;
  workDays: number;
  amount: number;
}> {
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

  let baseAmount = teacher.monthlySalary ?? 0;
  if (!baseAmount && teacher.costPerClass) {
    const classes = teacher.classGroups.length;
    baseAmount = teacher.costPerClass * classes * 4;
  }
  if (!baseAmount && teacher.hourlyRate && teacher.weeklyHours) {
    baseAmount = teacher.hourlyRate * teacher.weeklyHours * 4;
  }

  const weekdays = [
    ...new Set(
      teacher.classGroups.flatMap((g) => g.scheduleSlots.map((s) => s.dayOfWeek)),
    ),
  ].sort((a, b) => a - b);

  const workDays = countWorkDaysInMonth(yearMonth, weekdays);
  const transportAmount = (teacher.transportCostPerDay ?? 0) * workDays;
  const amount = baseAmount + transportAmount;

  return { baseAmount, transportAmount, workDays, amount };
}
