import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { moneyToEuros } from "../src/lib/money-api.js";

/**
 * Migración 20261016100000_money_int_cents: una base con importes Float en euros
 * (como las que hay en producción) pasa a Int en céntimos sin cambiar las cifras.
 */
const MIGRATION = "20261016100000_money_int_cents";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const prismaCli = path.join(repoRoot, "node_modules/prisma/build/index.js");

let dir: string;
let dbUrl: string;
let db: PrismaClient;

function migrateDeploy(migrationsDir: string) {
  const schemaDir = path.join(dir, `schema-${path.basename(migrationsDir)}`);
  fs.mkdirSync(schemaDir, { recursive: true });
  fs.copyFileSync(path.join(repoRoot, "prisma/schema.prisma"), path.join(schemaDir, "schema.prisma"));
  fs.cpSync(migrationsDir, path.join(schemaDir, "migrations"), { recursive: true });
  execFileSync(
    process.execPath,
    [prismaCli, "migrate", "deploy", "--schema", path.join(schemaDir, "schema.prisma")],
    { env: { ...process.env, DATABASE_URL: dbUrl }, stdio: "pipe" },
  );
}

const T = "1760000000000"; // fechas en milisegundos, como las guarda Prisma

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "finband-money-migration-"));
  dbUrl = `file:${path.join(dir, "data.db")}`;

  // 1. Base con las migraciones anteriores a la de céntimos: importes en euros (REAL).
  const before = path.join(dir, "migrations-before");
  fs.cpSync(path.join(repoRoot, "prisma/migrations"), before, { recursive: true });
  for (const name of fs.readdirSync(before)) {
    if (name >= MIGRATION && name !== "migration_lock.toml") {
      fs.rmSync(path.join(before, name), { recursive: true });
    }
  }
  migrateDeploy(before);

  db = new PrismaClient({ datasourceUrl: dbUrl });
  const sql = [
    `INSERT INTO "Teacher" (id, firstName, lastName, hourlyRate, monthlySalary, costPerClass, weeklyHours, transportCostPerDay, updatedAt)
     VALUES ('t1', 'Ana', 'Ruiz', 18.5, NULL, 22.25, 12.5, 6.5, ${T}),
            ('t2', 'Luis', 'Gil', 0, 1800.1, NULL, NULL, 0, ${T})`,
    `INSERT INTO "Student" (id, firstName, lastName, monthlyFee, updatedAt)
     VALUES ('s1', 'Eva', 'Paz', 47.35, ${T}), ('s2', 'Iván', 'Sol', NULL, ${T})`,
    `INSERT INTO "TariffRule" (id, name, amount, updatedAt) VALUES ('r1', 'General', 33.33, ${T})`,
    `INSERT INTO "StudentDiscount" (id, studentId, name, type, value)
     VALUES ('d1', 's1', 'Hermanos', 'PERCENT', 12.5), ('d2', 's1', 'Beca', 'FIXED', 3.33)`,
    `INSERT INTO "StudentFee" (id, studentId, yearMonth, baseAmount, discountAmount, totalAmount, amountPaid, status, updatedAt, lineItems)
     VALUES ('f1', 's1', '2026-10', 80.3, 10.1, 70.2, 30.3, 'PARTIAL', ${T},
             '[{"label":"Piano","amount":47.35},{"label":"Lenguaje","amount":32.95}]'),
            ('f2', 's2', '2026-10', 0.07, 0, 0.07, 0, 'PENDING', ${T}, NULL),
            ('f3', 's2', '2026-09', 10, 0, 10, 0, 'PENDING', ${T}, 'no es json')`,
    `INSERT INTO "StudentPayment" (id, feeId, amount, method)
     VALUES ('p1', 'f1', 10.1, 'EFECTIVO'), ('p2', 'f1', 10.1, 'BIZUM'), ('p3', 'f1', 10.1, 'TARJETA')`,
    `INSERT INTO "TeacherPayout" (id, teacherId, yearMonth, baseAmount, transportAmount, workDays, amount, amountPaid, status, updatedAt)
     VALUES ('o1', 't1', '2026-10', 664.29, 58.5, 9, 722.79, 100.01, 'PARTIAL', ${T})`,
    `INSERT INTO "TeacherPayoutPayment" (id, payoutId, amount) VALUES ('op1', 'o1', 100.01)`,
    `INSERT INTO "IncomeCategory" (id, name) VALUES ('ic', 'Cuotas')`,
    `INSERT INTO "ExpenseCategory" (id, name) VALUES ('ec', 'Material')`,
    `INSERT INTO "IncomeEntry" (id, date, concept, categoryId, amount, updatedAt)
     VALUES ('i1', ${T}, 'Matrícula', 'ic', 45.99, ${T})`,
    `INSERT INTO "ExpenseEntry" (id, date, concept, categoryId, amount, updatedAt)
     VALUES ('e1', ${T}, 'Partituras', 'ec', 128.5, ${T})`,
  ];
  for (const q of sql) await db.$executeRawUnsafe(q);

  // 2. Se aplican la migración de céntimos y todas las posteriores (como en producción).
  migrateDeploy(path.join(repoRoot, "prisma/migrations"));
});

