import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { TestProject } from "vitest/node";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

declare module "vitest" {
  export interface ProvidedContext {
    templateDb: string;
  }
}

/** Crea una vez una base con todas las migraciones; cada fichero de test trabaja con una copia. */
export default function setup(project: TestProject) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "finband-test-"));
  const templateDb = path.join(dir, "template.db");
  execFileSync(
    process.execPath,
    [
      path.join(repoRoot, "node_modules/prisma/build/index.js"),
      "migrate",
      "deploy",
      "--schema",
      path.join(repoRoot, "prisma/schema.prisma"),
    ],
    { env: { ...process.env, DATABASE_URL: `file:${templateDb}` }, stdio: "ignore" },
  );
  project.provide("templateDb", templateDb);

  return () => fs.rmSync(dir, { recursive: true, force: true });
}
