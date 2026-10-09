import type { FastifyInstance } from "fastify";
import {
  generateMonthPreviewSchema,
  generateMonthSchema,
  tariffRuleSchema,
} from "@finband/shared";
import { recordAudit } from "../lib/audit.js";
import {
  calculateStudentMonthlyFee,
  generateFeesForMonth,
  previewFeesForMonth,
} from "../lib/tariffs.js";
import { prisma } from "../lib/prisma.js";

export async function tariffRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    return prisma.tariffRule.findMany({ orderBy: [{ priority: "desc" }, { name: "asc" }] });
  });

  app.post("/", async (request, reply) => {
    const parsed = tariffRuleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }
    return prisma.tariffRule.create({ data: parsed.data });
  });

  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = tariffRuleSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }
    return prisma.tariffRule.update({ where: { id }, data: parsed.data });
  });

  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.tariffRule.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ error: "Tarifa no encontrada" });
    }
    await prisma.tariffRule.delete({ where: { id } });
    await recordAudit(request, {
      action: "DELETE",
      entityType: "tariff",
      entityId: id,
      details: { name: existing.name },
    });
    return { ok: true };
  });

  app.post("/preview", async (request, reply) => {
    const { studentId } = request.body as { studentId?: string };
    if (!studentId) {
      return reply.status(400).send({ error: "studentId requerido" });
    }
    try {
      return await calculateStudentMonthlyFee(studentId);
    } catch {
      return reply.status(404).send({ error: "Alumno no encontrado" });
    }
  });

  app.post("/generate-month/preview", async (request, reply) => {
    const parsed = generateMonthPreviewSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }
    return previewFeesForMonth(parsed.data.yearMonth);
  });

  app.post("/generate-month", async (request, reply) => {
    const parsed = generateMonthSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }
    const { generated, skipped } = await generateFeesForMonth(parsed.data.yearMonth, {
      excludeStudentIds: parsed.data.excludeStudentIds,
    });
    await recordAudit(request, {
      action: "GENERATE_FEES",
      entityType: "student_fee",
      details: {
        yearMonth: parsed.data.yearMonth,
        generated,
        skipped,
        excluded: parsed.data.excludeStudentIds?.length ?? 0,
      },
    });
    return { generated, skipped, yearMonth: parsed.data.yearMonth };
  });
}
