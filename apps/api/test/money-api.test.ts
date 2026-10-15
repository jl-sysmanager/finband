import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, prisma, resetDb, type TestClient } from "./helpers.js";

/** La base guarda céntimos; el contrato HTTP sigue en euros en entrada y salida. */
let client: TestClient;
beforeAll(async () => {
  await resetDb();
  client = await adminClient();
});
afterAll(() => client.close());

const YM = "2026-10";

describe("contrato HTTP en euros", () => {
  it("profesores, clases, alumnos, descuentos, cuotas, cobros e informes", async () => {
    const teacher = await client.request("POST", "/teachers", {
      firstName: "Ana",
      lastName: "Ruiz",
      hourlyRate: 18.5,
      costPerClass: 22.25,
      transportCostPerDay: 6.5,
    });
    expect(teacher.status).toBe(200);
    expect(teacher.body).toMatchObject({ hourlyRate: 18.5, costPerClass: 22.25, transportCostPerDay: 6.5 });
    expect(await prisma.teacher.findUniqueOrThrow({ where: { id: teacher.body.id } })).toMatchObject({
      hourlyRate: 1850,
      costPerClass: 2225,
      transportCostPerDay: 650,
    });

    const cls = await client.request("POST", "/classes", {
      name: "Piano",
      type: "INDIVIDUAL",
      teacherId: teacher.body.id,
      durationMinutes: 60,
      maxStudents: 1,
    });
    expect(cls.body.teacher.hourlyRate).toBe(18.5);
    const classDetail = await client.request("GET", `/classes/${cls.body.id}`);
    expect(classDetail.body.teacher.hourlyRate).toBe(18.5);

    const tariff = await client.request("POST", "/tariffs", { name: "Individual", classType: "INDIVIDUAL", amount: 47.35 });
    expect(tariff.body.amount).toBe(47.35);
    expect((await prisma.tariffRule.findUniqueOrThrow({ where: { id: tariff.body.id } })).amount).toBe(4735);

    const student = await client.request("POST", "/students", { firstName: "Eva", lastName: "Paz" });
    await client.request("POST", `/classes/${cls.body.id}/enrollments`, { studentId: student.body.id });
    const discount = await client.request("POST", `/students/${student.body.id}/discounts`, {
      name: "Hermanos",
      type: "PERCENT",
      value: 12.5,
    });
    expect(discount.body.value).toBe(12.5);
    expect((await prisma.studentDiscount.findUniqueOrThrow({ where: { id: discount.body.id } })).value).toBe(1250);

    // 47,35 − 12,5 % (5,92) = 41,43
    const preview = await client.request("GET", `/students/${student.body.id}/fee-preview?yearMonth=${YM}`);
    expect(preview.body).toMatchObject({
      baseAmount: 47.35,
      discountAmount: 5.92,
      totalAmount: 41.43,
      lineItems: [{ amount: 47.35 }],
    });
    expect((await client.request("POST", `/students/${student.body.id}/generate-fee`, { yearMonth: YM })).body).toEqual({
      totalAmount: 41.43,
      yearMonth: YM,
    });

    const fees = await client.request("GET", `/payments/student-fees?yearMonth=${YM}`);
    expect(fees.body).toHaveLength(1);
    const fee = fees.body[0];
    expect(fee).toMatchObject({ totalAmount: 41.43, amountPaid: 0 });
    expect(JSON.parse(fee.lineItems)).toEqual([{ label: expect.any(String), amount: 47.35 }]);

    const payment = await client.request("POST", "/payments/student-payments", {
      feeId: fee.id,
      amount: 20.1,
      method: "EFECTIVO",
      paidAt: "2026-10-03",
    });
    expect(payment.body.amount).toBe(20.1);

    const reminder = await client.request("GET", `/payments/student-fees/${fee.id}/reminder`);
    expect(reminder.body.pending).toBe(21.33);
    expect(reminder.body.body).toMatch(/21,33\s€/);

    const detail = await client.request("GET", `/students/${student.body.id}`);
    expect(detail.body.discounts[0].value).toBe(12.5);
    expect(detail.body.fees[0]).toMatchObject({ totalAmount: 41.43, amountPaid: 20.1 });
    expect(detail.body.fees[0].payments[0].amount).toBe(20.1);

    const over = await client.request("POST", "/payments/student-payments", {
      feeId: fee.id,
      amount: 21.34,
      method: "EFECTIVO",
    });
    expect(over.status).toBe(400);
    expect(over.body.error).toMatch(/21,33\s€/);

    const report = await client.request("GET", `/reports/fees-issued-collected?yearMonth=${YM}`);
    expect(report.body.totals).toMatchObject({ issued: 41.43, collected: 20.1, pending: 21.33 });
    const balance = await client.request("GET", `/reports/balance-monthly?yearMonth=${YM}`);
    expect(balance.body.feeCollections).toBe(20.1);
    const aging = await client.request("GET", "/reports/debt-aging");
    expect(aging.body.totalPending).toBe(21.33);
  });

  it("ingresos, gastos y balance", async () => {
    const [ic, ec] = await Promise.all([
      prisma.incomeCategory.create({ data: { name: `I ${Date.now()}` } }),
      prisma.expenseCategory.create({ data: { name: `E ${Date.now()}` } }),
    ]);
    const income = await client.request("POST", "/finance/incomes", {
      date: "2026-10-10",
      concept: "Matrícula",
      categoryId: ic.id,
      amount: 45.99,
    });
    expect(income.body.amount).toBe(45.99);
    await client.request("POST", "/finance/expenses", {
      date: "2026-10-11",
      concept: "Partituras",
      categoryId: ec.id,
      amount: 128.5,
    });
    const list = await client.request("GET", "/finance/incomes?from=2026-10-01&to=2026-10-31");
    expect(list.body[0].amount).toBe(45.99);
    const balance = await client.request("GET", `/reports/balance-monthly?yearMonth=${YM}`);
    // El balance incluye el cobro de 20,10 € registrado en la prueba anterior.
    expect(balance.body).toMatchObject({
      income: 45.99,
      feeCollections: 20.1,
      expense: 128.5,
      teacherPayments: 0,
      balance: -62.41,
    });
  });

  it("liquidación de profesor", async () => {
    const t = await client.request("POST", "/teachers", {
      firstName: "Luis",
      lastName: "Gil",
      hourlyRate: 0,
      monthlySalary: 1200.5,
    });
    const gen = await client.request("POST", "/payments/teacher-payouts/generate", {
      yearMonth: YM,
      teacherId: t.body.id,
    });
    expect(gen.body).toMatchObject({ generated: 1, amount: 1200.5 });
    const list = await client.request("GET", `/payments/teacher-payouts?yearMonth=${YM}`);
    const payout = list.body.find((p: { teacherId: string }) => p.teacherId === t.body.id);
    expect(payout).toMatchObject({ amount: 1200.5, baseAmount: 1200.5, amountPaid: 0 });
    const paid = await client.request("POST", "/payments/teacher-payouts/pay", { payoutId: payout.id, amount: 200.25 });
    expect(paid.body).toMatchObject({ amountPaid: 200.25, payments: [{ amount: 200.25 }] });
    const report = await client.request("GET", `/reports/payouts-expected-paid?yearMonth=${YM}`);
    expect(report.body.rows.find((r: { teacher: string }) => r.teacher === "Gil, Luis")).toMatchObject({
      expected: 1200.5,
      paid: 200.25,
      pending: 1000.25,
    });
  });
});
