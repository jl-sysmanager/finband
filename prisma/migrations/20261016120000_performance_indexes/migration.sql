-- CreateIndex
CREATE INDEX "ClassGroup_teacherId_idx" ON "ClassGroup"("teacherId");

-- CreateIndex
CREATE INDEX "ClassScheduleCancellation_sessionDate_idx" ON "ClassScheduleCancellation"("sessionDate");

-- CreateIndex
CREATE INDEX "Enrollment_classGroupId_idx" ON "Enrollment"("classGroupId");

-- CreateIndex
CREATE INDEX "ExpenseEntry_date_idx" ON "ExpenseEntry"("date");

-- CreateIndex
CREATE INDEX "IncomeEntry_date_idx" ON "IncomeEntry"("date");

-- CreateIndex
CREATE INDEX "Student_deletedAt_status_idx" ON "Student"("deletedAt", "status");

-- CreateIndex
CREATE INDEX "StudentDiscount_studentId_idx" ON "StudentDiscount"("studentId");

-- CreateIndex
CREATE INDEX "StudentFee_yearMonth_status_idx" ON "StudentFee"("yearMonth", "status");

-- CreateIndex
CREATE INDEX "StudentFee_status_idx" ON "StudentFee"("status");

-- CreateIndex
CREATE INDEX "StudentPayment_feeId_idx" ON "StudentPayment"("feeId");

-- CreateIndex
CREATE INDEX "StudentPayment_paidAt_idx" ON "StudentPayment"("paidAt");

-- CreateIndex
CREATE INDEX "TeacherPayout_yearMonth_status_idx" ON "TeacherPayout"("yearMonth", "status");

