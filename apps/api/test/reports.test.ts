import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createStudent,
  createTeacher,
  eur,
  prisma,
  resetDb,
  type TestClient,
} from "./helpers.js";
import { monthsBetween } from "../src/lib/report-data.js";

let client: TestClient;
beforeAll(async () => {
  await resetDb();
  client = await adminClient();
});
afterAll(() => client.close());

describe("rango de meses", () => {
  it("lista los meses del rango cruzando de año", () => {
    expect(monthsBetween("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(monthsBetween("2026-10", "2026-10")).toEqual(["2026-10"]);
  });

  it("rechaza rangos invertidos o demasiado largos", async () => {
    const inverted = await client.request("GET", "/reports/balance?monthFrom=2026-10&monthTo=2026-01");
    expect(inverted.status).toBe(400);
    expect(inverted.body.error).toMatch(/posterior/);
    const tooLong = await client.request("GET", "/reports/students?monthFrom=2020-01&monthTo=2026-12");
    expect(tooLong.status).toBe(400);
  });
});

describe("balance del centro", () => {
  it("cada mes del rango coincide con el informe de ese mes y el total los suma", async () => {
    const inc = await prisma.incomeCategory.create({ data: { name: `I ${Date.now()}` } });
    const exp = await prisma.expenseCategory.create({ data: { name: `E ${Date.now()}` } });
    for (const [kind, date, amount] of [
      ["incomes", "2026-01-01", 100.1],
      ["incomes", "2026-01-31", 50],
      ["incomes", "2026-02-01", 20.2],
      ["expenses", "2026-01-15", 30.3],
      ["incomes", "2025-12-31", 999], // fuera del rango
    ] as const) {
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
      data: {
        studentId: s.id,
        yearMonth: "2026-03",
        baseAmount: eur(40),
        totalAmount: eur(40),
        amountPaid: eur(40),
        status: "PAID",
      },
    });
    // 00:30 del 1 de abril en Madrid → abril.
    await prisma.studentPayment.create({
      data: { feeId: fee.id, amount: eur(40), method: "EFECTIVO", paidAt: new Date("2026-03-31T22:30:00Z") },
    });

    const range = await client.request("GET", "/reports/balance?monthFrom=2026-01&monthTo=2026-04");
    expect(range.status).toBe(200);
    expect(range.body.rows.map((r: { month: string }) => r.month)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
    ]);
    for (const row of range.body.rows) {
      const single = await client.request("GET", `/reports/balance?monthFrom=${row.month}&monthTo=${row.month}`);
      expect(single.body.rows).toEqual([row]);
    }
    expect(range.body.rows[0]).toMatchObject({ income: 150.1, expense: 30.3, balance: 119.8 });
    expect(range.body.rows[3]).toMatchObject({ feeCollections: 40, balance: 40 });
    expect(range.body.totals).toMatchObject({ income: 170.3, feeCollections: 40, expense: 30.3, balance: 180 });
    // La cuota es de marzo: entra en los indicadores del periodo aunque se cobrara en abril.
    expect(range.body.indicators).toMatchObject({ feesIssued: 40, feesCollected: 40, collectionRate: 100 });
  });
});

