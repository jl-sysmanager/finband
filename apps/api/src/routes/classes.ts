import type { FastifyInstance } from "fastify";
import {
  attendanceRecordSchema,
  attendanceSessionSchema,
  classGroupSchema,
} from "@finband/shared";
import { prisma } from "../lib/prisma.js";

export async function classRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const q = request.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = {};
    if (q.type) where.type = q.type;
    if (q.teacherId) where.teacherId = q.teacherId;
    if (q.search) where.name = { contains: q.search };
    return prisma.classGroup.findMany({
      where,
      include: {
        teacher: true,
        _count: { select: { enrollments: { where: { active: true } } } },
      },
      orderBy: { name: "asc" },
    });
  });

  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const group = await prisma.classGroup.findUnique({
      where: { id },
      include: {
        teacher: true,
        enrollments: {
          where: { active: true },
          include: { student: true },
        },
        sessions: {
          include: { records: true },
          orderBy: { sessionDate: "desc" },
          take: 30,
        },
      },
    });
    if (!group) return reply.status(404).send({ error: "Clase no encontrada" });
    return group;
  });

  app.post("/", async (request, reply) => {
    const parsed = classGroupSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }
    const d = parsed.data;
    return prisma.classGroup.create({ data: d });
  });

  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = classGroupSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }
    return prisma.classGroup.update({ where: { id }, data: parsed.data });
  });

  app.delete("/:id", async (request) => {
    const { id } = request.params as { id: string };
    await prisma.classGroup.delete({ where: { id } });
    return { ok: true };
  });

  app.post("/:id/enrollments", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { studentId } = request.body as { studentId?: string };
    if (!studentId) {
      return reply.status(400).send({ error: "studentId requerido" });
    }
    const group = await prisma.classGroup.findUnique({
      where: { id },
      include: { _count: { select: { enrollments: { where: { active: true } } } } },
    });
    if (!group) return reply.status(404).send({ error: "Clase no encontrada" });
    if (group._count.enrollments >= group.maxStudents) {
      return reply.status(400).send({ error: "Clase completa" });
    }
    return prisma.enrollment.upsert({
      where: { studentId_classGroupId: { studentId, classGroupId: id } },
      create: { studentId, classGroupId: id, active: true },
      update: { active: true },
    });
  });

  app.delete("/:id/enrollments/:studentId", async (request) => {
    const { id, studentId } = request.params as { id: string; studentId: string };
    await prisma.enrollment.updateMany({
      where: { classGroupId: id, studentId },
      data: { active: false },
    });
    return { ok: true };
  });

  app.post("/:id/sessions", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = attendanceSessionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }
    const enrollments = await prisma.enrollment.findMany({
      where: { classGroupId: id, active: true },
    });
    const session = await prisma.attendanceSession.create({
      data: {
        classGroupId: id,
        sessionDate: new Date(parsed.data.sessionDate),
        notes: parsed.data.notes,
        records: {
          create: enrollments.map((e) => ({
            studentId: e.studentId,
            present: true,
          })),
        },
      },
      include: { records: true },
    });
    return session;
  });

  app.patch("/:id/sessions/:sessionId/attendance", async (request, reply) => {
    const { sessionId } = request.params as { id: string; sessionId: string };
    const body = request.body as {
      records?: Array<{ studentId: string; present: boolean; notes?: string }>;
    };
    if (!body.records?.length) {
      return reply.status(400).send({ error: "records requerido" });
    }
    for (const rec of body.records) {
      const parsed = attendanceRecordSchema.safeParse(rec);
      if (!parsed.success) continue;
      await prisma.attendanceRecord.upsert({
        where: {
          sessionId_studentId: {
            sessionId,
            studentId: parsed.data.studentId,
          },
        },
        create: {
          sessionId,
          studentId: parsed.data.studentId,
          present: parsed.data.present,
          notes: parsed.data.notes,
        },
        update: {
          present: parsed.data.present,
          notes: parsed.data.notes,
        },
      });
    }
    return prisma.attendanceSession.findUnique({
      where: { id: sessionId },
      include: { records: true },
    });
  });
}
