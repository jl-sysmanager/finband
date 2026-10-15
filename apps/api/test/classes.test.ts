import { afterAll, beforeAll, expect, it } from "vitest";
import { adminClient, createTeacher, prisma, resetDb, type TestClient } from "./helpers.js";

let client: TestClient;
beforeAll(async () => {
  await resetDb();
  client = await adminClient();
});
afterAll(() => client.close());

const base = { type: "INDIVIDUAL", durationMinutes: 60, maxStudents: 1 };

it("editar el horario conserva las suspensiones de las franjas que no cambian", async () => {
  const teacher = await createTeacher({ costPerClass: 20 });
  const created = await client.request("POST", "/classes", {
    ...base,
    name: "Piano",
    teacherId: teacher.id,
    scheduleSlots: [
      { dayOfWeek: 1, startTime: "17:00", endTime: "18:00" },
      { dayOfWeek: 3, startTime: "17:00", endTime: "18:00" },
    ],
  });
  expect(created.status).toBe(200);
  const monday = created.body.scheduleSlots.find((s: { dayOfWeek: number }) => s.dayOfWeek === 1);
  await prisma.classScheduleCancellation.create({
    data: { scheduleSlotId: monday.id, sessionDate: "2026-10-12", reason: "Festivo" },
  });

  // Se alarga la clase del lunes, se quita la del miércoles y se añade el viernes.
  const edited = await client.request("PATCH", `/classes/${created.body.id}`, {
    scheduleSlots: [
      { dayOfWeek: 1, startTime: "17:00", endTime: "18:30" },
      { dayOfWeek: 5, startTime: "10:00", endTime: "11:00" },
    ],
  });
  expect(edited.status).toBe(200);
  expect(edited.body.scheduleSlots.map((s: { dayOfWeek: number; endTime: string }) => [s.dayOfWeek, s.endTime])).toEqual([
    [1, "18:30"],
    [5, "11:00"],
  ]);
  expect(edited.body.scheduleSlots[0].id).toBe(monday.id);
  expect(await prisma.classScheduleCancellation.count({ where: { scheduleSlotId: monday.id } })).toBe(1);

  // La liquidación de octubre sigue descontando el festivo: 4 lunes − 1 + 5 viernes = 8 sesiones.
  const calc = await client.request(
    "GET",
    `/payments/teacher-payouts/calculate?teacherId=${teacher.id}&yearMonth=2026-10`,
  );
  expect(calc.body).toMatchObject({ sessionCount: 8, baseAmount: 160 });
});

it("editar una clase inexistente devuelve 404", async () => {
  expect((await client.request("PATCH", "/classes/nope", { name: "X" })).status).toBe(404);
});
