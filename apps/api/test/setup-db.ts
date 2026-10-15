import fs from "node:fs";
import path from "node:path";
import { inject } from "vitest";

// Debe ejecutarse antes de importar el cliente de Prisma.
const templateDb = inject("templateDb");
const db = path.join(
  path.dirname(templateDb),
  `test-${process.pid}-${Math.random().toString(36).slice(2)}.db`,
);
fs.copyFileSync(templateDb, db);
process.env.DATABASE_URL = `file:${db}`;
