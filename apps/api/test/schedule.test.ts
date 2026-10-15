import { describe, expect, it } from "vitest";
import { cancellationKey, monthBounds, scheduleTotalsInRange } from "../src/lib/schedule-occurrences.js";
import { computeBaseFromTeacherConfig, countWorkDaysInMonth } from "../src/lib/teacher-payout.js";

// Octubre 2026: empieza en jueves, 31 días → 4 lunes (5, 12, 19, 26) y 5 jueves.
const OCT = "2026-10";
const mondaySlot = { id: "s1", dayOfWeek: 1, startTime: "17:00", endTime: "18:30" };
const thursdaySlot = { id: "s2", dayOfWeek: 4, startTime: "18:00", endTime: "19:00" };

describe("calendario mensual", () => {
  it("calcula los límites del mes", () => {
    expect(monthBounds(OCT)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(monthBounds("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });

  it("cuenta días laborables por día de la semana", () => {
    expect(countWorkDaysInMonth(OCT, [1])).toBe(4);
    expect(countWorkDaysInMonth(OCT, [1, 4])).toBe(9);
    expect(countWorkDaysInMonth(OCT, [])).toBe(0);
  });

  it("suma sesiones y horas descontando suspensiones", () => {
    const { from, to } = monthBounds(OCT);
    const groups = [{ durationMinutes: 60, scheduleSlots: [mondaySlot, thursdaySlot] }];
    const cancelled = new Set([cancellationKey("s1", "2026-10-12")]);
    const totals = scheduleTotalsInRange(from, to, groups, cancelled);
    expect(totals.sessionCount).toBe(3 + 5);
    expect(totals.totalHours).toBe(3 * 1.5 + 5 * 1);
    expect(totals.workDays).toBe(8);
    expect(totals.classCount).toBe(1);
  });
});

describe("computeBaseFromTeacherConfig", () => {
  const schedule = { sessionCount: 8, totalHours: 10, classCount: 2 };
  const base = { monthlySalary: null, costPerClass: null, hourlyRate: 0, weeklyHours: null };

  it("prioriza el salario mensual", () => {
    expect(
      computeBaseFromTeacherConfig({ ...base, monthlySalary: 1200, costPerClass: 30 }, schedule, OCT),
    ).toEqual({ baseAmount: 1200, basis: "monthlySalary" });
  });

  it("coste por clase × sesiones del horario", () => {
    expect(computeBaseFromTeacherConfig({ ...base, costPerClass: 25 }, schedule, OCT)).toEqual({
      baseAmount: 200,
      basis: "costPerClass",
    });
  });

  it("coste por clase sin horario estima 4 sesiones por clase", () => {
    const empty = { sessionCount: 0, totalHours: 0, classCount: 2 };
    expect(computeBaseFromTeacherConfig({ ...base, costPerClass: 25 }, empty, OCT).baseAmount).toBe(200);
  });

  it("tarifa por hora × horas del horario", () => {
    expect(computeBaseFromTeacherConfig({ ...base, hourlyRate: 18 }, schedule, OCT)).toEqual({
      baseAmount: 180,
      basis: "hourlyRate",
    });
  });

  it("tarifa por hora sin horario usa horas semanales, redondeado a céntimos", () => {
    const empty = { sessionCount: 0, totalHours: 0, classCount: 0 };
    const r = computeBaseFromTeacherConfig({ ...base, hourlyRate: 15, weeklyHours: 10 }, empty, OCT);
    expect(r.basis).toBe("hourlyWeeklyEstimate");
    expect(r.baseAmount).toBe(664.29); // 15 × 10 × 31/7
  });

  it("sin configuración no hay importe", () => {
    expect(computeBaseFromTeacherConfig(base, schedule, OCT)).toEqual({ baseAmount: 0, basis: "none" });
  });
});
