import { beforeEach, describe, expect, it } from "vitest";
import {
  calculateStudentMonthlyFee,
  FeeHasPaymentsError,
  generateFeeForStudent,
  generateFeesForMonth,
  previewFeesForMonth,
} from "../src/lib/tariffs.js";
import { createClass, createStudent, createTeacher, enroll, eur, prisma, resetDb } from "./helpers.js";

const YM = "2026-10";

beforeEach(resetDb);

async function studentInClass(
  student: Parameters<typeof createStudent>[0] = {},
  type: "INDIVIDUAL" | "COLECTIVA" | "LENGUAJE" = "INDIVIDUAL",
) {
  const teacher = await createTeacher();
  const s = await createStudent(student);
  const c = await createClass(teacher.id, { type });
  await enroll(s.id, c.id);
  return s;
}

describe("calculateStudentMonthlyFee", () => {
  it("usa la cuota fija del alumno si existe", async () => {
    const s = await studentInClass({ monthlyFee: eur(55) });
    await prisma.tariffRule.create({ data: { name: "General", amount: eur(40) } });
    const fee = await calculateStudentMonthlyFee(s.id, YM);
    expect(fee).toMatchObject({ baseAmount: eur(55), discountAmount: eur(0), totalAmount: eur(55) });
  });

  it("elige la tarifa más específica por matrícula y suma varias clases", async () => {
    const teacher = await createTeacher();
    const s = await createStudent({ mainInstrument: "Piano", level: "Elemental" });
    const piano = await createClass(teacher.id, { type: "INDIVIDUAL" });
    const lenguaje = await createClass(teacher.id, { type: "LENGUAJE" });
    await enroll(s.id, piano.id);
    await enroll(s.id, lenguaje.id);
    await prisma.tariffRule.createMany({
      data: [
        { name: "General", amount: eur(30) },
        { name: "Individual", classType: "INDIVIDUAL", amount: eur(45) },
        { name: "Piano individual", instrument: "Piano", classType: "INDIVIDUAL", amount: eur(60) },
        { name: "Violín", instrument: "Violín", amount: eur(99) },
        { name: "Inactiva", classType: "LENGUAJE", amount: eur(500), active: false },
      ],
    });
    const fee = await calculateStudentMonthlyFee(s.id, YM);
    expect(fee.baseAmount).toBe(eur(90));
    expect(fee.lineItems.map((l) => l.amount).sort()).toEqual([eur(30), eur(60)]);
  });

  it("aplica descuentos porcentuales y fijos, redondeados y sin superar la base", async () => {
    const s = await studentInClass({ monthlyFee: eur(47) });
    await prisma.studentDiscount.createMany({
      data: [
        { studentId: s.id, name: "Hermanos", type: "PERCENT", value: 1500 },
        { studentId: s.id, name: "Cheque", type: "FIXED", value: eur(3.33) },
      ],
    });
    const fee = await calculateStudentMonthlyFee(s.id, YM);
    expect(fee.discountAmount).toBe(eur(10.38)); // 7,05 + 3,33
    expect(fee.totalAmount).toBe(eur(36.62));

    await prisma.studentDiscount.create({
      data: { studentId: s.id, name: "Beca total", type: "FIXED", value: eur(100) },
    });
    const capped = await calculateStudentMonthlyFee(s.id, YM);
    expect(capped).toMatchObject({ discountAmount: eur(47), totalAmount: eur(0) });
  });

  it("aplica los descuentos vigentes en el mes de la cuota, no en la fecha de hoy", async () => {
    const s = await studentInClass({ monthlyFee: eur(100) });
    await prisma.studentDiscount.create({
      data: {
        studentId: s.id,
        name: "Promo 1er trimestre 2026-27",
        type: "PERCENT",
        value: 5000, // 50 % en centésimas
        validFrom: new Date("2026-09-01"),
        validTo: new Date("2026-12-31"),
      },
    });
    expect((await calculateStudentMonthlyFee(s.id, "2026-08")).totalAmount).toBe(eur(100));
    expect((await calculateStudentMonthlyFee(s.id, "2026-09")).totalAmount).toBe(eur(50));
    expect((await calculateStudentMonthlyFee(s.id, "2026-12")).totalAmount).toBe(eur(50));
    expect((await calculateStudentMonthlyFee(s.id, "2027-01")).totalAmount).toBe(eur(100));
  });

  it("falla con un alumno inexistente o borrado", async () => {
    const s = await createStudent({ deletedAt: new Date() });
    await expect(calculateStudentMonthlyFee(s.id, YM)).rejects.toThrow();
    await expect(calculateStudentMonthlyFee("nope", YM)).rejects.toThrow();
  });
});

