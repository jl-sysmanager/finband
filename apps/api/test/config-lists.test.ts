import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, createStudent, eur, prisma, resetDb, type TestClient } from "./helpers.js";

let client: TestClient;
beforeAll(async () => {
  await resetDb();
  client = await adminClient();
});
afterAll(() => client.close());

async function feeFor(amount: number) {
  const s = await createStudent({ firstName: "Eva", lastName: `Paz${Date.now()}` });
  return prisma.studentFee.create({
    data: { studentId: s.id, yearMonth: "2026-10", baseAmount: eur(amount), totalAmount: eur(amount) },
  });
}

describe("métodos de pago configurables", () => {
  it("vienen los cuatro de siempre y se pueden añadir, usar y renombrar", async () => {
    const list = await client.request("GET", "/settings/payment-methods");
    expect(list.body.map((m: { id: string }) => m.id).slice(0, 4)).toEqual([
      "EFECTIVO",
      "TRANSFERENCIA",
      "BIZUM",
      "TARJETA",
    ]);

    const created = await client.request("POST", "/settings/payment-methods", { label: "Domiciliación" });
    expect(created.status).toBe(200);
    const fee = await feeFor(50);
    const pay = await client.request("POST", "/payments/student-payments", {
      feeId: fee.id,
      amount: 20,
      method: created.body.id,
    });
    expect(pay.status).toBe(200);

    // Al renombrar, los registros muestran el nombre nuevo (guardan el id).
    await client.request("PATCH", `/settings/payment-methods/${created.body.id}`, { label: "Domiciliación bancaria" });
    const report = await client.request("GET", "/reports/students?monthFrom=2026-10&monthTo=2026-10");
    expect(report.body.payments.map((p: { method: string }) => p.method)).toContain("Domiciliación bancaria");

    const after = await client.request("GET", "/settings/payment-methods");
    expect(after.body.find((m: { id: string }) => m.id === created.body.id)).toMatchObject({ uses: 1 });
  });

  it("un método desactivado no se ofrece para cobros nuevos, pero los existentes se pueden editar", async () => {
    const m = await client.request("POST", "/settings/payment-methods", { label: `Vale ${Date.now()}` });
    const fee = await feeFor(60);
    const first = await client.request("POST", "/payments/student-payments", { feeId: fee.id, amount: 10, method: m.body.id });
    expect(first.status).toBe(200);

    await client.request("PATCH", `/settings/payment-methods/${m.body.id}`, { active: false });
    const rejected = await client.request("POST", "/payments/student-payments", { feeId: fee.id, amount: 10, method: m.body.id });
    expect(rejected.status).toBe(400);
    expect(rejected.body.error).toMatch(/desactivado/);

    // Editar el cobro existente sin cambiar el método sigue funcionando.
    const edit = await client.request("PATCH", `/payments/student-payments/${first.body.id}`, { amount: 12, method: m.body.id });
    expect(edit.status).toBe(200);
    // Y no se puede borrar porque se ha usado.
    const del = await client.request("DELETE", `/settings/payment-methods/${m.body.id}`);
    expect(del.status).toBe(409);
    expect(del.body.error).toMatch(/Desactívelo/);
  });

  it("un método sin usar se borra; no se puede quedar sin ninguno activo; los ids inventados se rechazan", async () => {
    const m = await client.request("POST", "/settings/payment-methods", { label: `Temporal ${Date.now()}` });
    expect((await client.request("DELETE", `/settings/payment-methods/${m.body.id}`)).status).toBe(200);

    const income = await client.request("POST", "/finance/incomes", {
      date: "2026-10-10",
      concept: "x",
      categoryId: (await prisma.incomeCategory.create({ data: { name: `C ${Date.now()}` } })).id,
      amount: 5,
      method: "INVENTADO",
    });
    expect(income.status).toBe(400);

    const actives = await prisma.paymentMethod.findMany({ where: { active: true } });
    for (const a of actives.slice(1)) await prisma.paymentMethod.update({ where: { id: a.id }, data: { active: false } });
    const last = await client.request("PATCH", `/settings/payment-methods/${actives[0]!.id}`, { active: false });
    expect(last.status).toBe(409);
    await prisma.paymentMethod.updateMany({ data: { active: true } });
  });

  it("se pueden reordenar", async () => {
    const before = (await client.request("GET", "/settings/payment-methods")).body.map((m: { id: string }) => m.id);
    const reversed = [...before].reverse();
    expect((await client.request("PUT", "/settings/payment-methods/order", { ids: reversed })).status).toBe(200);
    const after = (await client.request("GET", "/settings/payment-methods")).body.map((m: { id: string }) => m.id);
    expect(after).toEqual(reversed);
  });
});

describe("categorías configurables", () => {
  it("se crean al final, se renombran, se reordenan y solo se borran si no tienen apuntes", async () => {
    const tag = Date.now();
    const a = await client.request("POST", "/settings/income-categories", { name: `Alfa ${tag}` });
    const b = await client.request("POST", "/settings/income-categories", { name: `Beta ${tag}` });
    expect(b.body.sortOrder).toBeGreaterThan(a.body.sortOrder);

    expect((await client.request("PATCH", `/settings/income-categories/${a.body.id}`, { name: `Alfa2 ${tag}` })).body.name).toBe(
      `Alfa2 ${tag}`,
    );

    await client.request("POST", "/finance/incomes", {
      date: "2026-10-10",
      concept: "Concierto",
      categoryId: a.body.id,
      amount: 30,
    });
    const blocked = await client.request("DELETE", `/settings/income-categories/${a.body.id}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatch(/1 apunte/);
    expect((await client.request("DELETE", `/settings/income-categories/${b.body.id}`)).status).toBe(200);

    const list = await client.request("GET", "/settings/income-categories");
    expect(list.body.find((c: { id: string }) => c.id === a.body.id)).toMatchObject({ entries: 1 });
  });

  it("las categorías gestionadas por la app se renombran pero no se borran", async () => {
    const managed = await prisma.expenseCategory.create({ data: { name: `Profes ${Date.now()}`, managedByApp: true } });
    expect((await client.request("PATCH", `/settings/expense-categories/${managed.id}`, { name: `Docentes ${Date.now()}` })).status).toBe(200);
    const del = await client.request("DELETE", `/settings/expense-categories/${managed.id}`);
    expect(del.status).toBe(409);
    expect(del.body.error).toMatch(/gestiona la app/);
  });

  it("un perfil de solo lectura no puede cambiar las listas", async () => {
    const bcrypt = await import("bcryptjs");
    await prisma.user.create({
      data: { username: `ro${Date.now()}`, passwordHash: await bcrypt.default.hash("secret123", 4), role: "READONLY" },
    });
    const ro = await prisma.user.findFirstOrThrow({ where: { role: "READONLY" } });
    const login = await client.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: ro.username, password: "secret123" },
    });
    const token = login.cookies.find((c) => c.name === "finband_token")!.value;
    const res = await client.app.inject({
      method: "POST",
      url: "/api/v1/settings/payment-methods",
      cookies: { finband_token: token },
      payload: { label: "No" },
    });
    expect(res.statusCode).toBe(403);
  });
});
