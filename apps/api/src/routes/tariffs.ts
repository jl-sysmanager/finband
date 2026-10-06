import type { FastifyInstance } from "fastify";
import { generateMonthSchema, tariffRuleSchema } from "@finband/shared";
import {
  calculateStudentMonthlyFee,
  generateFeesForMonth,
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

  app.post("/generate-month", async (request, reply) => {
    const parsed = generateMonthSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }
    const count = await generateFeesForMonth(parsed.data.yearMonth);
    return { generated: count, yearMonth: parsed.data.yearMonth };
  });
}
