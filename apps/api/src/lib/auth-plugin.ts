import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "./config.js";
import { prisma } from "./prisma.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; role: string; username: string; sv: number };
    user: { sub: string; role: string; username: string; sv: number };
  }
}

export const COOKIE_NAME = "finband_token";

export function issueSession(
  reply: FastifyReply,
  user: { id: string; role: string; username: string; sessionVersion: number },
) {
  const token = reply.server.jwt.sign({
    sub: user.id,
    role: user.role,
    username: user.username,
    sv: user.sessionVersion,
  });
  reply.setCookie(COOKIE_NAME, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure,
    maxAge: config.sessionMaxAgeSeconds,
  });
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const token = request.cookies[COOKIE_NAME];
  if (!token) {
    return reply.status(401).send({ error: "No autenticado" });
  }
  let decoded: { sub: string; sv?: number };
  try {
    decoded = await request.server.jwt.verify<{ sub: string; sv?: number }>(token);
  } catch {
    return reply.status(401).send({ error: "Sesión inválida" });
  }

  // El rol y la vigencia se leen de la base: un usuario borrado, degradado o con
  // la contraseña cambiada no conserva permisos hasta que caduque el token.
  const user = await prisma.user.findUnique({
    where: { id: decoded.sub },
    select: { id: true, username: true, role: true, sessionVersion: true },
  });
  if (!user || user.sessionVersion !== decoded.sv) {
    reply.clearCookie(COOKIE_NAME, { path: "/" });
    return reply.status(401).send({ error: "Sesión caducada" });
  }
  request.user = {
    sub: user.id,
    role: user.role,
    username: user.username,
    sv: user.sessionVersion,
  };
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
