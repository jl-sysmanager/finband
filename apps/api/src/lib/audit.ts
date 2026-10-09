import type { FastifyRequest } from "fastify";
import { prisma } from "./prisma.js";

export type AuditInput = {
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown> | string | null;
};

export async function recordAudit(request: FastifyRequest, input: AuditInput) {
  const user = request.user;
  const details =
    input.details == null
      ? null
      : typeof input.details === "string"
        ? input.details
        : JSON.stringify(input.details);

  await prisma.auditLog.create({
    data: {
      userId: user?.sub ?? null,
      username: user?.username ?? "system",
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      details,
    },
  });
}
