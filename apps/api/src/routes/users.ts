import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { userCreateSchema, userUpdateSchema } from "@finband/shared";
import type { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export async function userRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    return prisma.user.findMany({
      select: { id: true, username: true, role: true, createdAt: true },
      orderBy: { username: "asc" },
    });
  });

  app.post("/", async (request, reply) => {
    const parsed = userCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }
    const hash = await bcrypt.hash(parsed.data.password, 10);
    return prisma.user.create({
      data: {
        username: parsed.data.username,
        passwordHash: hash,
        role: parsed.data.role,
      },
      select: { id: true, username: true, role: true },
    });
  });

  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = userUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: "Usuario no encontrado" });

    const data = parsed.data;
    if (id === request.user.sub && data.role && data.role !== existing.role) {
      return reply.status(400).send({ error: "No puedes cambiar tu propio rol" });
    }
    if (data.username) {
      const clash = await prisma.user.findFirst({
        where: { username: data.username, NOT: { id } },
      });
      if (clash) return reply.status(400).send({ error: "Ese nombre de usuario ya existe" });
    }

    const updateData: { username?: string; role?: UserRole; passwordHash?: string } = {};
    if (data.username) updateData.username = data.username;
    if (data.role) updateData.role = data.role;
    if (data.password) updateData.passwordHash = await bcrypt.hash(data.password, 10);

    if (Object.keys(updateData).length === 0) {
      return reply.status(400).send({ error: "Nada que actualizar" });
    }

    return prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, username: true, role: true, createdAt: true },
    });
  });

  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (id === request.user.sub) {
      return reply.status(400).send({ error: "No puedes eliminar tu usuario" });
    }
    await prisma.user.delete({ where: { id } });
    return { ok: true };
  });
}
