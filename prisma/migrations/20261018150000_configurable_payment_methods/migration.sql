-- Métodos de pago configurables desde Configuración (antes, enum fijo en el código).
-- Los cobros e ingresos guardan el id del método; los ids existentes se conservan.

-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX "PaymentMethod_label_key" ON "PaymentMethod"("label");

INSERT INTO "PaymentMethod" ("id", "label", "sortOrder") VALUES
    ('EFECTIVO', 'Efectivo', 0),
    ('TRANSFERENCIA', 'Transferencia', 1),
    ('BIZUM', 'Bizum', 2),
    ('TARJETA', 'Tarjeta', 3);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    CONSTRAINT "IncomeEntry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "IncomeCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "IncomeEntry_method_fkey" FOREIGN KEY ("method") REFERENCES "PaymentMethod" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_IncomeEntry" ("amount", "categoryId", "concept", "createdAt", "date", "id", "method", "notes", "updatedAt") SELECT "amount", "categoryId", "concept", "createdAt", "date", "id", "method", "notes", "updatedAt" FROM "IncomeEntry";
DROP TABLE "IncomeEntry";
ALTER TABLE "new_IncomeEntry" RENAME TO "IncomeEntry";
CREATE INDEX "IncomeEntry_date_idx" ON "IncomeEntry"("date");
CREATE TABLE "new_StudentPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "feeId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "paidAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentPayment_feeId_fkey" FOREIGN KEY ("feeId") REFERENCES "StudentFee" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudentPayment_method_fkey" FOREIGN KEY ("method") REFERENCES "PaymentMethod" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_StudentPayment" ("amount", "createdAt", "feeId", "id", "method", "notes", "paidAt") SELECT "amount", "createdAt", "feeId", "id", "method", "notes", "paidAt" FROM "StudentPayment";
DROP TABLE "StudentPayment";
ALTER TABLE "new_StudentPayment" RENAME TO "StudentPayment";
CREATE INDEX "StudentPayment_feeId_idx" ON "StudentPayment"("feeId");
CREATE INDEX "StudentPayment_paidAt_idx" ON "StudentPayment"("paidAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
