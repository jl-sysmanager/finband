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

const YM = "2026-10";
let client: TestClient;
let cuotas: { id: string };
let otrosIngresos: { id: string };
let profesores: { id: string };
let material: { id: string };

beforeAll(async () => {
  await resetDb();
  client = await adminClient();
  const tag = Date.now();
  cuotas = await prisma.incomeCategory.create({ data: { name: `Cuotas ${tag}`, managedByApp: true } });
  otrosIngresos = await prisma.incomeCategory.create({ data: { name: `Conciertos ${tag}` } });
  profesores = await prisma.expenseCategory.create({ data: { name: `Profesores ${tag}`, managedByApp: true } });
  material = await prisma.expenseCategory.create({ data: { name: `Material ${tag}` } });
});
afterAll(() => client.close());

it("el balance suma cobros y resta pagos a profesores sin duplicar los apuntes manuales", async () => {
  // Apuntes antiguos que duplican cobros y pagos: no deben contar.
  await prisma.incomeEntry.create({
    data: { date: new Date("2026-10-05"), concept: "Cuota Ana (a mano)", categoryId: cuotas.id, amount: eur(60) },
  });
  await prisma.expenseEntry.create({
    data: { date: new Date("2026-10-05"), concept: "Nómina (a mano)", categoryId: profesores.id, amount: eur(500) },
  });
  // Apuntes normales.
  await prisma.incomeEntry.create({
    data: { date: new Date("2026-10-10"), concept: "Concierto", categoryId: otrosIngresos.id, amount: eur(200) },
  });
  await prisma.expenseEntry.create({
    data: { date: new Date("2026-10-11"), concept: "Partituras", categoryId: material.id, amount: eur(30.5) },
  });
  // Cobro de cuota y pago a profesor registrados en la app.
  const s = await createStudent();
  const fee = await prisma.studentFee.create({
    data: { studentId: s.id, yearMonth: YM, baseAmount: eur(60), totalAmount: eur(60) },
  });
  expect(
    (await client.request("POST", "/payments/student-payments", {
      feeId: fee.id,
      amount: 60,
      method: "EFECTIVO",
      paidAt: "2026-10-06",
    })).status,
  ).toBe(200);
  const t = await createTeacher({ monthlySalary: eur(500) });
  await client.request("POST", "/payments/teacher-payouts/generate", { yearMonth: YM, teacherId: t.id });
  const payout = await prisma.teacherPayout.findFirstOrThrow({ where: { teacherId: t.id } });
  expect(
    (await client.request("POST", "/payments/teacher-payouts/pay", {
      payoutId: payout.id,
      amount: 500,
      paidAt: "2026-10-06",
    })).status,
  ).toBe(200);

  const monthly = await client.request("GET", `/reports/balance?monthFrom=${YM}&monthTo=${YM}`);
  expect(monthly.body.totals).toMatchObject({
    income: 200,
    feeCollections: 60,
    expense: 30.5,
    teacherPayments: 500,
    balance: -270.5, // 200 + 60 − 30,5 − 500
    excludedManualIncome: 60,
    excludedManualExpense: 500,
  });

  const summary = await client.request("GET", "/dashboard/summary");
  // El resumen del dashboard es del mes en curso: aquí solo comprobamos que usa el mismo criterio.
  expect(summary.status).toBe(200);
  // Indicadores: cuotas y liquidaciones de los meses del periodo.
  expect(monthly.body.indicators).toMatchObject({
    feesIssued: 60,
    feesCollected: 60,
    collectionRate: 100,
    payoutsSettled: 500,
    payoutsPaid: 500,
    payoutsPending: 0,
  });
});

it("no admite apuntes manuales nuevos en categorías gestionadas por la app", async () => {
  const income = await client.request("POST", "/finance/incomes", {
    date: "2026-10-20",
    concept: "Cuota a mano",
    categoryId: cuotas.id,
    amount: 50,
  });
  expect(income.status).toBe(400);
  expect(income.body.error).toMatch(/gestiona la app/);

  const expense = await client.request("POST", "/finance/expenses", {
    date: "2026-10-20",
    concept: "Nómina a mano",
    categoryId: profesores.id,
    amount: 50,
  });
  expect(expense.status).toBe(400);

  // Mover un apunte normal a una categoría gestionada tampoco.
  const normal = await client.request("POST", "/finance/incomes", {
    date: "2026-10-20",
    concept: "Donativo",
    categoryId: otrosIngresos.id,
    amount: 50,
  });
  expect((await client.request("PATCH", `/finance/incomes/${normal.body.id}`, { categoryId: cuotas.id })).status).toBe(400);

  // Un apunte antiguo de la categoría gestionada sí se puede corregir o recategorizar.
  const old = await prisma.incomeEntry.findFirstOrThrow({ where: { categoryId: cuotas.id } });
  expect((await client.request("PATCH", `/finance/incomes/${old.id}`, { concept: "Corregido", categoryId: cuotas.id })).status).toBe(200);
  expect((await client.request("PATCH", `/finance/incomes/${old.id}`, { categoryId: otrosIngresos.id })).status).toBe(200);
});
