import ExcelJS from "exceljs";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { yearMonthOf } from "../lib/dates.js";
import {
  createPdf,
  drawMetaGrid,
  drawNote,
  drawSectionTitle,
  drawTable,
  drawTotalBar,
  finalizeProfessionalPdf,
  formatEuro,
} from "../lib/pdf-template.js";
import {
  InvalidRangeError,
  reportBalance,
  reportDebt,
  reportStudents,
  reportTeachers,
} from "../lib/report-data.js";
import { receiptRoutes } from "./receipts.js";

/*
 * Cuatro informes: balance del centro, alumnos y profesores por rango de meses
 * (desde/hasta; un único mes es el informe mensual) y deuda pendiente a fecha.
 * Cada uno se sirve en JSON (vista previa), PDF y Excel.
 */

type ReportQuery = { monthFrom?: string; monthTo?: string; format?: string; inline?: string };

const EXCLUDED_NOTE =
  "Los apuntes manuales en categorías gestionadas por la app (cobros de cuotas y pagos a profesores) no suman: se toman de los cobros y pagos registrados.";

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function monthLabel(yearMonth: string) {
  const [y, m] = yearMonth.split("-").map(Number);
  return `${MONTH_NAMES[m! - 1]} ${y}`;
}

function periodLabel(monthFrom: string, monthTo: string) {
  return monthFrom === monthTo
    ? monthLabel(monthFrom)
    : `${monthLabel(monthFrom)} – ${monthLabel(monthTo)}`;
}

function periodSlug(monthFrom: string, monthTo: string) {
  return monthFrom === monthTo ? monthFrom : `${monthFrom}_${monthTo}`;
}

const pct = (n: number) => `${n.toLocaleString("es-ES")} %`;

function readRange(q: ReportQuery) {
  const current = yearMonthOf();
  const monthFrom = q.monthFrom ?? q.monthTo ?? current;
  const monthTo = q.monthTo ?? q.monthFrom ?? current;
  return { monthFrom, monthTo };
}

function sendPdf(reply: FastifyReply, filename: string, buffer: Buffer, inline: boolean) {
  return reply
    .header("Content-Type", "application/pdf")
    .header("Content-Disposition", inline ? "inline" : `attachment; filename="${filename}"`)
    .send(buffer);
}

async function sendXlsx(reply: FastifyReply, filename: string, wb: ExcelJS.Workbook) {
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return reply
    .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    .header("Content-Disposition", `attachment; filename="${filename}"`)
    .send(buffer);
}

/** Hoja con cabecera en negrita, columnas de importes con formato € y anchos razonables. */
function addSheet(
  wb: ExcelJS.Workbook,
  name: string,
  columns: Array<{ header: string; key: string; money?: boolean; width?: number }>,
  rows: Array<Record<string, unknown>>,
) {
  const ws = wb.addWorksheet(name);
  ws.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width ?? (c.money ? 14 : 22),
    style: c.money ? { numFmt: '#,##0.00 "€"' } : undefined,
  }));
  ws.getRow(1).font = { bold: true };
  for (const row of rows) ws.addRow(row);
  return ws;
}

/** Ejecuta un informe convirtiendo un rango inválido en 400. */
async function withRange<T>(
  reply: FastifyReply,
  build: () => Promise<T>,
): Promise<{ ok: true; data: T } | { ok: false; reply: FastifyReply }> {
  try {
    return { ok: true, data: await build() };
  } catch (e) {
    if (e instanceof InvalidRangeError) {
      return { ok: false, reply: reply.status(400).send({ error: e.message }) };
    }
    throw e;
  }
}

const isInline = (q: ReportQuery) => q.inline === "true" || q.inline === "1";

