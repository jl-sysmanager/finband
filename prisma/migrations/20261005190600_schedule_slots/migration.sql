-- CreateTable
CREATE TABLE "ClassScheduleSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "classGroupId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    CONSTRAINT "ClassScheduleSlot_classGroupId_fkey" FOREIGN KEY ("classGroupId") REFERENCES "ClassGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ClassScheduleSlot_classGroupId_dayOfWeek_startTime_key" ON "ClassScheduleSlot"("classGroupId", "dayOfWeek", "startTime");

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ClassGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "room" TEXT,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "maxStudents" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClassGroup_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ClassGroup" ("id", "name", "type", "teacherId", "room", "durationMinutes", "maxStudents", "notes", "createdAt", "updatedAt")
SELECT "id", "name", "type", "teacherId", "room", "durationMinutes", "maxStudents", "notes", "createdAt", "updatedAt" FROM "ClassGroup";
DROP TABLE "ClassGroup";
ALTER TABLE "new_ClassGroup" RENAME TO "ClassGroup";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
