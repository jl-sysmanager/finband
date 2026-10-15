-- Normaliza importes a céntimos (restos de coma flotante) y recalcula estados.

UPDATE "StudentPayment" SET "amount" = ROUND("amount", 2);

UPDATE "StudentFee" SET
  "baseAmount" = ROUND("baseAmount", 2),
  "discountAmount" = ROUND("discountAmount", 2),
  "totalAmount" = ROUND("totalAmount", 2),
  "amountPaid" = CASE
    WHEN EXISTS (SELECT 1 FROM "StudentPayment" p WHERE p."feeId" = "StudentFee"."id")
      THEN ROUND((SELECT SUM("amount") FROM "StudentPayment" p WHERE p."feeId" = "StudentFee"."id"), 2)
    ELSE ROUND("amountPaid", 2)
  END;

UPDATE "StudentFee" SET "status" = CASE
  WHEN ROUND("amountPaid" * 100) <= 0 THEN 'PENDING'
  WHEN ROUND("amountPaid" * 100) >= ROUND("totalAmount" * 100) THEN 'PAID'
  ELSE 'PARTIAL'
END;

UPDATE "TeacherPayout" SET
  "baseAmount" = ROUND("baseAmount", 2),
  "transportAmount" = ROUND("transportAmount", 2),
  "amount" = ROUND("amount", 2),
  "amountPaid" = ROUND("amountPaid", 2);

UPDATE "TeacherPayout" SET "status" = CASE
  WHEN ROUND("amountPaid" * 100) <= 0 THEN 'PENDING'
  WHEN ROUND("amountPaid" * 100) >= ROUND("amount" * 100) THEN 'PAID'
  ELSE 'PARTIAL'
END;

UPDATE "IncomeEntry" SET "amount" = ROUND("amount", 2);
UPDATE "ExpenseEntry" SET "amount" = ROUND("amount", 2);
UPDATE "TariffRule" SET "amount" = ROUND("amount", 2);
