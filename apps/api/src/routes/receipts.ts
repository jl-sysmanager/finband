import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { PAYMENT_METHOD_LABELS } from "@finband/shared";
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

function sendPdf(reply: FastifyReply, filename: string, buffer: Buffer) {
  return reply
    .header("Content-Type", "application/pdf")
    .header("Content-Disposition", `attachment; filename="${filename}"`)
    .send(buffer);
}

/** Los importes de la base están en céntimos; el PDF muestra euros. */
const euro = (cents: number) => formatEuro(fromCents(cents));

const METHOD_LABELS = PAYMENT_METHOD_LABELS as Record<string, string>;

const PAYOUT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  PARTIAL: "Parcial",
  PAID: "Pagado",
};

export async function receiptRoutes(app: FastifyInstance) {
  app.get("/student-payment/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const payment = await prisma.studentPayment.findUnique({
      where: { id },
      include: {
        fee: { include: { student: true } },
      },
    });
    if (!payment) return reply.status(404).send({ error: "Cobro no encontrado" });

    const student = payment.fee.student;
    const lineItems = payment.fee.lineItems
      ? (JSON.parse(payment.fee.lineItems) as Array<{ label: string; amount: number }>)
      : [];

    const doc = createPdf();
    const buffer = await finalizeProfessionalPdf(
      doc,
      "Recibo de pago",
      async (d) => {
        drawMetaGrid(d, [
          ["Alumno", `${student.firstName} ${student.lastName}`],
          ["Periodo", payment.fee.yearMonth],
          ["Fecha de cobro", payment.paidAt.toLocaleDateString("es-ES")],
          ["Método", METHOD_LABELS[payment.method] ?? payment.method],
        ]);

        d.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a").text("Detalle de la cuota");
        d.moveDown(0.3);

        const rows: string[][] = [];
        for (const li of lineItems) {
          rows.push([li.label, euro(li.amount)]);
        }
        rows.push(
          ["Cuota base", euro(payment.fee.baseAmount)],
          ["Descuentos", `- ${euro(payment.fee.discountAmount)}`],
          ["Total cuota", euro(payment.fee.totalAmount)],
          ["Pagado acumulado", euro(payment.fee.amountPaid)],
          [
            "Pendiente",
            euro(Math.max(0, payment.fee.totalAmount - payment.fee.amountPaid)),
          ],
        );

        drawTable(d, ["Concepto", "Importe"], rows, { alignRightFrom: 1 });
        drawTotalBar(d, "Importe de este recibo", fromCents(payment.amount));
        if (payment.notes) {
          d.font("Helvetica").fontSize(9).fillColor("#64748b").text(`Observaciones: ${payment.notes}`);
        }
      },
      payment.id.slice(-8).toUpperCase(),
    );

    return sendPdf(reply, `recibo-alumno-${id.slice(-6)}.pdf`, buffer);
  });

  app.get("/teacher-payout/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const payout = await prisma.teacherPayout.findUnique({
      where: { id },
      include: { teacher: true, payments: { orderBy: { paidAt: "asc" } } },
    });
    if (!payout) return reply.status(404).send({ error: "Liquidación no encontrada" });

    const teacher = payout.teacher;
    const doc = createPdf();
    const buffer = await finalizeProfessionalPdf(
      doc,
      "Liquidación mensual",
      async (d) => {
        drawMetaGrid(d, [
          ["Profesor", `${teacher.firstName} ${teacher.lastName}`],
          ["Periodo", payout.yearMonth],
          ["Especialidad", teacher.specialty ?? "—"],
          ["Estado", PAYOUT_STATUS_LABELS[payout.status] ?? payout.status],
        ]);

        d.font("Helvetica-Bold").fontSize(11).text("Desglose");
        d.moveDown(0.3);

        drawTable(
          d,
          ["Concepto", "Importe"],
          [
            ["Remuneración base", euro(payout.baseAmount)],
            [
              `Transporte (${payout.workDays} jornadas)`,
              euro(payout.transportAmount),
            ],
            ["Total liquidación", euro(payout.amount)],
            ["Pagado", euro(payout.amountPaid)],
            ["Pendiente", euro(Math.max(0, payout.amount - payout.amountPaid))],
          ],
          { alignRightFrom: 1 },
        );

        drawTotalBar(d, "Total a abonar (mes)", fromCents(payout.amount));

        if (payout.payments.length > 0) {
          d.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a").text("Pagos realizados");
          d.moveDown(0.3);
          drawTable(
            d,
            ["Fecha", "Importe"],
            payout.payments.map((p) => [p.paidAt.toLocaleDateString("es-ES"), euro(p.amount)]),
            { alignRightFrom: 1 },
          );
        }

        d
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#64748b")
          .text(
            "Documento de liquidación mensual. El transporte se calcula por jornada según el horario de clases asignado.",
          );
        if (payout.notes) {
          d.moveDown(0.5).text(`Observaciones: ${payout.notes}`);
        }
      },
      `${payout.yearMonth}-${teacher.lastName}`.toUpperCase(),
    );

    return sendPdf(reply, `liquidacion-${payout.yearMonth}-${teacher.lastName}.pdf`, buffer);
  });
}
