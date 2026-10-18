import { describe, expect, it } from "vitest";
import { cancellationKey, monthBounds, scheduleTotalsInRange } from "../src/lib/schedule-occurrences.js";
import { computeTeacherPayout, countWorkDaysInMonth } from "../src/lib/teacher-payout.js";

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
    expect(totals.totalMinutes).toBe(3 * 90 + 5 * 60);
    expect(totals.totalHours).toBe(3 * 1.5 + 5 * 1);
    expect(totals.workDays).toBe(8);
    expect(totals.classCount).toBe(1);
  });
});

// Liquidación a partir de las clases configuradas (importes en céntimos).
let n = 0;
function cls(
  slots: Array<{ dayOfWeek: number; startTime: string; endTime: string }>,
  opts: { durationMinutes?: number; startDate?: Date | null; deletedAt?: Date | null } = {},
) {
  n += 1;
  return {
    id: `c${n}`,
    name: `Clase ${n}`,
    durationMinutes: opts.durationMinutes ?? 60,
    startDate: opts.startDate ?? null,
    deletedAt: opts.deletedAt ?? null,
    scheduleSlots: slots.map((sl, i) => ({ id: `c${n}-s${i}`, ...sl })),
  };
}
const MON_17_18 = { dayOfWeek: 1, startTime: "17:00", endTime: "18:00" }; // 4 en octubre
const MON_18_1845 = { dayOfWeek: 1, startTime: "18:00", endTime: "18:45" };
const THU_18_19 = { dayOfWeek: 4, startTime: "18:00", endTime: "19:00" }; // 5 en octubre
const none = new Set<string>();

describe("liquidación según las clases configuradas", () => {
  it("salario mensual: importe fijo; el transporte cuenta los días con clase", () => {
    const r = computeTeacherPayout(
      { payMethod: "MONTHLY_SALARY", payRate: 120000, transportCostPerDay: 650 },
      [cls([MON_17_18, THU_18_19])],
      OCT,
      none,
    );
    expect(r).toMatchObject({ baseAmount: 120000, workDays: 9, transportAmount: 9 * 650, amount: 120000 + 9 * 650 });
    expect(r.classes[0]).toMatchObject({ sessions: 9, minutes: 540, amount: null });
    expect(r.warnings).toEqual([]);
  });

  it("precio por hora: minutos exactos del horario (clases de 45 min sin redondeos raros)", () => {
    const r = computeTeacherPayout(
      { payMethod: "HOURLY", payRate: 1800, transportCostPerDay: 0 },
      [cls([MON_18_1845])],
      OCT,
      none,
    );
    // 4 lunes × 45 min = 3 h × 18 € = 54 €
    expect(r).toMatchObject({ sessionCount: 4, totalMinutes: 180, baseAmount: 5400 });
  });

  it("precio por hora: si la franja no tiene fin válido usa la duración de la clase", () => {
    const r = computeTeacherPayout(
      { payMethod: "HOURLY", payRate: 2000, transportCostPerDay: 0 },
      [cls([{ dayOfWeek: 1, startTime: "17:00", endTime: "17:00" }], { durationMinutes: 30 })],
      OCT,
      none,
    );
    expect(r).toMatchObject({ totalMinutes: 4 * 30, baseAmount: 4000 });
  });

  it("coste por clase: sesiones del mes sin las suspendidas", () => {
    const c = cls([MON_17_18, THU_18_19]);
    const cancelled = new Set([cancellationKey(c.scheduleSlots[0]!.id, "2026-10-12")]);
    const r = computeTeacherPayout({ payMethod: "PER_CLASS", payRate: 2500, transportCostPerDay: 500 }, [c], OCT, cancelled);
    expect(r).toMatchObject({ sessionCount: 8, baseAmount: 8 * 2500, workDays: 8, transportAmount: 8 * 500 });
  });

  it("varias clases el mismo día: una sola jornada de transporte y el desglose suma la base", () => {
    const r = computeTeacherPayout(
      { payMethod: "HOURLY", payRate: 1999, transportCostPerDay: 400 },
      [cls([MON_17_18]), cls([MON_18_1845]), cls([THU_18_19])],
      OCT,
      none,
    );
    expect(r.workDays).toBe(9); // 4 lunes + 5 jueves, aunque los lunes haya dos clases
    expect(r.classes.map((l) => l.sessions)).toEqual([4, 4, 5]);
    expect(r.baseAmount).toBe(r.classes.reduce((t, l) => t + (l.amount ?? 0), 0));
  });

  it("una clase que empieza a mitad de mes solo cuenta desde su fecha de inicio", () => {
    // Inicio el miércoles 14 (fecha de calendario, medianoche UTC): cuentan los lunes 19 y 26.
    const r = computeTeacherPayout(
      { payMethod: "PER_CLASS", payRate: 3000, transportCostPerDay: 0 },
      [cls([MON_17_18], { startDate: new Date("2026-10-14T00:00:00Z") })],
      OCT,
      none,
    );
    expect(r).toMatchObject({ sessionCount: 2, baseAmount: 6000 });
  });

  it("sin fecha de inicio cuenta todo el mes; una clase borrada, hasta el día del borrado", () => {
    const r = computeTeacherPayout(
      { payMethod: "PER_CLASS", payRate: 1000, transportCostPerDay: 0 },
      [
        cls([MON_17_18], { deletedAt: new Date(2026, 9, 12, 20) }), // lunes 5 y 12
        cls([MON_17_18], { deletedAt: new Date(2026, 8, 30) }), // borrada en septiembre
        cls([MON_17_18], { startDate: new Date("2026-11-02T00:00:00Z") }), // empieza en noviembre
      ],
      OCT,
      none,
    );
    expect(r.classes).toHaveLength(1);
    expect(r).toMatchObject({ sessionCount: 2, baseAmount: 2000 });
  });

  it("sin sesiones o sin tarifa: base 0 y aviso (no se estima)", () => {
    const noClasses = computeTeacherPayout({ payMethod: "HOURLY", payRate: 2000, transportCostPerDay: 500 }, [], OCT, none);
    expect(noClasses).toMatchObject({ baseAmount: 0, amount: 0 });
    expect(noClasses.warnings).toEqual(["No tiene clases asignadas este mes: la base es 0."]);

    const noSlots = computeTeacherPayout(
      { payMethod: "PER_CLASS", payRate: 2000, transportCostPerDay: 0 },
      [cls([])],
      OCT,
      none,
    );
    expect(noSlots.warnings).toEqual(["Sus clases no tienen sesiones en el horario de este mes: la base es 0."]);

    const noRate = computeTeacherPayout(
      { payMethod: "MONTHLY_SALARY", payRate: 0, transportCostPerDay: 0 },
      [cls([MON_17_18])],
      OCT,
      none,
    );
    expect(noRate.warnings).toEqual(["El profesor no tiene tarifa de honorarios configurada."]);
  });
});
