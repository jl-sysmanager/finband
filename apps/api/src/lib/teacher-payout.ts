import type { PayMethod } from "@prisma/client";
import { calendarDateOf, localIsoDate } from "./dates.js";
import { roundCents } from "./money.js";
import { prisma } from "./prisma.js";
import {
  cancellationKey,
  monthBounds,
  scheduleTotalsInRange,
  type ScheduleGroupInput,
} from "./schedule-occurrences.js";

/*
 * Liquidación mensual de un profesor (importes en céntimos):
 *   base       según su único método de honorarios
 *                - Salario mensual: la tarifa, fija.
 *                - Precio por hora: tarifa × horas de sus clases en el mes.
 *                - Coste por clase: tarifa × sesiones de sus clases en el mes.
 *   transporte tarifa por jornada × días del mes con al menos una clase.
 *
 * Las sesiones salen del horario semanal de las clases que tiene asignadas, sin las
 * sesiones suspendidas, ni los días anteriores a su fecha de inicio ni posteriores a
 * su borrado. Si no hay sesiones, la base por hora o por clase es 0 (no se estima).
 */

export type PayoutClassLine = {
  classId: string;
  name: string;
  sessions: number;
  minutes: number;
  /** Importe de la clase (por hora o por clase); null con salario mensual. */
  amount: number | null;
};

export type PayoutCalculation = {
  payMethod: PayMethod;
  payRate: number;
  baseAmount: number;
  transportAmount: number;
  workDays: number;
  amount: number;
  sessionCount: number;
  totalMinutes: number;
  totalHours: number;
  classes: PayoutClassLine[];
  /** Aviso para revisar la configuración (sin tarifa, sin sesiones…). */
  warnings: string[];
};

type TeacherConfig = { payMethod: PayMethod; payRate: number; transportCostPerDay: number };

type ClassGroupRow = ScheduleGroupInput & {
  id: string;
  name: string;
  startDate: Date | null;
  deletedAt: Date | null;
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

/** Cálculo puro a partir de la configuración del profesor y sus clases. */
export function computeTeacherPayout(
  teacher: TeacherConfig,
  classGroups: ClassGroupRow[],
  yearMonth: string,
  cancelled: Set<string>,
): PayoutCalculation {
  const { from, to } = monthBounds(yearMonth);
  const groups = classGroups
    .map((g) => ({
      ...g,
      activeFrom: g.startDate ? calendarDateOf(g.startDate) : null,
      activeUntil: g.deletedAt ? localIsoDate(g.deletedAt) : null,
    }))
    // Fuera las clases que no existieron en ningún día del mes.
    .filter((g) => (!g.activeFrom || g.activeFrom <= to) && (!g.activeUntil || g.activeUntil >= from));

  const schedule = scheduleTotalsInRange(from, to, groups, cancelled);
  const { payMethod, payRate } = teacher;

  const lineAmount = (sessions: number, minutes: number) => {
    if (payMethod === "HOURLY") return roundCents((payRate * minutes) / 60);
    if (payMethod === "PER_CLASS") return payRate * sessions;
    return null;
  };
  const classes: PayoutClassLine[] = schedule.perGroup.map(({ group, sessions, minutes }) => ({
    classId: group.id!,
    name: group.name!,
    sessions,
    minutes,
    amount: lineAmount(sessions, minutes),
  }));

  // La base es la suma de las líneas por clase, para que el desglose cuadre al céntimo.
  const baseAmount =
    payMethod === "MONTHLY_SALARY"
      ? payRate
      : classes.reduce((t, c) => t + (c.amount ?? 0), 0);
  const transportAmount = teacher.transportCostPerDay * schedule.workDays;

  const warnings: string[] = [];
  if (payRate <= 0) warnings.push("El profesor no tiene tarifa de honorarios configurada.");
  if (payMethod !== "MONTHLY_SALARY" && schedule.sessionCount === 0) {
    warnings.push(
      groups.length === 0
        ? "No tiene clases asignadas este mes: la base es 0."
        : "Sus clases no tienen sesiones en el horario de este mes: la base es 0.",
    );
  }

  return {
    payMethod,
    payRate,
    baseAmount,
    transportAmount,
    workDays: schedule.workDays,
    amount: baseAmount + transportAmount,
    sessionCount: schedule.sessionCount,
    totalMinutes: schedule.totalMinutes,
    totalHours: schedule.totalHours,
    classes,
    warnings,
  };
}

/**
 * Liquidaciones del mes de varios profesores con dos consultas en total
 * (profesores con sus clases y horarios, y suspensiones del mes).
 * `"active"` = todos los profesores no borrados.
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
      include: { classGroups: { include: { scheduleSlots: true }, orderBy: { name: "asc" } } },
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

  return new Map(
    rows.map((teacher) => [
      teacher.id,
      computeTeacherPayout(teacher, teacher.classGroups, yearMonth, cancelled),
    ]),
  );
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
