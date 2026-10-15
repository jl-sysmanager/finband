// Debe ir primero: fija la zona horaria de la escuela antes de manejar fechas.
import "./lib/timezone.js";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  authenticate,
  blockReadonlyWrites,
  requireAdmin,
} from "./lib/auth-plugin.js";
import { config } from "./lib/config.js";
import { configureSqlite } from "./lib/prisma.js";
import { errorHandler } from "./lib/errors.js";
import { guardQueryParams } from "./lib/query-guard.js";
import { respondInEuros } from "./lib/money-api.js";
import { authRoutes, publicAuthRoutes } from "./routes/auth.js";
import { classRoutes } from "./routes/classes.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { financeRoutes } from "./routes/finance.js";
import { paymentRoutes } from "./routes/payments.js";
import { reportRoutes } from "./routes/reports.js";
import { publicSettingsRoutes, settingsRoutes } from "./routes/settings.js";
import { studentRoutes } from "./routes/students.js";
import { tariffRoutes } from "./routes/tariffs.js";
import { teacherRoutes } from "./routes/teachers.js";
import { backupRoutes } from "./routes/backup.js";
import { userRoutes } from "./routes/users.js";
import { auditRoutes } from "./routes/audit.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDist = process.env.WEB_DIST ?? path.join(__dirname, "../../web/dist");

export async function buildApp(options: { logger?: boolean } = {}) {
  const app = Fastify({ logger: options.logger ?? true });
  await configureSqlite();
  app.setErrorHandler(errorHandler);

  await app.register(cors, {
    origin: process.env.CORS_ORIGIN ?? true,
    credentials: true,
  });

  await app.register(cookie);
  await app.register(jwt, {
    secret: config.jwtSecret,
    sign: { expiresIn: config.sessionMaxAgeSeconds },
  });
  // Solo se aplica a las rutas que lo activan con `config.rateLimit` (login).
  await app.register(rateLimit, { global: false });

  app.get("/api/health", async () => ({ ok: true }));

  await app.register(
    async (api) => {
      await api.register(publicAuthRoutes, { prefix: "/auth" });
      await api.register(publicSettingsRoutes, { prefix: "/settings" });

      await api.register(async (secured) => {
        secured.addHook("preHandler", authenticate);
        secured.addHook("preHandler", guardQueryParams);
        secured.addHook("preHandler", blockReadonlyWrites);

        await secured.register(authRoutes, { prefix: "/auth" });
        await secured.register(dashboardRoutes, { prefix: "/dashboard" });
        // Rutas de entidades: trabajan en céntimos y responden en euros.
        await secured.register(async (entities) => {
          respondInEuros(entities);
          await entities.register(studentRoutes, { prefix: "/students" });
          await entities.register(teacherRoutes, { prefix: "/teachers" });
          await entities.register(classRoutes, { prefix: "/classes" });
          await entities.register(tariffRoutes, { prefix: "/tariffs" });
          await entities.register(financeRoutes, { prefix: "/finance" });
          await entities.register(paymentRoutes, { prefix: "/payments" });
        });
        // Informes y cuadro de mando construyen sus importes ya en euros.
        await secured.register(reportRoutes, { prefix: "/reports" });
        await secured.register(settingsRoutes, { prefix: "/settings" });

        await secured.register(async (adminScope) => {
          adminScope.addHook("preHandler", requireAdmin);
          await adminScope.register(userRoutes, { prefix: "/users" });
          await adminScope.register(backupRoutes, { prefix: "/backup" });
          await adminScope.register(auditRoutes, { prefix: "/audit-logs" });
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
      // Los ficheros de /assets llevan hash en el nombre: se pueden cachear para siempre.
      // index.html no, para que tras una actualización se carguen los nuevos.
      setHeaders(reply, filePath) {
        reply.header(
          "Cache-Control",
          filePath.includes(`${path.sep}assets${path.sep}`)
            ? "public, max-age=31536000, immutable"
            : "no-cache",
        );
      },
    });

    app.setNotFoundHandler(async (request, reply) => {
      // Un recurso que no existe (p. ej. un trozo de JS de una versión anterior)
      // debe dar 404: devolver index.html en su lugar deja la página en blanco.
      if (request.url.startsWith("/api") || request.url.startsWith("/assets/")) {
        return reply.status(404).send({ error: "No encontrado" });
      }
      return reply.header("Cache-Control", "no-cache").sendFile("index.html", webDist);
    });
  }

  return app;
}
