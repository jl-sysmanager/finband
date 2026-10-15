import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  adminClient,
  createClass,
  createStudent,
  createTeacher,
  enroll,
  eur,
  prisma,
  resetDb,
  type TestClient,
} from "./helpers.js";

const YM = "2026-10";
let client: TestClient;

beforeAll(async () => {
  await resetDb();
  client = await adminClient();
});
afterAll(() => client.close());

beforeEach(async () => {
  await prisma.studentPayment.deleteMany();
  await prisma.studentFee.deleteMany();
  await prisma.teacherPayoutPayment.deleteMany();
  await prisma.teacherPayout.deleteMany();
});

async function feeOf(total: number) {
  const teacher = await createTeacher();
  const s = await createStudent({ monthlyFee: eur(total) });
  const c = await createClass(teacher.id);
  await enroll(s.id, c.id);
  const res = await client.request("POST", `/students/${s.id}/generate-fee`, { yearMonth: YM });
  expect(res.status).toBe(200);
  return prisma.studentFee.findFirstOrThrow({ where: { studentId: s.id } });
}

const pay = (feeId: string, amount: number) =>
  client.request("POST", "/payments/student-payments", { feeId, amount, method: "EFECTIVO" });

const reload = (feeId: string) => prisma.studentFee.findUniqueOrThrow({ where: { id: feeId } });

describe("cobros de cuotas", () => {
  it("un cobro parcial y otro final dejan la cuota PAGADA", async () => {
    const fee = await feeOf(60);
    expect((await pay(fee.id, 25)).status).toBe(200);
    expect(await reload(fee.id)).toMatchObject({ amountPaid: eur(25), status: "PARTIAL" });
    expect((await pay(fee.id, 35)).status).toBe(200);
    expect(await reload(fee.id)).toMatchObject({ amountPaid: eur(60), status: "PAID" });
  });

  it("tres cobros de 10,10 € saldan una cuota de 30,30 €", async () => {
    const fee = await feeOf(30.3);
    for (let i = 0; i < 3; i++) expect((await pay(fee.id, 10.1)).status).toBe(200);
    expect(await reload(fee.id)).toMatchObject({ amountPaid: eur(30.3), status: "PAID" });
  });

  it("rechaza un cobro que supera lo pendiente", async () => {
    const fee = await feeOf(40);
    await pay(fee.id, 30);
    const res = await pay(fee.id, 10.01);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/pendiente/i);
    expect(await prisma.studentPayment.count({ where: { feeId: fee.id } })).toBe(1);
  });

  it("rechaza importes con más de dos decimales", async () => {
    const fee = await feeOf(40);
    expect((await pay(fee.id, 10.005)).status).toBe(400);
  });

  it("editar un cobro recalcula la cuota y no permite superar el total", async () => {
    const fee = await feeOf(50);
    const p = (await pay(fee.id, 50)).body;
    expect((await reload(fee.id)).status).toBe("PAID");

    const lower = await client.request("PATCH", `/payments/student-payments/${p.id}`, { amount: 20 });
    expect(lower.status).toBe(200);
    expect(await reload(fee.id)).toMatchObject({ amountPaid: eur(20), status: "PARTIAL" });

    const over = await client.request("PATCH", `/payments/student-payments/${p.id}`, { amount: 50.5 });
    expect(over.status).toBe(400);
    expect((await reload(fee.id)).amountPaid).toBe(eur(20));
  });

  it("borrar un cobro devuelve la cuota a PENDIENTE", async () => {
    const fee = await feeOf(50);
    const p = (await pay(fee.id, 50)).body;
    expect((await client.request("DELETE", `/payments/student-payments/${p.id}`)).status).toBe(200);
    expect(await reload(fee.id)).toMatchObject({ amountPaid: eur(0), status: "PENDING" });
  });

  it("cobros simultáneos no superan el total de la cuota", async () => {
    const fee = await feeOf(50);
    const results = await Promise.all([pay(fee.id, 30), pay(fee.id, 30), pay(fee.id, 30)]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await reload(fee.id)).toMatchObject({ amountPaid: eur(30), status: "PARTIAL" });
  });

  it("generar de nuevo una cuota con cobros devuelve 409", async () => {
    const fee = await feeOf(50);
    await pay(fee.id, 10);
    const res = await client.request("POST", `/students/${fee.studentId}/generate-fee`, { yearMonth: YM });
    expect(res.status).toBe(409);
  });

  it("los cobros quedan en la auditoría", async () => {
    const fee = await feeOf(50);
    const p = (await pay(fee.id, 10)).body;
    await client.request("PATCH", `/payments/student-payments/${p.id}`, { amount: 12 });
    const actions = await prisma.auditLog.findMany({
      where: { entityType: "student_payment", entityId: p.id },
      orderBy: { createdAt: "asc" },
    });
    expect(actions.map((a) => a.action)).toEqual(["CREATE", "UPDATE"]);
  });
});

