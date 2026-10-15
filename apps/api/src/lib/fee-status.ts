import type { FeeStatus, PayoutStatus } from "@prisma/client";

/** Estado según lo pagado, ambos en céntimos. */
function statusFor(totalCents: number, paidCents: number): FeeStatus & PayoutStatus {
  if (paidCents <= 0) return "PENDING";
  if (paidCents >= totalCents) return "PAID";
  return "PARTIAL";
}

export function feeStatus(totalCents: number, paidCents: number): FeeStatus {
  return statusFor(totalCents, paidCents);
}

export function payoutStatus(totalCents: number, paidCents: number): PayoutStatus {
  return statusFor(totalCents, paidCents);
}
