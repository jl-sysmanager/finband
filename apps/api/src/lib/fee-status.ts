import type { FeeStatus, PayoutStatus } from "@prisma/client";

export function feeStatus(total: number, paid: number): FeeStatus {
  if (paid <= 0) return "PENDING";
  if (paid >= total) return "PAID";
  return "PARTIAL";
}

export function payoutStatus(total: number, paid: number): PayoutStatus {
  if (paid <= 0) return "PENDING";
  if (paid >= total) return "PAID";
  return "PARTIAL";
}
