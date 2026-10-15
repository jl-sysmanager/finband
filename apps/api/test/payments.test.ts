import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  adminClient,
  createClass,
  createStudent,
  createTeacher,
  enroll,
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
  await prisma.teacherPayout.deleteMany();
});

async function feeOf(total: number) {
  const teacher = await createTeacher();
  const s = await createStudent({ monthlyFee: total });
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
    expect(await reload(fee.id)).toMatchObject({ amountPaid: 25, status: "PARTIAL" });
    expect((await pay(fee.id, 35)).status).toBe(200);
    expect(await reload(fee.id)).toMatchObject({ amountPaid: 60, status: "PAID" });
  });

  it("tres cobros de 10,10 € saldan una cuota de 30,30 €", async () => {
    const fee = await feeOf(30.3);
    for (let i = 0; i < 3; i++) expect((await pay(fee.id, 10.1)).status).toBe(200);
    expect(await reload(fee.id)).toMatchObject({ amountPaid: 30.3, status: "PAID" });
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
    expect(await reload(fee.id)).toMatchObject({ amountPaid: 20, status: "PARTIAL" });

    const over = await client.request("PATCH", `/payments/student-payments/${p.id}`, { amount: 50.5 });
    expect(over.status).toBe(400);
    expect((await reload(fee.id)).amountPaid).toBe(20);
  });

  it("borrar un cobro devuelve la cuota a PENDIENTE", async () => {
    const fee = await feeOf(50);
    const p = (await pay(fee.id, 50)).body;
    expect((await client.request("DELETE", `/payments/student-payments/${p.id}`)).status).toBe(200);
    expect(await reload(fee.id)).toMatchObject({ amountPaid: 0, status: "PENDING" });
  });

  it("cobros simultáneos no superan el total de la cuota", async () => {
    const fee = await feeOf(50);
    const results = await Promise.all([pay(fee.id, 30), pay(fee.id, 30), pay(fee.id, 30)]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await reload(fee.id)).toMatchObject({ amountPaid: 30, status: "PARTIAL" });
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
    const t = await createTeacher({ monthlySalary });
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
    expect((await prisma.teacherPayout.findUniqueOrThrow({ where: { id: p.id } })).amountPaid).toBe(900);
  });

  it("pagos simultáneos no superan el total", async () => {
    const p = await payoutFor(1000);
    const results = await Promise.all([payPayout(p.id, 600), payPayout(p.id, 600)]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect((await prisma.teacherPayout.findUniqueOrThrow({ where: { id: p.id } })).amountPaid).toBe(600);
  });

  it("regenerar con un importe menor no borra lo ya pagado", async () => {
    const p = await payoutFor(1000);
    await payPayout(p.id, 800);
    await prisma.teacher.update({ where: { id: p.teacherId }, data: { monthlySalary: 700 } });
    await client.request("POST", "/payments/teacher-payouts/generate", {
      yearMonth: YM,
      teacherId: p.teacherId,
    });
    const after = await prisma.teacherPayout.findUniqueOrThrow({ where: { id: p.id } });
    expect(after).toMatchObject({ amount: 700, amountPaid: 800, status: "PAID" });
  });
});
