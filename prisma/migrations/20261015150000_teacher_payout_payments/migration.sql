-- CreateTable
CREATE TABLE "TeacherPayoutPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "payoutId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "paidAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeacherPayoutPayment_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "TeacherPayout" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TeacherPayoutPayment_payoutId_idx" ON "TeacherPayoutPayment"("payoutId");

-- Lo ya pagado antes de existir el historial pasa a ser un único pago.
INSERT INTO "TeacherPayoutPayment" ("id", "payoutId", "amount", "paidAt", "notes", "createdAt")
SELECT
  'migr' || lower(hex(randomblob(10))),
  "id",
  ROUND("amountPaid", 2),
  COALESCE("paidAt", "updatedAt"),
  'Pagado antes del historial de pagos',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM "TeacherPayout"
WHERE "amountPaid" > 0;

-- Fecha del último pago coherente con el historial.
UPDATE "TeacherPayout" SET "paidAt" = COALESCE("paidAt", "updatedAt") WHERE "amountPaid" > 0;
