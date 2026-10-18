import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  adminClient,
  createClass,
  createStudent,
  createTeacher,
  eur,
  prisma,
  type TestClient,
} from "./helpers.js";

const YM = "2026-10";
let client: TestClient;

beforeAll(async () => {
  client = await adminClient();
});
afterAll(() => client.close());
beforeEach(async () => {
  await prisma.studentPayment.deleteMany();
  await prisma.studentFee.deleteMany();
  await prisma.teacherPayoutPayment.deleteMany();
  await prisma.teacherPayout.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.classScheduleSlot.deleteMany();
  await prisma.classGroup.deleteMany();
  await prisma.student.deleteMany();
  await prisma.teacher.deleteMany();
});

describe("generación de cuotas por selección", () => {
  it("solo genera las de los alumnos elegidos", async () => {
    const [a, b, c] = await Promise.all([
      createStudent({ monthlyFee: eur(40) }),
      createStudent({ monthlyFee: eur(50) }),
      createStudent({ monthlyFee: eur(60) }),
    ]);
    const res = await client.request("POST", "/tariffs/generate-month", {
      yearMonth: YM,
      studentIds: [a.id, c.id],
    });
    expect(res.body).toMatchObject({ generated: 2, skipped: 0 });
    const fees = await prisma.studentFee.findMany({ where: { yearMonth: YM } });
    expect(fees.map((f) => f.studentId).sort()).toEqual([a.id, c.id].sort());
    expect(fees.some((f) => f.studentId === b.id)).toBe(false);
  });

  it("un alumno elegido que ya no se puede generar cuenta como omitido", async () => {
    const withPayment = await createStudent({ monthlyFee: eur(40) });
    const fee = await prisma.studentFee.create({
      data: { studentId: withPayment.id, yearMonth: YM, baseAmount: eur(40), totalAmount: eur(40), amountPaid: eur(10) },
    });
    await prisma.studentPayment.create({ data: { feeId: fee.id, amount: eur(10), method: "EFECTIVO" } });
    const gone = await createStudent({ monthlyFee: eur(40), status: "INACTIVE" });
    const res = await client.request("POST", "/tariffs/generate-month", {
      yearMonth: YM,
      studentIds: [withPayment.id, gone.id],
    });
    expect(res.body).toMatchObject({ generated: 0, skipped: 2 });
  });
});

describe("generación de liquidaciones por selección", () => {
  it("la vista previa indica importe y si se puede generar", async () => {
    const salary = await createTeacher({ firstName: "Ana", lastName: "Sal", payMethod: "MONTHLY_SALARY", payRate: eur(1000) });
    const perClass = await createTeacher({ firstName: "Bea", lastName: "Cla", payMethod: "PER_CLASS", payRate: eur(25) });
    await createClass(perClass.id, { slots: [{ dayOfWeek: 1, startTime: "17:00", endTime: "18:00" }] });
    const noClasses = await createTeacher({ firstName: "Ciro", lastName: "Nada", payMethod: "HOURLY", payRate: eur(20) });
    const paid = await createTeacher({ firstName: "Dani", lastName: "Pag", payMethod: "MONTHLY_SALARY", payRate: eur(500) });
    const payout = await prisma.teacherPayout.create({
      data: { teacherId: paid.id, yearMonth: YM, amount: eur(500), amountPaid: eur(100) },
    });
    await prisma.teacherPayoutPayment.create({ data: { payoutId: payout.id, amount: eur(100) } });

    const preview = await client.request("POST", "/payments/teacher-payouts/generate/preview", { yearMonth: YM });
    expect(preview.status).toBe(200);
    const row = (id: string) => preview.body.rows.find((r: { teacherId: string }) => r.teacherId === id);
    expect(row(salary.id)).toMatchObject({ issue: "ready", amount: 1000, payMethod: "MONTHLY_SALARY" });
    expect(row(perClass.id)).toMatchObject({ issue: "ready", amount: 100, sessionCount: 4 });
    expect(row(noClasses.id)).toMatchObject({ issue: "no_amount", amount: 0 });
    expect(row(noClasses.id).warnings[0]).toMatch(/no tiene clases/i);
    expect(row(paid.id)).toMatchObject({ issue: "has_payments", amountPaid: 100 });
    expect(preview.body.summary).toMatchObject({ teachers: 4, eligible: 2, totalEligibleAmount: 1100 });
  });

  it("solo genera las de los profesores elegidos y respeta las que tienen pagos", async () => {
    const a = await createTeacher({ payMethod: "MONTHLY_SALARY", payRate: eur(900) });
    const b = await createTeacher({ payMethod: "MONTHLY_SALARY", payRate: eur(800) });
    const c = await createTeacher({ payMethod: "MONTHLY_SALARY", payRate: eur(700) });
    const payout = await prisma.teacherPayout.create({
      data: { teacherId: c.id, yearMonth: YM, amount: eur(600), amountPaid: eur(100) },
    });
    await prisma.teacherPayoutPayment.create({ data: { payoutId: payout.id, amount: eur(100) } });

    const res = await client.request("POST", "/payments/teacher-payouts/generate", {
      yearMonth: YM,
      teacherIds: [a.id, c.id],
    });
    expect(res.body).toMatchObject({ generated: 1, skippedWithPayments: 1, skippedNoAmount: 0 });
    const payouts = await prisma.teacherPayout.findMany({ where: { yearMonth: YM } });
    expect(payouts.find((p) => p.teacherId === a.id)?.amount).toBe(eur(900));
    expect(payouts.some((p) => p.teacherId === b.id)).toBe(false);
    expect(payouts.find((p) => p.teacherId === c.id)?.amount).toBe(eur(600)); // con pagos: no se recalcula
    expect(await prisma.auditLog.count({ where: { action: "GENERATE_PAYOUTS" } })).toBeGreaterThan(0);
  });

  it("rechaza un cuerpo inválido", async () => {
    expect((await client.request("POST", "/payments/teacher-payouts/generate", { yearMonth: "oct" })).status).toBe(400);
    expect(
      (await client.request("POST", "/payments/teacher-payouts/generate", { yearMonth: YM, teacherIds: "x" })).status,
    ).toBe(400);
  });
});
