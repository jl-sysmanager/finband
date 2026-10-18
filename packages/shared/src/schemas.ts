import { z } from "zod";
import { eurosToCents } from "./money.js";
import {
  CLASS_TYPES,
  PAY_METHODS,
  PAYMENT_METHODS,
  STUDENT_STATUSES,
  USER_ROLES,
} from "./enums.js";

/**
 * Importe en euros con, como mucho, dos decimales. El resultado del parseo son
 * céntimos enteros: la API trabaja siempre en céntimos.
 */
const euros = () =>
  z
    .number()
    .finite()
    .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, {
      message: "El importe admite como máximo dos decimales",
    });

export const positiveAmountSchema = euros()
  .refine((n) => n > 0, { message: "El importe debe ser positivo" })
  .transform(eurosToCents);

export const nonNegativeAmountSchema = euros()
  .refine((n) => n >= 0, { message: "El importe no puede ser negativo" })
  .transform(eurosToCents);

/**
 * Valor de un descuento: euros si es FIXED, porcentaje si es PERCENT. En ambos
 * casos se guarda en centésimas de su unidad (15 € → 1500, 12,5 % → 1250).
 */
const discountValueSchema = nonNegativeAmountSchema;

export const loginSchema = z.object({
  username: z.string().min(1, "Usuario requerido"),
  password: z.string().min(1, "Contraseña requerida"),
});

export const userCreateSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  role: z.enum(USER_ROLES),
});

export const userUpdateSchema = z.object({
  username: z.string().min(3).optional(),
  password: z.string().min(6).optional(),
  role: z.enum(USER_ROLES).optional(),
});

export const schoolSettingsSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  logoBase64: z.string().optional().nullable(),
  activeYearId: z.string().optional().nullable(),
});

export const academicYearSchema = z.object({
  name: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  isActive: z.boolean().optional(),
});

export const categorySchema = z.object({
  name: z.string().min(1),
  sortOrder: z.number().int().optional(),
});

export const teacherSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  specialty: z.string().optional().nullable(),
  payMethod: z.enum(PAY_METHODS),
  /** Tarifa del método elegido: €/mes, €/hora o €/clase. */
  payRate: nonNegativeAmountSchema,
  transportCostPerDay: nonNegativeAmountSchema.optional(),
});

export const studentSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  birthDate: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  address: z.string().optional().nullable(),
  legalGuardian: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  mainInstrument: z.string().optional().nullable(),
  level: z.string().optional().nullable(),
  primaryTeacherId: z.string().optional().nullable(),
  monthlyFee: nonNegativeAmountSchema.optional().nullable(),
  status: z.enum(STUDENT_STATUSES).optional(),
});

export const scheduleSlotSchema = z.object({
  dayOfWeek: z.number().int().min(1).max(7),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Formato HH:mm"),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Formato HH:mm"),
});

export const scheduleCancellationSchema = z.object({
  scheduleSlotId: z.string().min(1),
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD"),
  reason: z.string().optional().nullable(),
});

export const classGroupSchema = z.object({
  name: z.string().min(1),
  type: z.enum(CLASS_TYPES),
  teacherId: z.string().min(1),
  room: z.string().optional().nullable(),
  scheduleSlots: z.array(scheduleSlotSchema).optional(),
  durationMinutes: z.number().int().min(15),
  maxStudents: z.number().int().min(1),
  notes: z.string().optional().nullable(),
  /** Primer día de clase ("YYYY-MM-DD"); null = sin restricción. */
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (AAAA-MM-DD)")
    .optional()
    .nullable(),
});

export const tariffRuleSchema = z.object({
  name: z.string().min(1),
  instrument: z.string().optional().nullable(),
  level: z.string().optional().nullable(),
  classType: z.enum(CLASS_TYPES).optional().nullable(),
  amount: nonNegativeAmountSchema,
  priority: z.number().int().optional(),
  active: z.boolean().optional(),
});

export const studentDiscountSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["PERCENT", "FIXED"]),
  value: discountValueSchema,
  isScholarship: z.boolean().optional(),
  validFrom: z.string().optional().nullable(),
  validTo: z.string().optional().nullable(),
  active: z.boolean().optional(),
});

export const incomeEntrySchema = z.object({
  date: z.string().min(1),
  concept: z.string().min(1),
  categoryId: z.string().min(1),
  amount: positiveAmountSchema,
  method: z.enum(PAYMENT_METHODS).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const expenseEntrySchema = z.object({
  date: z.string().min(1),
  concept: z.string().min(1),
  categoryId: z.string().min(1),
  amount: positiveAmountSchema,
  notes: z.string().optional().nullable(),
});

export const studentPaymentSchema = z.object({
  feeId: z.string().min(1),
  amount: positiveAmountSchema,
  method: z.enum(PAYMENT_METHODS),
  paidAt: z.string().optional(),
  notes: z.string().optional().nullable(),
});

export const teacherPayoutPaymentSchema = z.object({
  payoutId: z.string().min(1),
  amount: positiveAmountSchema,
  paidAt: z.string().optional(),
  notes: z.string().optional().nullable(),
});

export const attendanceSessionSchema = z.object({
  sessionDate: z.string().min(1),
  notes: z.string().optional().nullable(),
});

export const attendanceRecordSchema = z.object({
  studentId: z.string().min(1),
  present: z.boolean(),
  notes: z.string().optional().nullable(),
});

export const generateMonthSchema = z.object({
  yearMonth: z.string().regex(/^\d{4}-\d{2}$/),
  /** Solo estos alumnos (selección explícita). Sin lista: todos los que se puedan. */
  studentIds: z.array(z.string().min(1)).max(2000).optional(),
  excludeStudentIds: z.array(z.string().min(1)).optional(),
});

export const generatePayoutsSchema = z.object({
  yearMonth: z.string().regex(/^\d{4}-\d{2}$/),
  /** Un único profesor (desde su ficha): responde 409 si su liquidación ya tiene pagos. */
  teacherId: z.string().min(1).optional(),
  /** Solo estos profesores (selección explícita). Sin lista: todos los activos. */
  teacherIds: z.array(z.string().min(1)).max(500).optional(),
});

export const generateMonthPreviewSchema = z.object({
  yearMonth: z.string().regex(/^\d{4}-\d{2}$/),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type TeacherInput = z.infer<typeof teacherSchema>;
export type StudentInput = z.infer<typeof studentSchema>;
export type ClassGroupInput = z.infer<typeof classGroupSchema>;
