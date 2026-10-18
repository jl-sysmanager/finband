export const USER_ROLES = ["ADMIN", "READONLY"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const CLASS_TYPES = [
  "INDIVIDUAL",
  "COLECTIVA",
  "BANDA",
  "LENGUAJE",
  "ENSAYO",
] as const;
export type ClassType = (typeof CLASS_TYPES)[number];

export const CLASS_TYPE_LABELS: Record<ClassType, string> = {
  INDIVIDUAL: "Individual",
  COLECTIVA: "Colectiva",
  BANDA: "Banda",
  LENGUAJE: "Lenguaje musical",
  ENSAYO: "Ensayo",
};

/** Método de cálculo de los honorarios de un profesor (uno por profesor). */
export const PAY_METHODS = ["MONTHLY_SALARY", "HOURLY", "PER_CLASS"] as const;
export type PayMethod = (typeof PAY_METHODS)[number];

export const PAY_METHOD_LABELS: Record<PayMethod, string> = {
  MONTHLY_SALARY: "Salario mensual",
  HOURLY: "Precio por hora",
  PER_CLASS: "Coste por clase",
};

/** Unidad de la tarifa según el método. */
export const PAY_RATE_UNITS: Record<PayMethod, string> = {
  MONTHLY_SALARY: "€/mes",
  HOURLY: "€/hora",
  PER_CLASS: "€/clase",
};

export const FEE_STATUSES = ["PENDING", "PARTIAL", "PAID"] as const;
export type FeeStatus = (typeof FEE_STATUSES)[number];

export const FEE_STATUS_LABELS: Record<FeeStatus, string> = {
  PENDING: "Pendiente",
  PARTIAL: "Parcial",
  PAID: "Pagado",
};

export const STUDENT_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];
