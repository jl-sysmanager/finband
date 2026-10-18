-- Fecha de inicio de la clase: las liquidaciones cuentan sus sesiones desde ese día.
-- Las clases existentes quedan sin fecha (cuentan el mes completo, como hasta ahora).
ALTER TABLE "ClassGroup" ADD COLUMN "startDate" DATETIME;
