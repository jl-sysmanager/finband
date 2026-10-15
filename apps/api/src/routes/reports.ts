import ExcelJS from "exceljs";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  createPdf,
  drawMetaGrid,
  drawTable,
  drawTotalBar,
  finalizeProfessionalPdf,
  formatEuro,
} from "../lib/pdf-template.js";
import { fromCents } from "../lib/money.js";
import { prisma } from "../lib/prisma.js";
import {
  reportDebtAging,
  reportExecutiveMonthly,
  reportFeesIssuedCollected,
  reportPayoutsExpectedPaid,
  reportStudentsWithoutFee,
} from "../lib/phase-a-reports.js";
import { receiptRoutes } from "./receipts.js";
import { yearMonthOf } from "../lib/dates.js";
import {
  balanceByMonth,
  balanceForMonth,
  balanceInEuros,
  balanceReportRows,
  sumBalances,
} from "../lib/balance.js";

const defaultYearMonth = () => yearMonthOf();

const monthsOfYear = (year: number) =>
  Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);

/** Los 12 meses que terminan en el actual (informe de evolución). */
function lastTwelveMonths() {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => yearMonthOf(new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)));
}

const EXCLUDED_NOTE =
  "Los apuntes manuales en categorías gestionadas por la app (cobros de cuotas y pagos a profesores) no suman: se toman de los cobros y pagos registrados.";

