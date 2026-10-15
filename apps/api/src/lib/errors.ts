import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { Prisma } from "@prisma/client";

const PRISMA_ERRORS: Record<string, { status: number; message: string }> = {
  P2002: { status: 409, message: "Ya existe un registro con esos datos" },
  P2003: { status: 409, message: "No se puede completar: hay otros datos que dependen de este registro" },
  P2025: { status: 404, message: "Registro no encontrado" },
};

/**
 * Manejador global: los errores conocidos de Prisma pasan a 404/409 con un
 * mensaje claro y el resto de errores inesperados no filtran detalles internos.
 */
export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = PRISMA_ERRORS[error.code];
    if (mapped) {
      request.log.info({ code: error.code, meta: error.meta }, mapped.message);
      return reply.status(mapped.status).send({ error: mapped.message });
    }
  }
  const status = error.statusCode ?? 500;
  if (status < 500) {
    // Algunos plugins (p. ej. el límite de intentos) lanzan su propio cuerpo con `error`.
    const custom = (error as { error?: unknown }).error;
    return reply.status(status).send({ error: typeof custom === "string" ? custom : error.message });
  }
  request.log.error(error);
  return reply.status(500).send({ error: "Error interno del servidor" });
}
