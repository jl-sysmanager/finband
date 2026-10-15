/**
 * Zona horaria de la escuela. Todas las fechas "de calendario" (meses de cuota,
 * días de cobro, rangos de informes) se interpretan en esta zona, tanto en
 * desarrollo como en Docker (cuyo reloj está en UTC).
 *
 * Se importa antes que nada en el arranque: Node aplica el cambio de TZ al vuelo.
 */
export const SCHOOL_TIME_ZONE = process.env.APP_TZ || "Europe/Madrid";
process.env.TZ = SCHOOL_TIME_ZONE;
