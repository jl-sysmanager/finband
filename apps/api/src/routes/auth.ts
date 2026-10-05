import bcrypt from "bcryptjs";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { loginSchema } from "@finband/shared";
import { COOKIE_NAME } from "../lib/auth-plugin.js";
import { prisma } from "../lib/prisma.js";

export async function publicAuthRoutes(app: FastifyInstance) {
  app.post("/login", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }
    const user = await prisma.user.findUnique({
      where: { username: parsed.data.username },
    });
    if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      return reply.status(401).send({ error: "Usuario o contraseña incorrectos" });
    }
    const token = app.jwt.sign({
      sub: user.id,
      role: user.role,
      username: user.username,
    });
    reply.setCookie(COOKIE_NAME, token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7,
    });
    return { id: user.id, username: user.username, role: user.role };
  });

  app.post("/logout", async (_request, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: "/" });
    return { ok: true };
  });
}

export async function authRoutes(app: FastifyInstance) {
  app.get("/me", async (request) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.sub },
      select: { id: true, username: true, role: true },
    });
    return user;
  });
}
