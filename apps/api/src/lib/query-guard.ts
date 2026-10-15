import type { FastifyReply, FastifyRequest } from "fastify";

const YEAR_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const POSITIVE_INT = /^[1-9]\d{0,5}$/;
const YEAR = /^(19|20)\d{2}$/;
const STATUSES = new Set(["ACTIVE", "INACTIVE", "PENDING", "PARTIAL", "PAID"]);

/** Formato de los parámetros de consulta comunes, por nombre. */
const RULES: Record<string, (v: string) => boolean> = {
  yearMonth: (v) => YEAR_MONTH.test(v),
  monthFrom: (v) => YEAR_MONTH.test(v),
  monthTo: (v) => YEAR_MONTH.test(v),
  from: (v) => DATE.test(v),
  to: (v) => DATE.test(v),
  paidFrom: (v) => DATE.test(v),
  paidTo: (v) => DATE.test(v),
  week: (v) => DATE.test(v),
  year: (v) => YEAR.test(v),
  page: (v) => POSITIVE_INT.test(v),
  limit: (v) => POSITIVE_INT.test(v),
  status: (v) => STATUSES.has(v),
};

/**
 * Rechaza con 400 los parámetros de consulta mal formados antes de llegar a las
 * rutas (antes acababan en fechas inválidas o en errores 500 de Prisma).
 */
export async function guardQueryParams(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as Record<string, unknown> | undefined;
  if (!query) return;
  for (const [name, check] of Object.entries(RULES)) {
    const value = query[name];
    if (value === undefined || value === "") continue;
    if (typeof value !== "string" || !check(value)) {
      return reply.status(400).send({ error: `Parámetro de consulta inválido: ${name}` });
    }
  }
}
