import type { FastifyInstance } from "fastify";
import { generateMonthSchema, studentDiscountSchema, studentSchema } from "@finband/shared";
import {
  calculateStudentMonthlyFee,
  FeeHasPaymentsError,
  generateFeeForStudent,
} from "../lib/tariffs.js";
import { recordAudit } from "../lib/audit.js";
import { prisma } from "../lib/prisma.js";
import { parseCalendarDate } from "../lib/dates.js";

export async function studentRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const q = request.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = { deletedAt: null };
    if (q.status) where.status = q.status;
    if (q.instrument) where.mainInstrument = q.instrument;
    if (q.level) where.level = q.level;
    if (q.teacher) where.primaryTeacherId = q.teacher;
    if (q.search) {
      where.OR = [
        { firstName: { contains: q.search } },
        { lastName: { contains: q.search } },
        { email: { contains: q.search } },
      ];
    }
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Number(q.limit) || 20);
    const [items, total] = await Promise.all([
      prisma.student.findMany({
        where,
        include: {
          primaryTeacher: true,
          enrollments: {
            where: { active: true, classGroup: { deletedAt: null } },
            include: { classGroup: true },
          },
        },
        orderBy: { lastName: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.student.count({ where }),
    ]);
    return { items, total, page, limit };
  });

  /** Lista ligera de alumnos activos para selectores (sin paginar). */
  app.get("/options", async () => {
    return prisma.student.findMany({
      where: { deletedAt: null, status: "ACTIVE" },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
  });

  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const student = await prisma.student.findFirst({
      where: { id, deletedAt: null },
      include: {
        primaryTeacher: true,
        enrollments: { include: { classGroup: { include: { teacher: true } } } },
        discounts: true,
        fees: { include: { payments: true }, orderBy: { yearMonth: "desc" } },
      },
    });
    if (!student) return reply.status(404).send({ error: "Alumno no encontrado" });
    return student;
  });

  app.post("/", async (request, reply) => {
    const parsed = studentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }
    const d = parsed.data;
    return prisma.student.create({
      data: {
        ...d,
        birthDate: d.birthDate ? parseCalendarDate(d.birthDate) : null,
        email: d.email || null,
      },
    });
  });

  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = studentSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }
    const d = parsed.data;
    const existing = await prisma.student.findFirst({ where: { id, deletedAt: null } });
    if (!existing) return reply.status(404).send({ error: "Alumno no encontrado" });
    return prisma.student.update({
      where: { id },
      data: {
        ...d,
        birthDate: d.birthDate === undefined ? undefined : d.birthDate ? parseCalendarDate(d.birthDate) : null,
        email: d.email === undefined ? undefined : d.email || null,
      },
    });
  });

  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.student.findFirst({ where: { id, deletedAt: null } });
    if (!existing) return reply.status(404).send({ error: "Alumno no encontrado" });
    await prisma.student.update({
      where: { id },
      data: { deletedAt: new Date(), status: "INACTIVE" },
    });
    await recordAudit(request, {
      action: "SOFT_DELETE",
      entityType: "student",
      entityId: id,
      details: { name: `${existing.firstName} ${existing.lastName}` },
    });
    return { ok: true };
  });

  app.post("/:id/discounts", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = studentDiscountSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }
    const d = parsed.data;
    return prisma.studentDiscount.create({
      data: {
        studentId: id,
        ...d,
        validFrom: d.validFrom ? parseCalendarDate(d.validFrom) : null,
        validTo: d.validTo ? parseCalendarDate(d.validTo) : null,
      },
    });
  });

  app.delete("/:id/discounts/:discountId", async (request) => {
    const { discountId } = request.params as { id: string; discountId: string };
    await prisma.studentDiscount.delete({ where: { id: discountId } });
    return { ok: true };
  });

  app.get("/:id/fee-preview", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { yearMonth } = request.query as { yearMonth?: string };
    if (yearMonth !== undefined && !/^\d{4}-\d{2}$/.test(yearMonth)) {
      return reply.status(400).send({ error: "yearMonth inválido (YYYY-MM)" });
    }
    try {
      return await calculateStudentMonthlyFee(id, yearMonth);
    } catch {
      return reply.status(404).send({ error: "Alumno no encontrado" });
    }
  });

  app.post("/:id/generate-fee", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = generateMonthSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }
    try {
      return await generateFeeForStudent(id, parsed.data.yearMonth);
    } catch (e) {
      if (e instanceof FeeHasPaymentsError) {
        return reply.status(409).send({ error: e.message });
      }
      return reply.status(404).send({ error: "Alumno no encontrado" });
    }
  });
}