afterAll(async () => {
  await db?.$disconnect();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

const raw = <T>(query: string) => db.$queryRawUnsafe<T[]>(query);

describe(`migración ${MIGRATION}`, () => {
  it("convierte cada importe a céntimos enteros", async () => {
    // Tras la migración de método único, cada profesor conserva el que se le aplicaba
    // (salario si lo había, si no coste por clase, si no precio hora), en céntimos.
    expect(
      await raw(`SELECT id, payMethod, payRate, transportCostPerDay FROM "Teacher" ORDER BY id`),
    ).toEqual([
      { id: "t1", payMethod: "PER_CLASS", payRate: 2225, transportCostPerDay: 650 },
      { id: "t2", payMethod: "MONTHLY_SALARY", payRate: 180010, transportCostPerDay: 0 },
    ]);
    expect(await raw(`SELECT id, monthlyFee FROM "Student" ORDER BY id`)).toEqual([
      { id: "s1", monthlyFee: 4735 },
      { id: "s2", monthlyFee: null },
    ]);
    expect(await raw(`SELECT amount FROM "TariffRule"`)).toEqual([{ amount: 3333 }]);
    expect(await raw(`SELECT baseAmount, discountAmount, totalAmount, amountPaid FROM "StudentFee" ORDER BY id`)).toEqual([
      { baseAmount: 8030, discountAmount: 1010, totalAmount: 7020, amountPaid: 3030 },
      { baseAmount: 7, discountAmount: 0, totalAmount: 7, amountPaid: 0 },
      { baseAmount: 1000, discountAmount: 0, totalAmount: 1000, amountPaid: 0 },
    ]);
    expect(await raw(`SELECT SUM(amount) AS total FROM "StudentPayment"`)).toEqual([{ total: 3030n }]) // SUM devuelve BigInt;
    expect(
      await raw(`SELECT baseAmount, transportAmount, amount, amountPaid, workDays FROM "TeacherPayout"`),
    ).toEqual([{ baseAmount: 66429, transportAmount: 5850, amount: 72279, amountPaid: 10001, workDays: 9 }]);
    expect(await raw(`SELECT amount FROM "TeacherPayoutPayment"`)).toEqual([{ amount: 10001 }]);
    expect(await raw(`SELECT amount FROM "IncomeEntry"`)).toEqual([{ amount: 4599 }]);
    expect(await raw(`SELECT amount FROM "ExpenseEntry"`)).toEqual([{ amount: 12850 }]);
  });

  it("las columnas quedan como INTEGER, no como REAL con decimales", async () => {
    const types = await raw<{ t: string }>(
      `SELECT DISTINCT typeof(amount) AS t FROM "StudentPayment"
       UNION SELECT DISTINCT typeof(totalAmount) FROM "StudentFee"
       UNION SELECT DISTINCT typeof(amount) FROM "TeacherPayout"`,
    );
    expect(types).toEqual([{ t: "integer" }]);
  });

  it("descuentos: FIXED en céntimos y PERCENT en centésimas de porcentaje", async () => {
    expect(await raw(`SELECT id, type, value FROM "StudentDiscount" ORDER BY id`)).toEqual([
      { id: "d1", type: "PERCENT", value: 1250 },
      { id: "d2", type: "FIXED", value: 333 },
    ]);
  });

  it("convierte las líneas JSON de la cuota y deja intacto lo que no es JSON", async () => {
    const rows = await raw<{ id: string; lineItems: string | null }>(
      `SELECT id, lineItems FROM "StudentFee" ORDER BY id`,
    );
    expect(JSON.parse(rows[0]!.lineItems!)).toEqual([
      { label: "Piano", amount: 4735 },
      { label: "Lenguaje", amount: 3295 },
    ]);
    expect(rows[1]!.lineItems).toBeNull();
    expect(rows[2]!.lineItems).toBe("no es json");
  });

  it("conserva relaciones e índices únicos", async () => {
    const fee = await db.studentFee.findUniqueOrThrow({
      where: { studentId_yearMonth: { studentId: "s1", yearMonth: "2026-10" } },
      include: { payments: true, student: { include: { discounts: true } } },
    });
    expect(fee.payments).toHaveLength(3);
    expect(fee.student.discounts).toHaveLength(2);
    expect(await db.teacherPayout.findFirstOrThrow({ include: { payments: true } })).toMatchObject({
      payments: [{ amount: 10001 }],
    });
    expect(await raw(`PRAGMA foreign_key_check`)).toEqual([]);
  });

  it("la API devuelve las mismas cifras en euros que había antes", async () => {
    const fee = await db.studentFee.findUniqueOrThrow({
      where: { id: "f1" },
      include: { payments: true },
    });
    expect(moneyToEuros(fee)).toMatchObject({
      baseAmount: 80.3,
      discountAmount: 10.1,
      totalAmount: 70.2,
      amountPaid: 30.3,
      lineItems: JSON.stringify([
        { label: "Piano", amount: 47.35 },
        { label: "Lenguaje", amount: 32.95 },
      ]),
      payments: [{ amount: 10.1 }, { amount: 10.1 }, { amount: 10.1 }],
    });
    const teacher = await db.teacher.findUniqueOrThrow({ where: { id: "t1" } });
    expect(moneyToEuros(teacher)).toMatchObject({ payMethod: "PER_CLASS", payRate: 22.25, transportCostPerDay: 6.5 });
  });
});
