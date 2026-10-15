import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import type { ClassType } from "@prisma/client";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

export { prisma };

/** Euros → céntimos, para escribir importes en Prisma y comparar lo que devuelve. */
export const eur = (euros: number) => Math.round(euros * 100);

/** Vacía todas las tablas de datos (respetando las claves ajenas). */
export async function resetDb() {
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.attendanceRecord.deleteMany(),
    prisma.attendanceSession.deleteMany(),
    prisma.studentPayment.deleteMany(),
    prisma.studentFee.deleteMany(),
    prisma.studentDiscount.deleteMany(),
    prisma.enrollment.deleteMany(),
    prisma.classScheduleCancellation.deleteMany(),
    prisma.classScheduleSlot.deleteMany(),
    prisma.classGroup.deleteMany(),
    prisma.teacherPayoutPayment.deleteMany(),
    prisma.teacherPayout.deleteMany(),
    prisma.student.deleteMany(),
    prisma.teacher.deleteMany(),
    prisma.tariffRule.deleteMany(),
    prisma.incomeEntry.deleteMany(),
    prisma.expenseEntry.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

let seq = 0;
const uid = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

export function createTeacher(data: Partial<Parameters<typeof prisma.teacher.create>[0]["data"]> = {}) {
  return prisma.teacher.create({
    data: { firstName: "Profe", lastName: `T${uid()}`, ...data },
  });
}

export function createStudent(data: Partial<Parameters<typeof prisma.student.create>[0]["data"]> = {}) {
  return prisma.student.create({
    data: { firstName: "Alumno", lastName: `S${uid()}`, ...data },
  });
}

export async function createClass(
  teacherId: string,
  opts: {
    type?: ClassType;
    durationMinutes?: number;
    slots?: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
  } = {},
) {
  return prisma.classGroup.create({
    data: {
      name: `Clase ${uid()}`,
      type: opts.type ?? "INDIVIDUAL",
      teacherId,
      durationMinutes: opts.durationMinutes ?? 60,
      scheduleSlots: opts.slots ? { create: opts.slots } : undefined,
    },
    include: { scheduleSlots: true },
  });
}

export function enroll(studentId: string, classGroupId: string) {
  return prisma.enrollment.create({ data: { studentId, classGroupId } });
}

export type TestClient = {
  app: FastifyInstance;
  /** Cookie de sesión, para peticiones hechas a mano con `app.inject`. */
  token: string;
  request: (
    method: "GET" | "POST" | "PATCH" | "DELETE",
    url: string,
    body?: unknown,
    // Cuerpo JSON libre: cada test comprueba la forma que espera.
    // oxlint-disable-next-line typescript/no-explicit-any
  ) => Promise<{ status: number; body: any }>;
  close: () => Promise<void>;
};

/** Arranca la API en memoria y abre sesión como administrador. */
export async function adminClient(): Promise<TestClient> {
  const app = await buildApp({ logger: false });
  await prisma.user.create({
    data: { username: "admin-test", passwordHash: await bcrypt.hash("secret123", 4), role: "ADMIN" },
  });
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { username: "admin-test", password: "secret123" },
  });
  const cookie = login.cookies.find((c) => c.name === "finband_token");
  if (!cookie) throw new Error(`Login de test fallido: ${login.body}`);

  return {
    app,
    token: cookie.value,
    async request(method, url, body) {
      const res = await app.inject({
        method,
        url: `/api/v1${url}`,
        cookies: { finband_token: cookie.value },
        payload: body as never,
      });
      return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
    },
    close: () => app.close(),
  };
}
