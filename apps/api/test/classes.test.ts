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

it("borrar una clase la oculta, cierra matrículas y conserva lo trabajado en las liquidaciones", async () => {
  const teacher = await createTeacher({ costPerClass: 25 });
  const created = await client.request("POST", "/classes", {
    ...base,
    name: "Guitarra",
    teacherId: teacher.id,
    scheduleSlots: [{ dayOfWeek: 1, startTime: "17:00", endTime: "18:00" }],
  });
  const classId = created.body.id;
  const student = await prisma.student.create({ data: { firstName: "Ana", lastName: "Ruiz" } });
  await client.request("POST", `/classes/${classId}/enrollments`, { studentId: student.id });
  await prisma.tariffRule.create({ data: { name: "Individual", classType: "INDIVIDUAL", amount: 50 } });
  expect((await client.request("GET", `/students/${student.id}/fee-preview?yearMonth=2026-10`)).body.totalAmount).toBe(50);

  expect((await client.request("DELETE", `/classes/${classId}`)).status).toBe(200);
  // Simula que se borró el miércoles 14 de octubre: se impartieron los lunes 5 y 12.
  await prisma.classGroup.update({ where: { id: classId }, data: { deletedAt: new Date(2026, 9, 14, 10) } });

  const list = await client.request("GET", "/classes");
  expect(list.body.map((c: { id: string }) => c.id)).not.toContain(classId);
  expect((await client.request("GET", `/classes/${classId}`)).status).toBe(404);
  expect((await client.request("DELETE", `/classes/${classId}`)).status).toBe(404);
  expect(await prisma.enrollment.count({ where: { classGroupId: classId, active: true } })).toBe(0);
  expect((await client.request("GET", `/students/${student.id}/fee-preview?yearMonth=2026-11`)).body.totalAmount).toBe(0);

  const calc = (ym: string) =>
    client.request("GET", `/payments/teacher-payouts/calculate?teacherId=${teacher.id}&yearMonth=${ym}`);
  expect((await calc("2026-10")).body).toMatchObject({ sessionCount: 2, baseAmount: 50 });
  expect((await calc("2026-11")).body).toMatchObject({ sessionCount: 0, baseAmount: 0 });
  expect(await prisma.classScheduleSlot.count({ where: { classGroupId: classId } })).toBe(1);
});
