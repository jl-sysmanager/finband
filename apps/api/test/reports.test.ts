import { afterAll, beforeAll, expect, it } from "vitest";
import {
  adminClient,
  createStudent,
  createTeacher,
  eur,
  prisma,
  resetDb,
  type TestClient,
} from "./helpers.js";

let client: TestClient;
beforeAll(async () => {
  await resetDb();
  client = await adminClient();
});
afterAll(() => client.close());

it("el balance anual coincide mes a mes con el balance mensual", async () => {
  const inc = await prisma.incomeCategory.create({ data: { name: `I ${Date.now()}` } });
  const exp = await prisma.expenseCategory.create({ data: { name: `E ${Date.now()}` } });
  const entries: Array<["incomes" | "expenses", string, number]> = [
    ["incomes", "2026-01-01", 100.1],
    ["incomes", "2026-01-31", 50],
    ["incomes", "2026-02-01", 20.2],
    ["expenses", "2026-01-15", 30.3],
    ["expenses", "2026-12-31", 10],
    ["incomes", "2025-12-31", 999], // fuera del año
  ];
  for (const [kind, date, amount] of entries) {
    const res = await client.request("POST", `/finance/${kind}`, {
      date,
      concept: date,
      categoryId: kind === "incomes" ? inc.id : exp.id,
      amount,
    });
    expect(res.status).toBe(200);
  }
  const s = await createStudent();
  const fee = await prisma.studentFee.create({
    data: { studentId: s.id, yearMonth: "2026-03", baseAmount: eur(40), totalAmount: eur(40) },
  });
  // 00:30 del 1 de abril en Madrid → abril.
  await prisma.studentPayment.create({
    data: { feeId: fee.id, amount: eur(40), method: "EFECTIVO", paidAt: new Date("2026-03-31T22:30:00Z") },
  });

  const annual = await client.request("GET", "/reports/balance-annual?year=2026");
  expect(annual.status).toBe(200);
  for (const row of annual.body.rows) {
    const monthly = await client.request("GET", `/reports/balance-monthly?yearMonth=${row.month}`);
    const { month: _m, ...annualRow } = row;
    const { yearMonth: _y, ...monthlyRow } = monthly.body;
    expect(annualRow).toEqual(monthlyRow);
  }
  expect(annual.body.rows[0]).toMatchObject({ income: 150.1, expense: 30.3, balance: 119.8 });
  // El cobro de 40 € suma en el balance de abril.
  expect(annual.body.rows[3]).toMatchObject({ feeCollections: 40, balance: 40 });
  expect(annual.body.totals).toMatchObject({ income: 170.3, feeCollections: 40, expense: 40.3, balance: 170 });
});

it("ingresos por alumno y coste por profesor suman por persona", async () => {
  const a = await createStudent({ firstName: "Ana", lastName: "Zeta" });
  const b = await createStudent({ firstName: "Bea", lastName: "Alfa" });
  await prisma.studentFee.createMany({
    data: [
      { studentId: a.id, yearMonth: "2026-05", baseAmount: eur(50), totalAmount: eur(50), amountPaid: eur(50) },
      { studentId: a.id, yearMonth: "2026-06", baseAmount: eur(50), totalAmount: eur(50), amountPaid: eur(20) },
      { studentId: b.id, yearMonth: "2026-05", baseAmount: eur(30), totalAmount: eur(30) },
    ],
  });
  const t = await createTeacher({ firstName: "Teo", lastName: "Pérez" });
  await prisma.teacherPayout.createMany({
    data: [
      { teacherId: t.id, yearMonth: "2026-05", amount: eur(800), amountPaid: eur(800) },
      { teacherId: t.id, yearMonth: "2026-06", amount: eur(800), amountPaid: eur(100.5) },
    ],
  });

  const byStudent = await client.request("GET", "/reports/income-by-student");
  expect(byStudent.body).toEqual(
    expect.arrayContaining([
      { name: "Ana Zeta", paid: 70, pending: 30 },
      { name: "Bea Alfa", paid: 0, pending: 30 },
    ]),
  );
  const byTeacher = await client.request("GET", "/reports/cost-by-teacher");
  expect(byTeacher.body).toContainEqual({ name: "Teo Pérez", paid: 900.5, pending: 699.5 });
});
