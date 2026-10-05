import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  authenticate,
  blockReadonlyWrites,
  requireAdmin,
} from "./lib/auth-plugin.js";
import { authRoutes, publicAuthRoutes } from "./routes/auth.js";
import { classRoutes } from "./routes/classes.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { financeRoutes } from "./routes/finance.js";
import { paymentRoutes } from "./routes/payments.js";
import { reportRoutes } from "./routes/reports.js";
import { settingsRoutes } from "./routes/settings.js";
import { studentRoutes } from "./routes/students.js";
import { tariffRoutes } from "./routes/tariffs.js";
import { teacherRoutes } from "./routes/teachers.js";
import { backupRoutes } from "./routes/backup.js";
import { userRoutes } from "./routes/users.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || (process.env.NODE_ENV === "production" ? 8080 : 3000);
const webDist = process.env.WEB_DIST ?? path.join(__dirname, "../../web/dist");

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: process.env.CORS_ORIGIN ?? true,
  credentials: true,
});

await app.register(cookie);
await app.register(jwt, {
  secret: process.env.JWT_SECRET ?? "dev-secret-change-me",
});

app.get("/api/health", async () => ({ ok: true }));

await app.register(
  async (api) => {
    await api.register(publicAuthRoutes, { prefix: "/auth" });

    await api.register(async (secured) => {
      secured.addHook("preHandler", authenticate);
      secured.addHook("preHandler", blockReadonlyWrites);

      await secured.register(authRoutes, { prefix: "/auth" });
      await secured.register(dashboardRoutes, { prefix: "/dashboard" });
      await secured.register(studentRoutes, { prefix: "/students" });
      await secured.register(teacherRoutes, { prefix: "/teachers" });
      await secured.register(classRoutes, { prefix: "/classes" });
      await secured.register(tariffRoutes, { prefix: "/tariffs" });
      await secured.register(financeRoutes, { prefix: "/finance" });
      await secured.register(paymentRoutes, { prefix: "/payments" });
      await secured.register(reportRoutes, { prefix: "/reports" });
      await secured.register(settingsRoutes, { prefix: "/settings" });

      await secured.register(async (adminScope) => {
        adminScope.addHook("preHandler", requireAdmin);
        await adminScope.register(userRoutes, { prefix: "/users" });
        await adminScope.register(backupRoutes, { prefix: "/backup" });
      }, { prefix: "/admin" });
    });
  },
  { prefix: "/api/v1" },
);

if (process.env.SERVE_WEB === "true" || process.env.NODE_ENV === "production") {
  await app.register(fastifyStatic, {
    root: webDist,
    prefix: "/",
    wildcard: false,
  });

  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith("/api")) {
      return reply.status(404).send({ error: "No encontrado" });
    }
    return reply.sendFile("index.html", webDist);
  });
}

try {
  await app.listen({ port, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
