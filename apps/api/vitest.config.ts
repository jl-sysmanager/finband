import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    setupFiles: ["test/setup-db.ts"],
    // SQLite por fichero de test: sin paralelismo dentro de cada fichero.
    pool: "forks",
  },
});
