-- Importes de dinero: de Float en euros a Int en céntimos (ROUND(x * 100)).
-- StudentDiscount.value pasa a centésimas de su unidad: céntimos si es FIXED,
-- centésimas de punto porcentual si es PERCENT (12,5 % → 1250).
-- Las líneas JSON de StudentFee.lineItems también pasan a céntimos.
-- SQLite no permite cambiar el tipo de una columna: se reconstruyen las tablas
-- como lo genera Prisma, convirtiendo los datos al copiarlos.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ExpenseEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "concept" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExpenseEntry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ExpenseEntry" ("amount", "categoryId", "concept", "createdAt", "date", "id", "notes", "updatedAt")
SELECT
  CAST(ROUND("amount" * 100) AS INTEGER),
  "categoryId",
  "concept",
  "createdAt",
  "date",
  "id",
  "notes",
  "updatedAt"
FROM "ExpenseEntry";
DROP TABLE "ExpenseEntry";
ALTER TABLE "new_ExpenseEntry" RENAME TO "ExpenseEntry";
CREATE TABLE "new_IncomeEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "concept" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IncomeEntry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "IncomeCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_IncomeEntry" ("amount", "categoryId", "concept", "createdAt", "date", "id", "method", "notes", "updatedAt")
SELECT
  CAST(ROUND("amount" * 100) AS INTEGER),
  "categoryId",
  "concept",
  "createdAt",
  "date",
  "id",
  "method",
  "notes",
  "updatedAt"
FROM "IncomeEntry";
DROP TABLE "IncomeEntry";
ALTER TABLE "new_IncomeEntry" RENAME TO "IncomeEntry";
CREATE TABLE "new_Student" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "birthDate" DATETIME,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "legalGuardian" TEXT,
    "notes" TEXT,
    "mainInstrument" TEXT,
    "level" TEXT,
    "primaryTeacherId" TEXT,
    "monthlyFee" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Student_primaryTeacherId_fkey" FOREIGN KEY ("primaryTeacherId") REFERENCES "Teacher" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Student" ("address", "birthDate", "createdAt", "deletedAt", "email", "firstName", "id", "lastName", "legalGuardian", "level", "mainInstrument", "monthlyFee", "notes", "phone", "primaryTeacherId", "status", "updatedAt")
SELECT
  "address",
  "birthDate",
  "createdAt",
  "deletedAt",
  "email",
  "firstName",
  "id",
  "lastName",
  "legalGuardian",
  "level",
  "mainInstrument",
  CAST(ROUND("monthlyFee" * 100) AS INTEGER),
  "notes",
  "phone",
  "primaryTeacherId",
  "status",
  "updatedAt"
FROM "Student";
DROP TABLE "Student";
ALTER TABLE "new_Student" RENAME TO "Student";
CREATE TABLE "new_StudentDiscount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "isScholarship" BOOLEAN NOT NULL DEFAULT false,
    "validFrom" DATETIME,
    "validTo" DATETIME,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentDiscount_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_StudentDiscount" ("active", "createdAt", "id", "isScholarship", "name", "studentId", "type", "validFrom", "validTo", "value")
SELECT
  "active",
  "createdAt",
  "id",
  "isScholarship",
  "name",
  "studentId",
  "type",
  "validFrom",
  "validTo",
  CAST(ROUND("value" * 100) AS INTEGER)
FROM "StudentDiscount";
DROP TABLE "StudentDiscount";
ALTER TABLE "new_StudentDiscount" RENAME TO "StudentDiscount";
CREATE TABLE "new_StudentFee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "baseAmount" INTEGER NOT NULL,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL,
    "amountPaid" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dueDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lineItems" TEXT,
    CONSTRAINT "StudentFee_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_StudentFee" ("amountPaid", "baseAmount", "createdAt", "discountAmount", "dueDate", "id", "lineItems", "status", "studentId", "totalAmount", "updatedAt", "yearMonth")
SELECT
  CAST(ROUND("amountPaid" * 100) AS INTEGER),
  CAST(ROUND("baseAmount" * 100) AS INTEGER),
  "createdAt",
  CAST(ROUND("discountAmount" * 100) AS INTEGER),
  "dueDate",
  "id",
  CASE
    WHEN "lineItems" IS NOT NULL AND json_valid("lineItems") AND json_type("lineItems") = 'array' THEN (
      SELECT json_group_array(json(item))
      FROM (
        SELECT CASE
          WHEN json_type(li.value, '$.amount') IN ('integer', 'real')
            THEN json_set(li.value, '$.amount', CAST(ROUND(json_extract(li.value, '$.amount') * 100) AS INTEGER))
          ELSE li.value
        END AS item
        FROM json_each("StudentFee"."lineItems") AS li
        ORDER BY li.key
      )
    )
    ELSE "lineItems"
  END,
  "status",
  "studentId",
  CAST(ROUND("totalAmount" * 100) AS INTEGER),
  "updatedAt",
  "yearMonth"