export async function reportRoutes(app: FastifyInstance) {
  await app.register(receiptRoutes, { prefix: "/receipts" });

  // -------------------------------------------------------------------------
  app.get("/balance", async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as ReportQuery;
    const { monthFrom, monthTo } = readRange(q);
    const result = await withRange(reply, () => reportBalance(monthFrom, monthTo));
    if (!result.ok) return result.reply;
    const data = result.data;
    const period = periodLabel(monthFrom, monthTo);
    const slug = `balance-${periodSlug(monthFrom, monthTo)}`;
    const t = data.totals;
    const ind = data.indicators;

    if (q.format === "xlsx") {
      const wb = new ExcelJS.Workbook();
      addSheet(
        wb,
        "Balance",
        [
          { header: "Mes", key: "month", width: 12 },
          { header: "Ingresos (apuntes)", key: "income", money: true, width: 18 },
          { header: "Cobros de cuotas", key: "feeCollections", money: true, width: 18 },
          { header: "Gastos (apuntes)", key: "expense", money: true, width: 18 },
          { header: "Pagos a profesores", key: "teacherPayments", money: true, width: 18 },
          { header: "Balance", key: "balance", money: true, width: 16 },
        ],
        [...data.rows, { ...t, month: "Total" }],
      );
      addSheet(
        wb,
        "Indicadores",
        [
          { header: "Indicador", key: "label", width: 36 },
          { header: "Valor", key: "value", width: 16 },
        ],
        [
          { label: "Cuotas emitidas", value: ind.feesIssued },
          { label: "Cobrado de esas cuotas", value: ind.feesCollected },
          { label: "Pendiente de cobro", value: ind.feesPending },
          { label: "Tasa de cobro (%)", value: ind.collectionRate },
          { label: "Liquidaciones de profesores", value: ind.payoutsSettled },
          { label: "Pagado a profesores", value: ind.payoutsPaid },
          { label: "Pendiente de pago", value: ind.payoutsPending },
          { label: "No incluido: apuntes de cuotas", value: t.excludedManualIncome },
          { label: "No incluido: apuntes de profesores", value: t.excludedManualExpense },
        ],
      );
      return sendXlsx(reply, `${slug}.xlsx`, wb);
    }

    if (q.format === "pdf") {
      const pdf = await finalizeProfessionalPdf(createPdf(), `Balance del centro · ${period}`, (d) => {
        if (data.rows.length === 1) {
          drawTable(
            d,
            ["Concepto", "Importe"],
            [
              ["+ Ingresos (apuntes)", formatEuro(t.income)],
              ["+ Cobros de cuotas", formatEuro(t.feeCollections)],
              ["− Gastos (apuntes)", formatEuro(t.expense)],
              ["− Pagos a profesores", formatEuro(t.teacherPayments)],
            ],
            { alignRightFrom: 1 },
          );
        } else {
          drawTable(
            d,
            ["Mes", "Ingresos", "Cobros cuotas", "Gastos", "Pagos prof.", "Balance"],
            [...data.rows, { ...t, month: "Total" }].map((r) => [
              r.month,
              formatEuro(r.income),
              formatEuro(r.feeCollections),
              formatEuro(r.expense),
              formatEuro(r.teacherPayments),
              formatEuro(r.balance),
            ]),
            { alignRightFrom: 1, widths: [1.1, 1, 1, 1, 1, 1], totalRow: true },
          );
        }
        drawTotalBar(d, "Balance del periodo", t.balance);
        drawMetaGrid(d, [
          ["Cuotas emitidas", formatEuro(ind.feesIssued)],
          ["Cobrado / tasa de cobro", `${formatEuro(ind.feesCollected)} · ${pct(ind.collectionRate)}`],
          ["Pendiente de cobro", formatEuro(ind.feesPending)],
          ["Pendiente de pago a profesores", formatEuro(ind.payoutsPending)],
        ]);
        if (t.excludedManualIncome || t.excludedManualExpense) {
          drawNote(
            d,
            `${EXCLUDED_NOTE} No incluido: ${formatEuro(t.excludedManualIncome)} de cuotas y ${formatEuro(t.excludedManualExpense)} de profesores.`,
          );
        }
      }, period);
      return sendPdf(reply, `${slug}.pdf`, pdf, isInline(q));
    }

    return data;
  });

  // -------------------------------------------------------------------------
  app.get("/students", async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as ReportQuery;
    const { monthFrom, monthTo } = readRange(q);
    const result = await withRange(reply, () => reportStudents(monthFrom, monthTo));
    if (!result.ok) return result.reply;
    const data = result.data;
    const period = periodLabel(monthFrom, monthTo);
    const slug = `alumnos-${periodSlug(monthFrom, monthTo)}`;
    const t = data.totals;

    if (q.format === "xlsx") {
      const wb = new ExcelJS.Workbook();
      addSheet(
        wb,
        "Resumen",
        [
          { header: "Alumno", key: "student", width: 30 },
          { header: "Cuotas", key: "fees", width: 8 },
          { header: "Emitido", key: "issued", money: true },
          { header: "Descuentos", key: "discount", money: true },
          { header: "Cobrado", key: "collected", money: true },
          { header: "Pendiente", key: "pending", money: true },
        ],
        [...data.rows, { ...t, student: "Total" }],
      );
      if (data.months.length > 1) {
        addSheet(
          wb,
          "Por mes",
          [
            { header: "Alumno", key: "student", width: 30 },
            ...data.months.flatMap((m) => [
              { header: `${m} emitido`, key: `${m}-i`, money: true },
              { header: `${m} cobrado`, key: `${m}-c`, money: true },
            ]),
          ],
          data.rows.map((r) => ({
            student: r.student,
            ...Object.fromEntries(
              data.months.flatMap((m) => [
                [`${m}-i`, r.byMonth[m]?.issued ?? null],
                [`${m}-c`, r.byMonth[m]?.collected ?? null],
              ]),
            ),
          })),
        );
      }
      addSheet(
        wb,
        "Cobros",
        [
          { header: "Fecha", key: "date", width: 12 },
          { header: "Alumno", key: "student", width: 30 },
          { header: "Cuota", key: "yearMonth", width: 10 },
          { header: "Importe", key: "amount", money: true },
          { header: "Método", key: "method", width: 14 },
        ],
        data.payments,
      );
      addSheet(
        wb,
        "Sin cuota",
        [
          { header: "Alumno", key: "student", width: 30 },
          { header: "Meses sin cuota", key: "months", width: 40 },
        ],
        data.withoutFee.map((s) => ({ student: s.student, months: s.months.join(", ") })),
      );
      return sendXlsx(reply, `${slug}.xlsx`, wb);
    }

    if (q.format === "pdf") {
      const pdf = await finalizeProfessionalPdf(createPdf(), `Alumnos · ${period}`, (d) => {
        drawMetaGrid(d, [
          ["Alumnos con cuota", String(t.students)],
          ["Tasa de cobro", pct(t.collectionRate)],
          ["Emitido / cobrado", `${formatEuro(t.issued)} / ${formatEuro(t.collected)}`],
          ["Pendiente", formatEuro(t.pending)],
        ]);
        drawTable(
          d,
          ["Alumno", "Cuotas", "Emitido", "Descuentos", "Cobrado", "Pendiente"],
          [...data.rows, { ...t, student: "Total" }].map((r) => [
            r.student,
            String(r.fees),
            formatEuro(r.issued),
            formatEuro(r.discount),
            formatEuro(r.collected),
            formatEuro(r.pending),
          ]),
          { alignRightFrom: 1, widths: [2.6, 0.7, 1, 1, 1, 1], totalRow: true },
        );
        if (data.withoutFee.length > 0) {
          drawSectionTitle(d, "Alumnos activos sin cuota");
          drawTable(
            d,
            ["Alumno", "Meses sin cuota"],
            data.withoutFee.map((s) => [s.student, s.months.join(", ")]),
            { widths: [1.2, 2] },
          );
        }
      }, period);
      return sendPdf(reply, `${slug}.pdf`, pdf, isInline(q));
    }

    return data;
  });

  // -------------------------------------------------------------------------
  app.get("/teachers", async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as ReportQuery;
    const { monthFrom, monthTo } = readRange(q);
    const result = await withRange(reply, () => reportTeachers(monthFrom, monthTo));
    if (!result.ok) return result.reply;
    const data = result.data;
    const period = periodLabel(monthFrom, monthTo);
    const slug = `profesores-${periodSlug(monthFrom, monthTo)}`;
    const t = data.totals;

    if (q.format === "xlsx") {
      const wb = new ExcelJS.Workbook();
      addSheet(
        wb,
        "Resumen",
        [
          { header: "Profesor", key: "teacher", width: 30 },
          { header: "Liquidaciones", key: "payouts", width: 13 },
          { header: "Jornadas", key: "workDays", width: 10 },
          { header: "Base", key: "base", money: true },
          { header: "Transporte", key: "transport", money: true },
          { header: "Liquidado", key: "settled", money: true },
          { header: "Pagado", key: "paid", money: true },
          { header: "Pendiente", key: "pending", money: true },
        ],
        [...data.rows, { ...t, teacher: "Total", payouts: null }],
      );
      if (data.months.length > 1) {
        addSheet(
          wb,
          "Por mes",
          [
            { header: "Profesor", key: "teacher", width: 30 },
            ...data.months.flatMap((m) => [
              { header: `${m} liquidado`, key: `${m}-s`, money: true },
              { header: `${m} pagado`, key: `${m}-p`, money: true },
            ]),
          ],
          data.rows.map((r) => ({
            teacher: r.teacher,
            ...Object.fromEntries(
              data.months.flatMap((m) => [
                [`${m}-s`, r.byMonth[m]?.settled ?? null],
                [`${m}-p`, r.byMonth[m]?.paid ?? null],
              ]),
            ),
          })),
        );
      }
      addSheet(
        wb,
        "Pagos",
        [
          { header: "Fecha", key: "date", width: 12 },
          { header: "Profesor", key: "teacher", width: 30 },
          { header: "Liquidación", key: "yearMonth", width: 12 },
          { header: "Importe", key: "amount", money: true },
          { header: "Notas", key: "notes", width: 30 },
        ],
        data.payments,
      );
      return sendXlsx(reply, `${slug}.xlsx`, wb);
    }

    if (q.format === "pdf") {
      const pdf = await finalizeProfessionalPdf(createPdf(), `Profesores · ${period}`, (d) => {
        drawMetaGrid(d, [
          ["Profesores liquidados", String(t.teachers)],
          ["Pagado", `${formatEuro(t.paid)} · ${pct(t.paymentRate)}`],
          ["Liquidado", formatEuro(t.settled)],
          ["Pendiente de pago", formatEuro(t.pending)],
        ]);
        drawTable(
          d,
          ["Profesor", "Jornadas", "Base", "Transporte", "Liquidado", "Pagado", "Pendiente"],
          [...data.rows, { ...t, teacher: "Total" }].map((r) => [
            r.teacher,
            String(r.workDays),
            formatEuro(r.base),
            formatEuro(r.transport),
            formatEuro(r.settled),
            formatEuro(r.paid),
            formatEuro(r.pending),
          ]),
          { alignRightFrom: 1, widths: [2.4, 0.8, 1, 1, 1, 1, 1], totalRow: true },
        );
      }, period);
      return sendPdf(reply, `${slug}.pdf`, pdf, isInline(q));
    }

    return data;
  });

  // -------------------------------------------------------------------------
  app.get("/debt", async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as ReportQuery;
    const data = await reportDebt();
    const slug = `deuda-${data.asOf}`;

    if (q.format === "xlsx") {
      const wb = new ExcelJS.Workbook();
      addSheet(
        wb,
        "Resumen",
        [
          { header: "Antigüedad", key: "bucket", width: 22 },
          { header: "Importe", key: "amount", money: true },
        ],
        [...data.summary, { bucket: "Total", amount: data.totalPending }],
      );
      addSheet(
        wb,
        "Detalle",
        [
          { header: "Alumno", key: "student", width: 30 },
          { header: "Cuota", key: "yearMonth", width: 10 },
          { header: "Vencimiento", key: "dueDate", width: 12 },
          { header: "Días vencida", key: "daysOverdue", width: 12 },
          { header: "Antigüedad", key: "bucket", width: 16 },
          { header: "Pendiente", key: "pending", money: true },
        ],
        data.details,
      );
      return sendXlsx(reply, `${slug}.xlsx`, wb);
    }

    if (q.format === "pdf") {
      const pdf = await finalizeProfessionalPdf(createPdf(), "Deuda pendiente", (d) => {
        drawMetaGrid(d, [
          ["A fecha", data.asOf],
          ["Alumnos con deuda", String(data.students)],
        ]);
        drawTable(
          d,
          ["Antigüedad", "Importe"],
          data.summary.map((r) => [r.bucket, formatEuro(r.amount)]),
          { alignRightFrom: 1 },
        );
        drawTotalBar(d, "Total pendiente", data.totalPending);
        if (data.details.length > 0) {
          drawSectionTitle(d, "Detalle por alumno");
          drawTable(
            d,
            ["Alumno", "Cuota", "Vence", "Días", "Pendiente"],
            data.details.map((r) => [
              r.student,
              r.yearMonth,
              r.dueDate,
              String(r.daysOverdue),
              formatEuro(r.pending),
            ]),
            { alignRightFrom: 3, widths: [2.6, 0.9, 1, 0.6, 1] },
          );
        }
      }, data.asOf);
      return sendPdf(reply, `${slug}.pdf`, pdf, isInline(q));
    }

    return data;
  });
}
