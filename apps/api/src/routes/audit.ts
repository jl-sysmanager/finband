import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

export async function auditRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const q = request.query as Record<string, string | undefined>;
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 50));
    const entityType = q.entityType?.trim();

    return prisma.auditLog.findMany({
      where: entityType ? { entityType } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  });
}
