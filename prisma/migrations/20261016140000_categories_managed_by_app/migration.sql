-- AlterTable
ALTER TABLE "IncomeCategory" ADD COLUMN "managedByApp" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ExpenseCategory" ADD COLUMN "managedByApp" BOOLEAN NOT NULL DEFAULT false;

-- El balance ya incluye los cobros de cuotas y los pagos a profesores registrados en
-- la app: los apuntes manuales de estas categorías los duplicarían.
UPDATE "IncomeCategory" SET "managedByApp" = true WHERE "name" = 'Cuotas mensuales';
UPDATE "ExpenseCategory" SET "managedByApp" = true WHERE "name" = 'Profesores';