describe("liquidaciones de profesores", () => {
  async function payoutFor(monthlySalary: number) {
    const t = await createTeacher({ monthlySalary: eur(monthlySalary) });
    const gen = await client.request("POST", "/payments/teacher-payouts/generate", {
      yearMonth: YM,
      teacherId: t.id,
    });
    expect(gen.status).toBe(200);
    return prisma.teacherPayout.findFirstOrThrow({ where: { teacherId: t.id } });
  }
  const payPayout = (payoutId: string, amount: number) =>
    client.request("POST", "/payments/teacher-payouts/pay", { payoutId, amount });

  it("pagos parciales hasta saldar", async () => {
    const p = await payoutFor(1000);
    expect((await payPayout(p.id, 400)).body).toMatchObject({ amountPaid: 400, status: "PARTIAL" });
    expect((await payPayout(p.id, 600)).body).toMatchObject({ amountPaid: 1000, status: "PAID" });
  });

  it("rechaza pagar más de lo pendiente", async () => {
    const p = await payoutFor(1000);
    await payPayout(p.id, 900);
    const res = await payPayout(p.id, 100.01);
    expect(res.status).toBe(400);
    expect((await prisma.teacherPayout.findUniqueOrThrow({ where: { id: p.id } })).amountPaid).toBe(eur(900));
  });

  it("pagos simultáneos no superan el total", async () => {
    const p = await payoutFor(1000);
    const results = await Promise.all([payPayout(p.id, 600), payPayout(p.id, 600)]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect((await prisma.teacherPayout.findUniqueOrThrow({ where: { id: p.id } })).amountPaid).toBe(eur(600));
  });

  it("cada pago queda en el historial y borrarlo recalcula lo pagado", async () => {
    const p = await payoutFor(1000);
    await payPayout(p.id, 300);
    const second = await client.request("POST", "/payments/teacher-payouts/pay", {
      payoutId: p.id,
      amount: 200,
      paidAt: "2026-10-20",
    });
    expect(second.body.payments).toHaveLength(2);
    expect(second.body).toMatchObject({ amountPaid: 500, status: "PARTIAL" });

    const toDelete = second.body.payments.find((x: { amount: number }) => x.amount === 300);
    const after = await client.request("DELETE", `/payments/teacher-payout-payments/${toDelete.id}`);
    expect(after.status).toBe(200);
    expect(after.body).toMatchObject({ amountPaid: 200, status: "PARTIAL" });
    expect(after.body.payments).toHaveLength(1);
  });

  it("anular los pagos los borra todos; no se puede fijar otro importe pagado a mano", async () => {
    const p = await payoutFor(1000);
    await payPayout(p.id, 400);
    await payPayout(p.id, 100);
    const bad = await client.request("PATCH", `/payments/teacher-payouts/${p.id}`, { amountPaid: 250 });
    expect(bad.status).toBe(400);

    const voided = await client.request("PATCH", `/payments/teacher-payouts/${p.id}`, { amountPaid: 0 });
    expect(voided.body).toMatchObject({ amountPaid: 0, status: "PENDING", paidAt: null });
    expect(await prisma.teacherPayoutPayment.count({ where: { payoutId: p.id } })).toBe(0);
  });

  it("una liquidación con pagos no se recalcula", async () => {
    const p = await payoutFor(1000);
    await payPayout(p.id, 800);
    await prisma.teacher.update({ where: { id: p.teacherId }, data: { monthlySalary: eur(700) } });

    const single = await client.request("POST", "/payments/teacher-payouts/generate", {
      yearMonth: YM,
      teacherId: p.teacherId,
    });
    expect(single.status).toBe(409);
    const bulk = await client.request("POST", "/payments/teacher-payouts/generate", { yearMonth: YM });
    expect(bulk.body.skippedWithPayments).toBeGreaterThanOrEqual(1);

    const after = await prisma.teacherPayout.findUniqueOrThrow({ where: { id: p.id } });
    expect(after).toMatchObject({ amount: eur(1000), amountPaid: eur(800), status: "PARTIAL" });
  });

  it("una liquidación sin pagos sí se recalcula", async () => {
    const p = await payoutFor(1000);
    await prisma.teacher.update({ where: { id: p.teacherId }, data: { monthlySalary: eur(700) } });
    await client.request("POST", "/payments/teacher-payouts/generate", { yearMonth: YM, teacherId: p.teacherId });
    expect((await prisma.teacherPayout.findUniqueOrThrow({ where: { id: p.id } })).amount).toBe(eur(700));
  });

  it("filtra liquidaciones por fecha de pago usando el historial", async () => {
    const p = await payoutFor(1000);
    await client.request("POST", "/payments/teacher-payouts/pay", {
      payoutId: p.id,
      amount: 100,
      paidAt: "2026-10-03",
    });
    const inRange = await client.request("GET", "/payments/teacher-payouts?paidFrom=2026-10-01&paidTo=2026-10-03");
    const outRange = await client.request("GET", "/payments/teacher-payouts?paidFrom=2026-10-04&paidTo=2026-10-31");
    expect(inRange.body.map((x: { id: string }) => x.id)).toContain(p.id);
    expect(outRange.body.map((x: { id: string }) => x.id)).not.toContain(p.id);
  });
});
