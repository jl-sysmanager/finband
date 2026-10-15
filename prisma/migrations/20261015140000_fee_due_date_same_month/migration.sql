-- Las cuotas generadas vencían por error el día 5 del mes siguiente.
-- Se mueven al día 5 de su propio mes (medianoche UTC, convención de fechas de calendario).
UPDATE "StudentFee"
SET "dueDate" = CAST(strftime('%s', "yearMonth" || '-05') AS INTEGER) * 1000
WHERE typeof("dueDate") = 'integer'
  AND strftime('%Y-%m', "dueDate" / 1000, 'unixepoch') > "yearMonth";
