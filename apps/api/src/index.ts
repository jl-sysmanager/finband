import { buildApp } from "./app.js";

const port = Number(process.env.PORT) || (process.env.NODE_ENV === "production" ? 8080 : 3000);

const app = await buildApp();

try {
  await app.listen({ port, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