describe("generación de cuotas", () => {
  it("genera la cuota del mes como PENDIENTE", async () => {
    const s = await studentInClass({ monthlyFee: eur(50) });
    await generateFeeForStudent(s.id, YM);
    const fee = await prisma.studentFee.findUniqueOrThrow({
      where: { studentId_yearMonth: { studentId: s.id, yearMonth: YM } },
    });
    expect(fee).toMatchObject({ totalAmount: eur(50), amountPaid: eur(0), status: "PENDING" });
  });

  it("no regenera individualmente una cuota que ya tiene cobros", async () => {
    const s = await studentInClass({ monthlyFee: eur(50) });
    await generateFeeForStudent(s.id, YM);
    const fee = await prisma.studentFee.findFirstOrThrow({ where: { studentId: s.id } });
    await prisma.studentPayment.create({ data: { feeId: fee.id, amount: eur(50), method: "EFECTIVO" } });
    await prisma.studentFee.update({ where: { id: fee.id }, data: { amountPaid: eur(50), status: "PAID" } });

    await prisma.student.update({ where: { id: s.id }, data: { monthlyFee: eur(80) } });
    await expect(generateFeeForStudent(s.id, YM)).rejects.toBeInstanceOf(FeeHasPaymentsError);
    const after = await prisma.studentFee.findUniqueOrThrow({ where: { id: fee.id } });
    expect(after).toMatchObject({ totalAmount: eur(50), status: "PAID" });
  });

  it("al regenerar una cuota sin cobros recalcula importe y estado", async () => {
    const s = await studentInClass({ monthlyFee: eur(50) });
    await generateFeeForStudent(s.id, YM);
    await prisma.student.update({ where: { id: s.id }, data: { monthlyFee: eur(65) } });
    await generateFeeForStudent(s.id, YM);
    const fee = await prisma.studentFee.findFirstOrThrow({ where: { studentId: s.id } });
    expect(fee).toMatchObject({ totalAmount: eur(65), status: "PENDING" });
  });

  it("la generación mensual omite alumnos sin importe, con cobros o excluidos", async () => {
    const ready = await studentInClass({ monthlyFee: eur(40) });
    const excluded = await studentInClass({ monthlyFee: eur(40) });
    await studentInClass({}); // sin tarifa → sin importe
    const paid = await studentInClass({ monthlyFee: eur(40) });
    await createStudent({ monthlyFee: eur(40), status: "INACTIVE" });

    await generateFeeForStudent(paid.id, YM);
    const paidFee = await prisma.studentFee.findFirstOrThrow({ where: { studentId: paid.id } });
    await prisma.studentPayment.create({ data: { feeId: paidFee.id, amount: eur(10), method: "BIZUM" } });
    await prisma.studentFee.update({ where: { id: paidFee.id }, data: { amountPaid: eur(10), status: "PARTIAL" } });

    const preview = await previewFeesForMonth(YM);
    expect(preview.summary).toMatchObject({
      activeStudents: 4,
      eligible: 2,
      skippedNoAmount: 1,
      skippedHasPayments: 1,
      totalEligibleAmount: eur(80),
    });

    const result = await generateFeesForMonth(YM, { excludeStudentIds: [excluded.id] });
    expect(result).toEqual({ generated: 1, skipped: 3 });
    const fees = await prisma.studentFee.findMany({ where: { yearMonth: YM } });
    expect(fees.map((f) => f.studentId).sort()).toEqual([paid.id, ready.id].sort());
  });

  it("la generación mensual aplica los descuentos del mes generado", async () => {
    const s = await studentInClass({ monthlyFee: eur(100) });
    await prisma.studentDiscount.create({
      data: {
        studentId: s.id,
        name: "Solo septiembre",
        type: "FIXED",
        value: eur(20),
        validFrom: new Date("2026-09-01"),
        validTo: new Date("2026-09-30"),
      },
    });
    await generateFeesForMonth("2026-09");
    await generateFeesForMonth("2026-10");
    const fees = await prisma.studentFee.findMany({ orderBy: { yearMonth: "asc" } });
    expect(fees.map((f) => [f.yearMonth, f.totalAmount])).toEqual([
      ["2026-09", eur(80)],
      ["2026-10", eur(100)],
    ]);
  });
});

describe("vencimiento", () => {
  it("la cuota de un mes vence el día 5 de ese mismo mes", async () => {
    const s = await studentInClass({ monthlyFee: eur(50) });
    await generateFeeForStudent(s.id, "2026-12");
    const fee = await prisma.studentFee.findFirstOrThrow({ where: { studentId: s.id } });
    expect([fee.dueDate!.getFullYear(), fee.dueDate!.getMonth() + 1, fee.dueDate!.getDate()]).toEqual([
      2026, 12, 5,
    ]);
  });
});