describe("alumnos y profesores", () => {
  it("suman por persona en el rango y detectan alumnos sin cuota", async () => {
    const ana = await createStudent({ firstName: "Ana", lastName: "Zeta", createdAt: new Date("2026-01-01") });
    const bea = await createStudent({ firstName: "Bea", lastName: "Alfa", createdAt: new Date("2026-01-01") });
    const fees = [
      { studentId: ana.id, yearMonth: "2026-05", totalAmount: eur(50), discountAmount: eur(5), amountPaid: eur(50) },
      { studentId: ana.id, yearMonth: "2026-06", totalAmount: eur(50), discountAmount: eur(5), amountPaid: eur(20) },
      { studentId: bea.id, yearMonth: "2026-05", totalAmount: eur(30), discountAmount: 0, amountPaid: 0 },
      { studentId: bea.id, yearMonth: "2026-08", totalAmount: eur(30), discountAmount: 0, amountPaid: 0 }, // fuera
    ];
    for (const f of fees) {
      const created = await prisma.studentFee.create({ data: { ...f, baseAmount: f.totalAmount + f.discountAmount } });
      if (f.amountPaid > 0) {
        await prisma.studentPayment.create({
          data: { feeId: created.id, amount: f.amountPaid, method: "BIZUM", paidAt: new Date(`${f.yearMonth}-10T10:00:00Z`) },
        });
      }
    }

    const students = await client.request("GET", "/reports/students?monthFrom=2026-05&monthTo=2026-06");
    expect(students.status).toBe(200);
    const row = (name: string) => students.body.rows.find((r: { student: string }) => r.student === name);
    expect(row("Zeta, Ana")).toMatchObject({ fees: 2, issued: 100, discount: 10, collected: 70, pending: 30 });
    expect(row("Zeta, Ana").byMonth["2026-06"]).toEqual({ issued: 50, collected: 20 });
    expect(row("Alfa, Bea")).toMatchObject({ fees: 1, issued: 30, collected: 0, pending: 30 });
    expect(students.body.totals).toMatchObject({ issued: 130, collected: 70, pending: 60, collectionRate: 53.8 });
    expect(students.body.withoutFee).toContainEqual({ student: "Alfa, Bea", months: ["2026-06"] });
    // Los meses futuros no cuentan como "sin cuota" (aún no se generan).
    const future = await client.request("GET", "/reports/students?monthFrom=2026-05&monthTo=2099-12");
    expect(future.status).toBe(400); // rango de más de 36 meses
    const ahead = new Date();
    const nextMonth = `${ahead.getFullYear() + 1}-01`;
    const upcoming = await client.request("GET", `/reports/students?monthFrom=${nextMonth}&monthTo=${nextMonth}`);
    expect(upcoming.body.withoutFee).toEqual([]);
    expect(students.body.payments).toHaveLength(2);

    const t = await createTeacher({ firstName: "Teo", lastName: "Pérez" });
    for (const [yearMonth, amount, paid] of [
      ["2026-05", 800, 800],
      ["2026-06", 800, 100.5],
      ["2026-07", 800, 0], // fuera
    ] as const) {
      const payout = await prisma.teacherPayout.create({
        data: { teacherId: t.id, yearMonth, amount: eur(amount), baseAmount: eur(amount), workDays: 8, amountPaid: eur(paid) },
      });
      if (paid > 0) {
        await prisma.teacherPayoutPayment.create({ data: { payoutId: payout.id, amount: eur(paid) } });
      }
    }
    const teachers = await client.request("GET", "/reports/teachers?monthFrom=2026-05&monthTo=2026-06");
    expect(teachers.body.rows).toContainEqual(
      expect.objectContaining({ teacher: "Pérez, Teo", payouts: 2, workDays: 16, settled: 1600, paid: 900.5, pending: 699.5 }),
    );
    expect(teachers.body.payments).toHaveLength(2);
  });
});

describe("formatos", () => {
  it.each(["balance", "students", "teachers", "debt"])("%s se descarga en PDF y Excel", async (id) => {
    for (const [format, type] of [
      ["pdf", "application/pdf"],
      ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ] as const) {
      const res = await client.app.inject({
        method: "GET",
        url: `/api/v1/reports/${id}?monthFrom=2026-05&monthTo=2026-06&format=${format}`,
        cookies: { finband_token: client.token },
      });
      expect(res.statusCode, `${id} ${format}`).toBe(200);
      expect(res.headers["content-type"]).toContain(type);
      expect(res.rawPayload.length).toBeGreaterThan(500);
    }
  });

  it("los informes antiguos ya no existen", async () => {
    for (const old of ["balance-monthly", "executive-monthly", "income-by-student", "debt-aging"]) {
      expect((await client.request("GET", `/reports/${old}`)).status).toBe(404);
    }
  });
});

describe("deuda pendiente", () => {
  it("incluye a los alumnos dados de baja, marcados", async () => {
    const left = await createStudent({ firstName: "Leo", lastName: "Baja", status: "INACTIVE", deletedAt: new Date() });
    await prisma.studentFee.create({
      data: { studentId: left.id, yearMonth: "2026-01", baseAmount: eur(70), totalAmount: eur(70) },
    });
    const debt = await client.request("GET", "/reports/debt");
    const row = debt.body.details.find((d: { student: string }) => d.student.startsWith("Baja, Leo"));
    expect(row).toMatchObject({ student: "Baja, Leo (baja)", inactive: true, pending: 70 });
  });
});
