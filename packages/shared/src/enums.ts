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

export const PAYMENT_METHODS = [
  "EFECTIVO",
  "TRANSFERENCIA",
  "BIZUM",
  "TARJETA",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  BIZUM: "Bizum",
  TARJETA: "Tarjeta",
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
