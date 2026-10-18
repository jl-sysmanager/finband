import { describe, expect, it } from "vitest";
import { positiveAmountSchema, studentDiscountSchema, teacherSchema } from "@finband/shared";
import { feeStatus, payoutStatus } from "../src/lib/fee-status.js";
import { moneyToEuros } from "../src/lib/money-api.js";
import { fromCents, percentOfCents, roundCents, sumCents, toCents } from "../src/lib/money.js";

describe("toCents / fromCents", () => {
  it("convierte euros a céntimos enteros sin arrastrar error binario", () => {
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(10.1)).toBe(1010);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(-1.005)).toBe(-101);
    expect(toCents(0)).toBe(0);
  });

  it("vuelve a euros", () => {
    expect(fromCents(3030)).toBe(30.3);
    expect(fromCents(5)).toBe(0.05);
  });
});

describe("aritmética en céntimos", () => {
  it("suma exacta", () => {
    expect(sumCents([1010, 1010, 1010])).toBe(3030);
  });

  it("redondea resultados intermedios a céntimo, la mitad lejos de cero", () => {
    expect(roundCents(1000.5)).toBe(1001);
    expect(roundCents(-1000.5)).toBe(-1001);
    expect(roundCents(1500 * 10 * (31 / 7))).toBe(66429);
  });

  it("porcentaje en centésimas", () => {
    expect(percentOfCents(4700, 1500)).toBe(705); // 15 % de 47 €
    expect(percentOfCents(1005, 5000)).toBe(503); // 50 % de 10,05 € = 5,025 → 5,03
    expect(percentOfCents(10000, 1250)).toBe(1250); // 12,5 % de 100 €
  });
});

describe("esquemas de entrada (euros → céntimos)", () => {
  it("los importes llegan en euros y salen en céntimos", () => {
    expect(positiveAmountSchema.parse(10.1)).toBe(1010);
    expect(positiveAmountSchema.safeParse(10.005).success).toBe(false);
    expect(positiveAmountSchema.safeParse(0).success).toBe(false);
  });

  it("convierte la tarifa del profesor y el transporte a céntimos", () => {
    const t = teacherSchema.parse({
      firstName: "A",
      lastName: "B",
      payMethod: "PER_CLASS",
      payRate: 22.25,
      transportCostPerDay: 6.5,
    });
    expect(t).toMatchObject({ payMethod: "PER_CLASS", payRate: 2225, transportCostPerDay: 650 });
    expect(teacherSchema.safeParse({ firstName: "A", lastName: "B", payMethod: "OTRO", payRate: 1 }).success).toBe(
      false,
    );
  });

  it("el valor del descuento se guarda en centésimas de su unidad", () => {
    expect(studentDiscountSchema.parse({ name: "x", type: "PERCENT", value: 12.5 }).value).toBe(1250);
    expect(studentDiscountSchema.parse({ name: "x", type: "FIXED", value: 15 }).value).toBe(1500);
  });
});

describe("moneyToEuros (respuestas)", () => {
  it("pasa a euros los campos de dinero de entidades anidadas, sin tocar el resto", () => {
    const paidAt = new Date("2026-10-01T00:00:00Z");
    const out = moneyToEuros({
      id: "f1",
      totalAmount: 9900,
      amountPaid: 0,
      lineItems: JSON.stringify([{ label: "Piano", amount: 7500 }]),
      student: { monthlyFee: null, firstName: "Ana" },
      payments: [{ amount: 1010, paidAt }],
      discounts: [
        { type: "PERCENT", value: 1250 },
        { type: "FIXED", value: 1500 },
      ],
      teacher: { payMethod: "HOURLY", payRate: 1850, transportCostPerDay: 650 },
      _count: { payments: 1 },
    });
    expect(out).toEqual({
      id: "f1",
      totalAmount: 99,
      amountPaid: 0,
      lineItems: JSON.stringify([{ label: "Piano", amount: 75 }]),
      student: { monthlyFee: null, firstName: "Ana" },
      payments: [{ amount: 10.1, paidAt }],
      discounts: [
        { type: "PERCENT", value: 12.5 },
        { type: "FIXED", value: 15 },
      ],
      teacher: { payMethod: "HOURLY", payRate: 18.5, transportCostPerDay: 6.5 },
      _count: { payments: 1 },
    });
    expect(out.payments[0]!.paidAt).toBeInstanceOf(Date);
  });
});

describe("feeStatus / payoutStatus (céntimos)", () => {
  it.each([
    [5000, 0, "PENDING"],
    [5000, 2000, "PARTIAL"],
    [5000, 5000, "PAID"],
    [5000, 6000, "PAID"],
  ] as const)("total %s pagado %s → %s", (total, paid, expected) => {
    expect(feeStatus(total, paid)).toBe(expected);
    expect(payoutStatus(total, paid)).toBe(expected);
  });
});
