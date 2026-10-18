import type { FastifyInstance } from "fastify";
import { fromCents } from "./money.js";

/**
 * Campos que, en las respuestas de las rutas de entidades, son importes en céntimos
 * y se envían en euros. Son los campos de dinero del esquema de Prisma más los de
 * los cálculos que esas rutas devuelven (vista previa de cuotas, recordatorios).
 */
const MONEY_KEYS = new Set([
  "amount",
  "amountPaid",
  "baseAmount",
  "discountAmount",
  "monthlyFee",
  "payRate",
  "pending",
  "totalAmount",
  "totalEligibleAmount",
  "transportAmount",
  "transportCostPerDay",
]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** `StudentFee.lineItems` es JSON guardado como texto, también en céntimos. */
function lineItemsToEuros(raw: string): string {
  try {
    const items = JSON.parse(raw) as unknown;
    if (!Array.isArray(items)) return raw;
    return JSON.stringify(items.map((item) => moneyToEuros(item)));
  } catch {
    return raw;
  }
}

/**
 * Copia profunda de una respuesta con los importes pasados de céntimos a euros.
 * Solo debe recibir datos en céntimos: aplicarla dos veces dividiría entre 10 000.
 */
export function moneyToEuros<T>(data: T): T {
  if (Array.isArray(data)) return data.map((item) => moneyToEuros(item)) as T;
  if (!isPlainObject(data)) return data;

  const isDiscount = data.type === "PERCENT" || data.type === "FIXED";
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "number" && (MONEY_KEYS.has(key) || (isDiscount && key === "value"))) {
      out[key] = fromCents(value);
    } else if (key === "lineItems" && typeof value === "string") {
      out[key] = lineItemsToEuros(value);
    } else {
      out[key] = moneyToEuros(value);
    }
  }
  return out as T;
}

/**
 * Las rutas registradas en este ámbito responden en céntimos (entidades de Prisma
 * tal cual o cálculos internos) y el contrato HTTP se mantiene en euros.
 */
export function respondInEuros(scope: FastifyInstance) {
  scope.addHook("preSerialization", async (_request, _reply, payload) => moneyToEuros(payload));
}
