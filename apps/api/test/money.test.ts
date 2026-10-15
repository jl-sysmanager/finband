import { describe, expect, it } from "vitest";
import { feeStatus, payoutStatus } from "../src/lib/fee-status.js";
import { roundMoney, sumMoney, toCents } from "../src/lib/money.js";

describe("roundMoney / sumMoney", () => {
  it("redondea a céntimos", () => {
    expect(roundMoney(10.005)).toBe(10.01);
    expect(roundMoney(33.3333)).toBe(33.33);
    expect(roundMoney(-1.005)).toBe(-1.01);
  });

  it("suma sin arrastrar error binario", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
    expect(sumMoney([10.1, 10.1, 10.1])).toBe(30.3);
  });

  it("convierte a céntimos enteros", () => {
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });
});

describe("feeStatus / payoutStatus", () => {
  it.each([
    [50, 0, "PENDING"],
    [50, 20, "PARTIAL"],
    [50, 50, "PAID"],
    [50, 60, "PAID"],
  ] as const)("total %s pagado %s → %s", (total, paid, expected) => {
    expect(feeStatus(total, paid)).toBe(expected);
    expect(payoutStatus(total, paid)).toBe(expected);
  });

  it("considera pagada una cuota saldada con importes que no suman exacto en coma flotante", () => {
    const paid = 10.1 + 10.1 + 10.1; // 30.299999999999997
    expect(feeStatus(30.3, paid)).toBe("PAID");
  });
});
