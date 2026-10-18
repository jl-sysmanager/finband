-- Un único método de honorarios por profesor (salario mensual, precio hora o coste
-- por clase) con una sola tarifa, y fuera las horas semanales.
--
-- Cada profesor conserva el método que ya se le aplicaba: el cálculo anterior
-- usaba el salario si lo había, si no el coste por clase y si no el precio hora.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Teacher" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "specialty" TEXT,
    "payMethod" TEXT NOT NULL DEFAULT 'HOURLY',
    "payRate" INTEGER NOT NULL DEFAULT 0,
    "transportCostPerDay" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);
INSERT INTO "new_Teacher" (
    "id", "firstName", "lastName", "phone", "email", "specialty",
    "payMethod", "payRate", "transportCostPerDay", "createdAt", "updatedAt", "deletedAt"
)
SELECT
    "id", "firstName", "lastName", "phone", "email", "specialty",
    CASE
        WHEN COALESCE("monthlySalary", 0) > 0 THEN 'MONTHLY_SALARY'
        WHEN COALESCE("costPerClass", 0) > 0 THEN 'PER_CLASS'
        ELSE 'HOURLY'
    END,
    CASE
        WHEN COALESCE("monthlySalary", 0) > 0 THEN "monthlySalary"
        WHEN COALESCE("costPerClass", 0) > 0 THEN "costPerClass"
        ELSE COALESCE("hourlyRate", 0)
    END,
    "transportCostPerDay", "createdAt", "updatedAt", "deletedAt"
FROM "Teacher";
DROP TABLE "Teacher";
ALTER TABLE "new_Teacher" RENAME TO "Teacher";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
