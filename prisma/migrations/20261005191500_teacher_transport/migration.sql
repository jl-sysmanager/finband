-- AlterTable
ALTER TABLE "Teacher" ADD COLUMN "transportCostPerDay" REAL NOT NULL DEFAULT 0;

-- RedefineTable
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TeacherPayout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teacherId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "baseAmount" REAL NOT NULL DEFAULT 0,
    "transportAmount" REAL NOT NULL DEFAULT 0,
    "workDays" INTEGER NOT NULL DEFAULT 0,
    "amount" REAL NOT NULL,
    "amountPaid" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TeacherPayout_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TeacherPayout" ("id", "teacherId", "yearMonth", "baseAmount", "transportAmount", "workDays", "amount", "amountPaid", "status", "notes", "paidAt", "createdAt", "updatedAt")
SELECT "id", "teacherId", "yearMonth", "amount", 0, 0, "amount", "amountPaid", "status", "notes", "paidAt", "createdAt", "updatedAt" FROM "TeacherPayout";
DROP TABLE "TeacherPayout";
ALTER TABLE "new_TeacherPayout" RENAME TO "TeacherPayout";
CREATE UNIQUE INDEX "TeacherPayout_teacherId_yearMonth_key" ON "TeacherPayout"("teacherId", "yearMonth");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
