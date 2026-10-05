-- CreateTable
CREATE TABLE "ClassScheduleCancellation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scheduleSlotId" TEXT NOT NULL,
    "sessionDate" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClassScheduleCancellation_scheduleSlotId_fkey" FOREIGN KEY ("scheduleSlotId") REFERENCES "ClassScheduleSlot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ClassScheduleCancellation_scheduleSlotId_sessionDate_key" ON "ClassScheduleCancellation"("scheduleSlotId", "sessionDate");
