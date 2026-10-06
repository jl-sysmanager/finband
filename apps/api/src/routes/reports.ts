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
import { prisma } from "../lib/prisma.js";
import {
  reportDebtAging,
  reportExecutiveMonthly,
  reportFeesIssuedCollected,
  reportPayoutsExpectedPaid,
  reportStudentsWithoutFee,
} from "../lib/phase-a-reports.js";
import { receiptRoutes } from "./receipts.js";

function defaultYearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthRange(yearMonth: string) {
  const [y, m] = yearMonth.split("-").map(Number);
  const start = new Date(y!, m! - 1, 1);
  const end = new Date(y!, m!, 0, 23, 59, 59);
  return { start, end };
}

async function monthlyBalance(yearMonth: string) {
  const { start, end } = monthRange(yearMonth);
  const [income, expense, fees] = await Promise.all([
    prisma.incomeEntry.aggregate({
      where: { date: { gte: start, lte: end } },
      _sum: { amount: true },
    }),
    prisma.expenseEntry.aggregate({
      where: { date: { gte: start, lte: end } },
      _sum: { amount: true },
    }),
    prisma.studentPayment.aggregate({
      where: { paidAt: { gte: start, lte: end } },
      _sum: { amount: true },
    }),
  ]);
  return {
    income: income._sum.amount ?? 0,
    expense: expense._sum.amount ?? 0,
    feeCollections: fees._sum.amount ?? 0,
    balance: (income._sum.amount ?? 0) - (expense._sum.amount ?? 0),
  };
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

async function pdfReport(title: string, rows: Array<[string, number]>, reference?: string) {
  const doc = createPdf();
  return finalizeProfessionalPdf(doc, title, async (d) => {
    drawTable(
      d,
      ["Concepto", "Importe"],
      rows.map(([label, amount]) => [label, formatEuro(amount)]),
      { alignRightFrom: 1 },
    );
    const balanceRow = rows.find(([label]) => label.toLowerCase().includes("balance"));
    if (balanceRow) {
      drawTotalBar(d, balanceRow[0], balanceRow[1]);
    }
  }, reference);
}

export async function reportRoutes(app: FastifyInstance) {
  await app.register(receiptRoutes, { prefix: "/receipts" });
  app.get("/balance-monthly", async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as { yearMonth?: string; format?: string; inline?: string };
    const yearMonth =
      q.yearMonth ??
      `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    const data = await monthlyBalance(yearMonth);

    if (q.format === "xlsx") {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Balance");
      ws.addRow(["Mes", yearMonth]);
      ws.addRow(["Ingresos", data.income]);
      ws.addRow(["Gastos", data.expense]);
      ws.addRow(["Cobros cuotas", data.feeCollections]);
      ws.addRow(["Balance", data.balance]);
      const buf = Buffer.from(await wb.xlsx.writeBuffer());
      return sendXlsx(reply, `balance-${yearMonth}.xlsx`, buf);
    }

    if (q.format === "pdf") {
      const pdf = await pdfReport(
        `Balance mensual ${yearMonth}`,
        [
          ["Ingresos", data.income],
          ["Gastos", data.expense],
          ["Cobros cuotas", data.feeCollections],
          ["Balance", data.balance],
        ],
        yearMonth,
      );
      const inline = q.inline === "1" || q.inline === "true";
      return sendPdf(reply, `balance-${yearMonth}.pdf`, pdf, inline);
    }

    return { yearMonth, ...data };
  });

  app.get("/balance-annual", async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as { year?: string; format?: string; inline?: string };
    const year = Number(q.year) || new Date().getFullYear();
    const rows = [];
    for (let m = 1; m <= 12; m++) {
      const ym = `${year}-${String(m).padStart(2, "0")}`;
      rows.push({ month: ym, ...(await monthlyBalance(ym)) });
    }
    const totals = rows.reduce(
      (a, r) => ({
        income: a.income + r.income,
        expense: a.expense + r.expense,
        balance: a.balance + r.balance,
      }),
      { income: 0, expense: 0, balance: 0 },
    );

    if (q.format === "xlsx") {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(`Balance ${year}`);
      ws.addRow(["Mes", "Ingresos", "Gastos", "Balance"]);
      for (const r of rows) {
        ws.addRow([r.month, r.income, r.expense, r.balance]);
      }
      ws.addRow(["Total", totals.income, totals.expense, totals.balance]);
      const buf = Buffer.from(await wb.xlsx.writeBuffer());
      return sendXlsx(reply, `balance-${year}.xlsx`, buf);
    }

    return { year, rows, totals };
  });

  app.get("/income-by-student", async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as { format?: string };
    const fees = await prisma.studentFee.findMany({
      include: { student: true },
    });
    const map = new Map<string, { name: string; paid: number; pending: number }>();
    for (const f of fees) {
      const key = f.studentId;
      const cur = map.get(key) ?? {
        name: `${f.student.firstName} ${f.student.lastName}`,
        paid: 0,
        pending: 0,
      };
      cur.paid += f.amountPaid;
      cur.pending += f.totalAmount - f.amountPaid;
      map.set(key, cur);
    }
    const rows = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));

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
    const payouts = await prisma.teacherPayout.findMany({ include: { teacher: true } });
    const map = new Map<string, { name: string; paid: number; pending: number }>();
    for (const p of payouts) {
      const key = p.teacherId;
      const cur = map.get(key) ?? {
        name: `${p.teacher.firstName} ${p.teacher.lastName}`,
        paid: 0,
        pending: 0,
      };
      cur.paid += p.amountPaid;
      cur.pending += p.amount - p.amountPaid;
      map.set(key, cur);
    }
    const rows = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));

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
      pending: f.totalAmount - f.amountPaid,
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
    const now = new Date();
    const rows = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      rows.push({ month: ym, ...(await monthlyBalance(ym)) });
    }
    if (q.format === "pdf") {
      const pdf = await pdfReport(
        "Evolución ingresos y gastos (12 meses)",
        rows.map((r) => [r.month, r.income - r.expense]),
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
