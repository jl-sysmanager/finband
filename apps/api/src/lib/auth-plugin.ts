import type { FastifyReply, FastifyRequest } from "fastify";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; role: string; username: string };
    user: { sub: string; role: string; username: string };
  }
}

export const COOKIE_NAME = "finband_token";

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const token = request.cookies[COOKIE_NAME];
    if (!token) {
      return reply.status(401).send({ error: "No autenticado" });
    }
    const decoded = await request.server.jwt.verify<{
      sub: string;
      role: string;
      username: string;
    }>(token);
    request.user = decoded;
  } catch {
    return reply.status(401).send({ error: "Sesión inválida" });
  }
}

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (request.user.role !== "ADMIN") {
    return reply.status(403).send({ error: "Solo administradores" });
  }
}

export function blockReadonlyWrites(
  request: FastifyRequest,
  reply: FastifyReply,
  done: () => void,
) {
  const writeMethods = ["POST", "PUT", "PATCH", "DELETE"];
  if (
    writeMethods.includes(request.method) &&
    request.user?.role === "READONLY" &&
    !request.url.includes("/auth/logout")
  ) {
    reply.status(403).send({ error: "Perfil de solo lectura" });
    return;
  }
  done();
}
