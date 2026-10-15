import type { FastifyInstance } from "fastify";
import { teacherSchema } from "@finband/shared";
import { recordAudit } from "../lib/audit.js";
import { prisma } from "../lib/prisma.js";

export async function teacherRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const q = request.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = { deletedAt: null };
    if (q.search) {
      where.OR = [
        { firstName: { contains: q.search } },
        { lastName: { contains: q.search } },
        { specialty: { contains: q.search } },
      ];
    }
    return prisma.teacher.findMany({
      where,
      include: {
        classGroups: { where: { deletedAt: null } },
        _count: { select: { primaryStudents: true } },
      },
      orderBy: { lastName: "asc" },
    });
  });

  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const teacher = await prisma.teacher.findFirst({
      where: { id, deletedAt: null },
      include: {
        classGroups: {
          where: { deletedAt: null },
          include: { enrollments: { where: { active: true } } },
        },
        payouts: { orderBy: { yearMonth: "desc" } },
        primaryStudents: { where: { deletedAt: null } },
      },
    });
    if (!teacher) return reply.status(404).send({ error: "Profesor no encontrado" });
    return teacher;
  });

  app.post("/", async (request, reply) => {
    const parsed = teacherSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }
    const d = parsed.data;
    const saved = await prisma.teacher.create({
      data: { ...d, email: d.email || null },
    });
    await recordAudit(request, {
      action: "CREATE",
      entityType: "teacher",
      entityId: saved.id,
      details: null,
    });
    return saved;
  });

  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = teacherSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }
    const d = parsed.data;
    const saved = await prisma.teacher.update({
      where: { id },
      data: {
        ...d,
        email: d.email === undefined ? undefined : d.email || null,
      },
    });
    await recordAudit(request, {
      action: "UPDATE",
      entityType: "teacher",
      entityId: saved.id,
      details: { fields: Object.keys((request.body ?? {}) as object) },
    });
    return saved;
  });

  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.teacher.findFirst({ where: { id, deletedAt: null } });
    if (!existing) return reply.status(404).send({ error: "Profesor no encontrado" });
    await prisma.teacher.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await recordAudit(request, {
      action: "SOFT_DELETE",
      entityType: "teacher",
      entityId: id,
      details: { name: `${existing.firstName} ${existing.lastName}` },
    });
    return { ok: true };
  });
}