/** Pagado y pendiente acumulados por persona, agregados en la base. */
function summarizeByPerson(
  groups: Array<{ id: string; paid: number; total: number }>,
  names: Map<string, string>,
) {
  return groups
    .map((g) => ({
      name: names.get(g.id) ?? "—",
      paid: fromCents(g.paid),
      pending: fromCents(g.total - g.paid),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function sendPdf(reply: FastifyReply, filename: string, buffer: Buffer, inline = false) {
  const disposition = inline
    ? "inline"
    : `attachment; filename="${filename}"`;
  return reply
    .header("Content-Type", "application/pdf")
    .header("Content-Disposition", disposition)
    .send(buffer);
}

function sendXlsx(reply: FastifyReply, filename: string, buffer: Buffer) {
  return reply
    .header(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    .header("Content-Disposition", `attachment; filename="${filename}"`)
    .send(buffer);
}

async function pdfReport(
  title: string,
  rows: Array<[string, number]>,
  reference?: string,
  note?: string,
) {
  const doc = createPdf();
  return finalizeProfessionalPdf(doc, title, async (d) => {
    // La fila de balance va destacada en la barra final, no repetida en la tabla.
    const balanceRow = rows.find(([label]) => label.toLowerCase().includes("balance"));
    drawTable(
      d,
      ["Concepto", "Importe"],
      rows.filter((r) => r !== balanceRow).map(([label, amount]) => [label, formatEuro(amount)]),
      { alignRightFrom: 1 },
    );
    if (balanceRow) {
      drawTotalBar(d, balanceRow[0], balanceRow[1]);
    }
    if (note) {
      d.font("Helvetica").fontSize(9).fillColor("#64748b").text(note);
    }
  }, reference);
}

export async function reportRoutes(app: FastifyInstance) {
  await app.register(receiptRoutes, { prefix: "/receipts" });
  app.get("/balance-monthly", async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as { yearMonth?: string; format?: string; inline?: string };
    const yearMonth = q.yearMonth ?? defaultYearMonth();
    const cents = await balanceForMonth(yearMonth);
    const data = balanceInEuros(cents);
    const rows = balanceReportRows(cents);

    if (q.format === "xlsx") {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Balance");
      ws.addRow(["Mes", yearMonth]);
      for (const row of rows) ws.addRow(row);
      if (data.excludedManualIncome || data.excludedManualExpense) {
        ws.addRow([]);
        ws.addRow(["No incluido (apuntes duplicados de cuotas)", data.excludedManualIncome]);
        ws.addRow(["No incluido (apuntes duplicados de profesores)", data.excludedManualExpense]);
      }
      const buf = Buffer.from(await wb.xlsx.writeBuffer());
      return sendXlsx(reply, `balance-${yearMonth}.xlsx`, buf);
    }

    if (q.format === "pdf") {
      const pdf = await pdfReport(`Balance mensual ${yearMonth}`, rows, yearMonth, EXCLUDED_NOTE);
      const inline = q.inline === "1" || q.inline === "true";
      return sendPdf(reply, `balance-${yearMonth}.pdf`, pdf, inline);
    }

    return { yearMonth, ...data };
  });

  app.get("/balance-annual", async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as { year?: string; format?: string; inline?: string };
    const year = Number(q.year) || new Date().getFullYear();
    const byMonth = await balanceByMonth(monthsOfYear(year));
    const rows = [...byMonth].map(([month, b]) => ({ month, ...balanceInEuros(b) }));
    const totals = balanceInEuros(sumBalances([...byMonth.values()]));

    if (q.format === "xlsx") {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(`Balance ${year}`);
      const columns = (r: typeof totals) => [
        r.income,
        r.feeCollections,
        r.expense,
        r.teacherPayments,
        r.balance,
      ];
      ws.addRow(["Mes", "Ingresos (apuntes)", "Cobros de cuotas", "Gastos (apuntes)", "Pagos a profesores", "Balance"]);
      for (const r of rows) ws.addRow([r.month, ...columns(r)]);
      ws.addRow(["Total", ...columns(totals)]);
      const buf = Buffer.from(await wb.xlsx.writeBuffer());
      return sendXlsx(reply, `balance-${year}.xlsx`, buf);
    }

    return { year, rows, totals };
  });

  app.get("/income-by-student", async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as { format?: string };
    const groups = await prisma.studentFee.groupBy({
      by: ["studentId"],
      _sum: { amountPaid: true, totalAmount: true },
    });
    const students = await prisma.student.findMany({
      where: { id: { in: groups.map((g) => g.studentId) } },
      select: { id: true, firstName: true, lastName: true },
    });
    const rows = summarizeByPerson(
      groups.map((g) => ({
        id: g.studentId,
        paid: g._sum.amountPaid ?? 0,
        total: g._sum.totalAmount ?? 0,
      })),
      new Map(students.map((st) => [st.id, `${st.firstName} ${st.lastName}`])),
    );

    if (q.format === "xlsx") {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Ingresos por alumno");
      ws.addRow(["Alumno", "Pagado", "Pendiente"]);
      for (const r of rows) ws.addRow([r.name, r.paid, r.pending]);
      const buf = Buffer.from(await wb.xlsx.writeBuffer());
      return sendXlsx(reply, "ingresos-alumnos.xlsx", buf);
    }
    return rows;
  });

  app.get("/cost-by-teacher", async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as { format?: string };
    const groups = await prisma.teacherPayout.groupBy({
      by: ["teacherId"],
      _sum: { amountPaid: true, amount: true },
    });
    const teachers = await prisma.teacher.findMany({
      where: { id: { in: groups.map((g) => g.teacherId) } },
      select: { id: true, firstName: true, lastName: true },
    });
    const rows = summarizeByPerson(
      groups.map((g) => ({
        id: g.teacherId,
        paid: g._sum.amountPaid ?? 0,
        total: g._sum.amount ?? 0,
      })),
      new Map(teachers.map((t) => [t.id, `${t.firstName} ${t.lastName}`])),
    );

    if (q.format === "xlsx") {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Coste profesores");
      ws.addRow(["Profesor", "Pagado", "Pendiente"]);
      for (const r of rows) ws.addRow([r.name, r.paid, r.pending]);
      const buf = Buffer.from(await wb.xlsx.writeBuffer());
      return sendXlsx(reply, "coste-profesores.xlsx", buf);
    }
    return rows;
  });

  app.get("/unpaid", async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as { format?: string; inline?: string };
    const fees = await prisma.studentFee.findMany({
      where: { status: { in: ["PENDING", "PARTIAL"] } },
      include: { student: true },
      orderBy: { yearMonth: "desc" },
    });
    const rows = fees.map((f) => ({
      student: `${f.student.firstName} ${f.student.lastName}`,
      month: f.yearMonth,
      pending: fromCents(f.totalAmount - f.amountPaid),
      status: f.status,
    }));

    if (q.format === "pdf") {
      const doc = createPdf();
      const pdf = await finalizeProfessionalPdf(doc, "Listado de impagos", async (d) => {
        drawMetaGrid(d, [
          ["Registros", String(rows.length)],
          ["Generado", new Date().toLocaleDateString("es-ES")],
        ]);
        drawTable(
          d,
          ["Alumno", "Mes", "Pendiente", "Estado"],
          rows.map((r) => [r.student, r.month, formatEuro(r.pending), r.status]),
          { alignRightFrom: 2 },
        );
      });
      const inline = q.inline === "1" || q.inline === "true";
      return sendPdf(reply, "impagos.pdf", pdf, inline);
    }
    if (q.format === "xlsx") {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Impagos");
      ws.addRow(["Alumno", "Mes", "Pendiente", "Estado"]);
      for (const r of rows) ws.addRow([r.student, r.month, r.pending, r.status]);
      const buf = Buffer.from(await wb.xlsx.writeBuffer());
      return sendXlsx(reply, "impagos.xlsx", buf);
    }
    return rows;
  });

  app.get("/evolution", async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as { format?: string; inline?: string };
    const byMonth = await balanceByMonth(lastTwelveMonths());
    const rows = [...byMonth].map(([month, b]) => ({ month, ...balanceInEuros(b) }));
    if (q.format === "pdf") {
      const pdf = await pdfReport(
        "Evolución ingresos y gastos (12 meses)",
        rows.map((r) => [r.month, r.balance]),
      );
      const inline = q.inline === "1" || q.inline === "true";
      return sendPdf(reply, "evolucion.pdf", pdf, inline);
    }
    return rows;
  });

  app.get("/debt-aging", async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as { format?: string; inline?: string };
    const data = await reportDebtAging();

    if (q.format === "xlsx") {
      const wb = new ExcelJS.Workbook();
      const wsSum = wb.addWorksheet("Resumen");
      wsSum.addRow(["Fecha referencia", data.asOf]);
      wsSum.addRow(["Total pendiente", data.totalPending]);
      wsSum.addRow([]);
      wsSum.addRow(["Tramo", "Importe"]);
      for (const r of data.summary) wsSum.addRow([r.bucket, r.amount]);
      const wsDet = wb.addWorksheet("Detalle");
      wsDet.addRow(["Alumno", "Mes cuota", "Vencimiento", "Tramo", "Pendiente"]);
      for (const r of data.details) {
        wsDet.addRow([r.student, r.yearMonth, r.dueDate, r.bucket, r.pending]);
      }
      const buf = Buffer.from(await wb.xlsx.writeBuffer());
      return sendXlsx(reply, `antiguedad-deuda-${data.asOf}.xlsx`, buf);
    }

    if (q.format === "pdf") {
      const pdf = await pdfReport(
        "Antigüedad de deuda",
        [
          ...data.summary.map((r) => [r.bucket, r.amount] as [string, number]),
          ["Total pendiente", data.totalPending],
        ],
        data.asOf,
      );
      const inline = q.inline === "1" || q.inline === "true";
      return sendPdf(reply, `antiguedad-deuda-${data.asOf}.pdf`, pdf, inline);
    }

    return data;
  });

  app.get("/fees-issued-collected", async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as { yearMonth?: string; format?: string; inline?: string };
    const yearMonth = q.yearMonth ?? defaultYearMonth();
    const data = await reportFeesIssuedCollected(yearMonth);

    if (q.format === "xlsx") {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Cuotas");
      ws.addRow(["Mes", yearMonth]);
      ws.addRow(["Emitido", data.totals.issued]);
      ws.addRow(["Cobrado", data.totals.collected]);
      ws.addRow(["Pendiente", data.totals.pending]);
      ws.addRow(["Tasa cobro %", data.totals.collectionRate]);
      ws.addRow([]);
      ws.addRow(["Alumno", "Emitido", "Cobrado", "Pendiente", "Estado"]);
      for (const r of data.rows) {
        ws.addRow([r.student, r.issued, r.collected, r.pending, r.status]);
      }
      const buf = Buffer.from(await wb.xlsx.writeBuffer());
      return sendXlsx(reply, `cuotas-emitidas-cobradas-${yearMonth}.xlsx`, buf);
    }

    if (q.format === "pdf") {
      const pdf = await pdfReport(
        `Cuotas emitidas vs cobradas — ${yearMonth}`,
        [
          ["Emitido", data.totals.issued],
          ["Cobrado", data.totals.collected],
          ["Pendiente", data.totals.pending],
        ],
        yearMonth,
      );
      const inline = q.inline === "1" || q.inline === "true";
      return sendPdf(reply, `cuotas-${yearMonth}.pdf`, pdf, inline);
    }

    return data;
  });

  app.get("/payouts-expected-paid", async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as { yearMonth?: string; format?: string; inline?: string };
    const yearMonth = q.yearMonth ?? defaultYearMonth();
    const data = await reportPayoutsExpectedPaid(yearMonth);

    if (q.format === "xlsx") {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Liquidaciones");
      ws.addRow(["Mes", yearMonth]);
      ws.addRow(["Previsto", data.totals.expected]);
      ws.addRow(["Pagado", data.totals.paid]);
      ws.addRow(["Pendiente", data.totals.pending]);
      ws.addRow(["Tasa pago %", data.totals.paymentRate]);
      ws.addRow([]);
      ws.addRow(["Profesor", "Previsto", "Pagado", "Pendiente", "Estado"]);
      for (const r of data.rows) {
        ws.addRow([r.teacher, r.expected, r.paid, r.pending, r.status]);
      }
      const buf = Buffer.from(await wb.xlsx.writeBuffer());
      return sendXlsx(reply, `liquidaciones-${yearMonth}.xlsx`, buf);
    }

    if (q.format === "pdf") {
      const pdf = await pdfReport(
        `Liquidaciones previsto vs pagado — ${yearMonth}`,
        [
          ["Previsto", data.totals.expected],
          ["Pagado", data.totals.paid],
          ["Pendiente", data.totals.pending],
        ],
        yearMonth,
      );
      const inline = q.inline === "1" || q.inline === "true";
      return sendPdf(reply, `liquidaciones-${yearMonth}.pdf`, pdf, inline);
    }

    return data;
  });

  app.get("/executive-monthly", async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as { yearMonth?: string; format?: string; inline?: string };
    const yearMonth = q.yearMonth ?? defaultYearMonth();
    const data = await reportExecutiveMonthly(yearMonth);

    if (q.format === "xlsx") {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Cuadro de mando");
      ws.addRow(["Mes", yearMonth]);
      ws.addRow(["Mes comparación", data.previousMonth]);
      ws.addRow(["Indicador", "Valor", "Var. % vs mes anterior"]);
      for (const k of data.kpis) {
        ws.addRow([
          k.label,
          k.value,
          "deltaPct" in k && k.deltaPct !== undefined ? k.deltaPct : "",
        ]);
      }
      const buf = Buffer.from(await wb.xlsx.writeBuffer());
      return sendXlsx(reply, `cuadro-mando-${yearMonth}.xlsx`, buf);
    }

    if (q.format === "pdf") {
      const pdf = await pdfReport(
        `Cuadro de mando mensual — ${yearMonth}`,
        data.kpis
          .filter((k) => k.unit === "money")
          .map((k) => [k.label, k.value] as [string, number]),
        yearMonth,
      );
      const inline = q.inline === "1" || q.inline === "true";
      return sendPdf(reply, `cuadro-mando-${yearMonth}.pdf`, pdf, inline);
    }

    return data;
  });

  app.get("/students-without-fee", async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as { yearMonth?: string; format?: string; inline?: string };
    const yearMonth = q.yearMonth ?? defaultYearMonth();
    const data = await reportStudentsWithoutFee(yearMonth);

    if (q.format === "xlsx") {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Sin cuota");
      ws.addRow(["Mes", yearMonth]);
      ws.addRow(["Alumnos activos", data.activeStudents]);
      ws.addRow(["Sin cuota generada", data.count]);
      ws.addRow([]);
      ws.addRow(["Alumno", "Instrumento", "Nivel", "Profesor"]);
      for (const r of data.rows) {
        ws.addRow([r.student, r.instrument, r.level, r.teacher]);
      }
      const buf = Buffer.from(await wb.xlsx.writeBuffer());
      return sendXlsx(reply, `alumnos-sin-cuota-${yearMonth}.xlsx`, buf);
    }

    if (q.format === "pdf") {
      const doc = createPdf();
      const pdf = await finalizeProfessionalPdf(
        doc,
        `Alumnos sin cuota — ${yearMonth}`,
        async (d) => {
          drawMetaGrid(d, [
            ["Alumnos activos", String(data.activeStudents)],
            ["Sin cuota", String(data.count)],
          ]);
          drawTable(
            d,
            ["Alumno", "Instrumento", "Profesor"],
            data.rows.map((r) => [r.student, r.instrument, r.teacher]),
          );
        },
        yearMonth,
      );
      const inline = q.inline === "1" || q.inline === "true";
      return sendPdf(reply, `alumnos-sin-cuota-${yearMonth}.pdf`, pdf, inline);
    }

    return data;
  });
}
