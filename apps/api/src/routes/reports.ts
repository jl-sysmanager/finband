import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../lib/prisma.js";

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

function sendPdf(reply: FastifyReply, filename: string, buffer: Buffer) {
  return reply
    .header("Content-Type", "application/pdf")
    .header("Content-Disposition", `attachment; filename="${filename}"`)
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

function pdfBalance(title: string, rows: Array<[string, number]>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(18).text(title);
    doc.moveDown();
    doc.fontSize(11);
    for (const [label, amount] of rows) {
      doc.text(`${label}: ${amount.toFixed(2)} €`);
    }
    doc.end();
  });
}

export async function reportRoutes(app: FastifyInstance) {
  app.get("/balance-monthly", async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as { yearMonth?: string; format?: string };
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
      const pdf = await pdfBalance(`Balance mensual ${yearMonth}`, [
        ["Ingresos", data.income],
        ["Gastos", data.expense],
        ["Cobros cuotas", data.feeCollections],
        ["Balance", data.balance],
      ]);
      return sendPdf(reply, `balance-${yearMonth}.pdf`, pdf);
    }

    return { yearMonth, ...data };
  });

  app.get("/balance-annual", async (request: FastifyRequest, reply: FastifyReply) => {
    const q = request.query as { year?: string; format?: string };
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
    const q = request.query as { format?: string };
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
      const pdf = await pdfBalance(
        "Listado de impagos",
        rows.map((r) => [`${r.student} (${r.month})`, r.pending]),
      );
      return sendPdf(reply, "impagos.pdf", pdf);
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
    const q = request.query as { format?: string };
    const now = new Date();
    const rows = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      rows.push({ month: ym, ...(await monthlyBalance(ym)) });
    }
    if (q.format === "pdf") {
      const pdf = await pdfBalance(
        "Evolución ingresos y gastos (12 meses)",
        rows.map((r) => [r.month, r.income - r.expense]),
      );
      return sendPdf(reply, "evolucion.pdf", pdf);
    }
    return rows;
  });
}
