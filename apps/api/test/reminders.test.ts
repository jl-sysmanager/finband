import { afterAll, beforeAll, expect, it } from "vitest";
import { adminClient, createStudent, eur, prisma, resetDb, type TestClient } from "./helpers.js";

let client: TestClient;
beforeAll(async () => {
  await resetDb();
  client = await adminClient();
});
afterAll(() => client.close());

async function feeFor(phone: string | null) {
  const s = await createStudent({ firstName: "Eva", lastName: "Paz", phone });
  return prisma.studentFee.create({
    data: { studentId: s.id, yearMonth: "2026-10", baseAmount: eur(50), totalAmount: eur(50), amountPaid: eur(20) },
  });
}

it("la vista previa prepara el mensaje sin registrar nada; el envío se audita con su canal", async () => {
  const fee = await feeFor("600 11 12 13");
  const preview = await client.request("GET", `/payments/student-fees/${fee.id}/reminder`);
  expect(preview.status).toBe(200);
  expect(preview.body).toMatchObject({ whatsappPhone: "34600111213", pending: 30 });
  expect(preview.body.body).toContain("Pendiente: 30,00");
  expect(await prisma.auditLog.count({ where: { action: "REMINDER", entityId: fee.id } })).toBe(0);

  const sent = await client.request("POST", `/payments/student-fees/${fee.id}/reminder`, { channel: "whatsapp-app" });
  expect(sent.status).toBe(200);
  const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "REMINDER", entityId: fee.id } });
  expect(JSON.parse(log.details!)).toMatchObject({ channel: "whatsapp-app" });

  expect(
    (await client.request("POST", `/payments/student-fees/${fee.id}/reminder`, { channel: "paloma" })).status,
  ).toBe(400);
});

it("normaliza el teléfono con prefijo y descarta los inválidos", async () => {
  const intl = await feeFor("+34 611-22-33-44");
  expect((await client.request("GET", `/payments/student-fees/${intl.id}/reminder`)).body.whatsappPhone).toBe("34611223344");
  const bad = await feeFor("123");
  expect((await client.request("GET", `/payments/student-fees/${bad.id}/reminder`)).body.whatsappPhone).toBeNull();
  const none = await feeFor(null);
  expect((await client.request("GET", `/payments/student-fees/${none.id}/reminder`)).body.whatsappPhone).toBeNull();
});
