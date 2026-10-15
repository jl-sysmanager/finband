import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  calendarDateInMonth,
  calendarDateOf,
  calendarRangeFilter,
  instantRangeFilter,
  monthDateRange,
  parseCalendarDate,
  yearMonthOf,
} from "../src/lib/dates.js";
import { adminClient, prisma, resetDb, type TestClient } from "./helpers.js";

describe("fechas de calendario", () => {
  it("se guardan a medianoche UTC", () => {
    expect(parseCalendarDate("2026-10-31").toISOString()).toBe("2026-10-31T00:00:00.000Z");
    expect(calendarDateInMonth("2026-10", 5).toISOString()).toBe("2026-10-05T00:00:00.000Z");
  });

  it("se leen bien tanto en medianoche UTC como en medianoche local (datos antiguos)", () => {
    expect(calendarDateOf(new Date("2026-10-05T00:00:00Z"))).toBe("2026-10-05");
    expect(calendarDateOf(new Date(2026, 9, 5))).toBe("2026-10-05"); // 2026-10-04T22:00Z
    expect(calendarDateOf(new Date(2026, 11, 5))).toBe("2026-12-05"); // invierno: 23:00Z
  });

  it("el filtro desde/hasta incluye ambos días completos", () => {
    const r = calendarRangeFilter("2026-10-01", "2026-10-31")!;
    expect(r.gte! <= parseCalendarDate("2026-10-01")).toBe(true);
    expect(r.gte! <= new Date(2026, 9, 1)).toBe(true);
    expect(r.lte! >= parseCalendarDate("2026-10-31")).toBe(true);
    expect(r.lte! < parseCalendarDate("2026-11-01")).toBe(true);
  });
});

describe("instantes en la zona de la escuela (Europe/Madrid)", () => {
  it("un cobro a las 00:30 del 1 de noviembre es de noviembre", () => {
    const paidAt = new Date("2026-10-31T23:30:00Z"); // 00:30 en Madrid (UTC+1)
    expect(yearMonthOf(paidAt)).toBe("2026-11");
    const nov = monthDateRange("2026-11");
    expect(paidAt >= nov.start && paidAt <= nov.end).toBe(true);
  });

  it("el filtro de días usa los límites locales", () => {
    const r = instantRangeFilter("2026-11-01", "2026-11-01")!;
    expect(r.gte!.toISOString()).toBe("2026-10-31T23:00:00.000Z");
    expect(r.lte!.toISOString()).toBe("2026-11-01T22:59:59.999Z");
  });
});

describe("filtros de ingresos", () => {
  let client: TestClient;
  beforeAll(async () => {
    await resetDb();
    client = await adminClient();
  });
  afterAll(() => client.close());

  it("el filtro 'hasta' incluye los movimientos de ese día", async () => {
    const cat = await prisma.incomeCategory.create({ data: { name: `Cat ${Date.now()}` } });
    for (const date of ["2026-09-30", "2026-10-01", "2026-10-31", "2026-11-01"]) {
      const res = await client.request("POST", "/finance/incomes", {
        date,
        concept: date,
        categoryId: cat.id,
        amount: 10,
      });
      expect(res.status).toBe(200);
    }
    const res = await client.request("GET", "/finance/incomes?from=2026-10-01&to=2026-10-31");
    expect(res.body.map((r: { concept: string }) => r.concept).sort()).toEqual(["2026-10-01", "2026-10-31"]);
  });
});
