import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { userCreateSchema } from "@finband/shared";
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

  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (id === request.user.sub) {
      return reply.status(400).send({ error: "No puedes eliminar tu usuario" });
    }
    await prisma.user.delete({ where: { id } });
    return { ok: true };
  });
}
