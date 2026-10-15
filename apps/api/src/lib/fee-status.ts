import type { FeeStatus, PayoutStatus } from "@prisma/client";
import { toCents } from "./money.js";

function statusFor(total: number, paid: number): FeeStatus & PayoutStatus {
  const paidCents = toCents(paid);
  if (paidCents <= 0) return "PENDING";
  if (paidCents >= toCents(total)) return "PAID";
  return "PARTIAL";
}

export function feeStatus(total: number, paid: number): FeeStatus {
  return statusFor(total, paid);
}

export function payoutStatus(total: number, paid: number): PayoutStatus {
  return statusFor(total, paid);
}
