import { afterAll, beforeAll, expect, it } from "vitest";
import { adminClient, createStudent, resetDb, type TestClient } from "./helpers.js";

let client: TestClient;
beforeAll(async () => {
  await resetDb();
  client = await adminClient();
});
afterAll(() => client.close());

it("un duplicado devuelve 409 en lugar de 500", async () => {
  const body = { username: "duplicado", password: "secret123", role: "READONLY" };
  expect((await client.request("POST", "/admin/users", body)).status).toBe(200);
  const dup = await client.request("POST", "/admin/users", body);
  expect(dup.status).toBe(409);
  expect(dup.body.error).toMatch(/ya existe/i);
});

it("borrar algo inexistente devuelve 404", async () => {
  const s = await createStudent();
  expect((await client.request("DELETE", `/students/${s.id}/discounts/nope`)).status).toBe(404);
  expect((await client.request("DELETE", "/admin/users/nope")).status).toBe(404);
});

it("no se puede borrar el descuento de otro alumno desde la URL de un alumno", async () => {
  const a = await createStudent();
  const b = await createStudent();
  const d = await client.request("POST", `/students/${b.id}/discounts`, {
    name: "Beca",
    type: "PERCENT",
    value: 10,
  });
  expect(d.status).toBe(200);
  expect((await client.request("DELETE", `/students/${a.id}/discounts/${d.body.id}`)).status).toBe(404);
  expect((await client.request("DELETE", `/students/${b.id}/discounts/${d.body.id}`)).status).toBe(200);
});

it.each([
  "/payments/student-fees?status=RARO",
  "/payments/student-fees?monthFrom=2026-13",
  "/finance/incomes?from=ayer",
  "/reports/balance?monthFrom=octubre",
  "/reports/students?monthTo=2026-13",
  "/students?limit=-5",
])("parámetros mal formados devuelven 400: %s", async (url) => {
  const res = await client.request("GET", url);
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/inválido/);
});

it("el límite de intentos de login sigue devolviendo su mensaje", async () => {
  let last = { statusCode: 0, body: "" };
  for (let i = 0; i < 11; i++) {
    last = await client.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "nadie", password: "x" },
    });
  }
  expect(last.statusCode).toBe(429);
  expect(JSON.parse(last.body).error).toMatch(/demasiados intentos/i);
});