FROM "StudentFee";
DROP TABLE "StudentFee";
ALTER TABLE "new_StudentFee" RENAME TO "StudentFee";
CREATE UNIQUE INDEX "StudentFee_studentId_yearMonth_key" ON "StudentFee"("studentId", "yearMonth");
CREATE TABLE "new_StudentPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "feeId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "paidAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentPayment_feeId_fkey" FOREIGN KEY ("feeId") REFERENCES "StudentFee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_StudentPayment" ("amount", "createdAt", "feeId", "id", "method", "notes", "paidAt")
SELECT
  CAST(ROUND("amount" * 100) AS INTEGER),
  "createdAt",
  "feeId",
  "id",
  "method",
  "notes",
  "paidAt"
FROM "StudentPayment";
DROP TABLE "StudentPayment";
ALTER TABLE "new_StudentPayment" RENAME TO "StudentPayment";
CREATE TABLE "new_TariffRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "instrument" TEXT,
    "level" TEXT,
    "classType" TEXT,
    "amount" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_TariffRule" ("active", "amount", "classType", "createdAt", "id", "instrument", "level", "name", "priority", "updatedAt")
SELECT
  "active",
  CAST(ROUND("amount" * 100) AS INTEGER),
  "classType",
  "createdAt",
  "id",
  "instrument",
  "level",
  "name",
  "priority",
  "updatedAt"
FROM "TariffRule";
DROP TABLE "TariffRule";
ALTER TABLE "new_TariffRule" RENAME TO "TariffRule";
CREATE TABLE "new_Teacher" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "specialty" TEXT,
    "hourlyRate" INTEGER NOT NULL DEFAULT 0,
    "monthlySalary" INTEGER,
    "costPerClass" INTEGER,
    "weeklyHours" REAL,
    "transportCostPerDay" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);
INSERT INTO "new_Teacher" ("costPerClass", "createdAt", "deletedAt", "email", "firstName", "hourlyRate", "id", "lastName", "monthlySalary", "phone", "specialty", "transportCostPerDay", "updatedAt", "weeklyHours")
SELECT
  CAST(ROUND("costPerClass" * 100) AS INTEGER),
  "createdAt",
  "deletedAt",
  "email",
  "firstName",
  CAST(ROUND("hourlyRate" * 100) AS INTEGER),
  "id",
  "lastName",
  CAST(ROUND("monthlySalary" * 100) AS INTEGER),
  "phone",
  "specialty",
  CAST(ROUND("transportCostPerDay" * 100) AS INTEGER),
  "updatedAt",
  "weeklyHours"
FROM "Teacher";
DROP TABLE "Teacher";
ALTER TABLE "new_Teacher" RENAME TO "Teacher";
CREATE TABLE "new_TeacherPayout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teacherId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "baseAmount" INTEGER NOT NULL DEFAULT 0,
    "transportAmount" INTEGER NOT NULL DEFAULT 0,
    "workDays" INTEGER NOT NULL DEFAULT 0,
    "amount" INTEGER NOT NULL,
    "amountPaid" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TeacherPayout_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TeacherPayout" ("amount", "amountPaid", "baseAmount", "createdAt", "id", "notes", "paidAt", "status", "teacherId", "transportAmount", "updatedAt", "workDays", "yearMonth")
SELECT
  CAST(ROUND("amount" * 100) AS INTEGER),
  CAST(ROUND("amountPaid" * 100) AS INTEGER),
  CAST(ROUND("baseAmount" * 100) AS INTEGER),
  "createdAt",
  "id",
  "notes",
  "paidAt",
  "status",
  "teacherId",
  CAST(ROUND("transportAmount" * 100) AS INTEGER),
  "updatedAt",
  "workDays",
  "yearMonth"
FROM "TeacherPayout";
DROP TABLE "TeacherPayout";
ALTER TABLE "new_TeacherPayout" RENAME TO "TeacherPayout";
CREATE UNIQUE INDEX "TeacherPayout_teacherId_yearMonth_key" ON "TeacherPayout"("teacherId", "yearMonth");
CREATE TABLE "new_TeacherPayoutPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "payoutId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "paidAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeacherPayoutPayment_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "TeacherPayout" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TeacherPayoutPayment" ("amount", "createdAt", "id", "notes", "paidAt", "payoutId")
SELECT
  CAST(ROUND("amount" * 100) AS INTEGER),
  "createdAt",
  "id",
  "notes",
  "paidAt",
  "payoutId"
FROM "TeacherPayoutPayment";
DROP TABLE "TeacherPayoutPayment";
ALTER TABLE "new_TeacherPayoutPayment" RENAME TO "TeacherPayoutPayment";
CREATE INDEX "TeacherPayoutPayment_payoutId_idx" ON "TeacherPayoutPayment"("payoutId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

