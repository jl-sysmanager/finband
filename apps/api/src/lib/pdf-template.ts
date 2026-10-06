import PDFDocument from "pdfkit";
import { prisma } from "./prisma.js";

const ACCENT = "#2563eb";
const MUTED = "#64748b";
const BORDER = "#e2e8f0";
const PAGE_MARGIN = 48;
/** Zona reservada al pie (numeración + marca) */
const FOOTER_ZONE = 44;

export function formatEuro(n: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);
}

export async function getSchoolBranding() {
  const s = await prisma.schoolSettings.findUnique({ where: { id: "default" } });
  return {
    name: s?.name ?? "Escuela de Música",
    address: s?.address ?? "",
    phone: s?.phone ?? "",
    email: s?.email ?? "",
    logoBase64: s?.logoBase64 ?? null,
  };
}

type PdfDoc = InstanceType<typeof PDFDocument>;

export function createPdf(): PdfDoc {
  return new PDFDocument({ size: "A4", margin: PAGE_MARGIN, bufferPages: true });
}

/** Evita saltos de página si queda poco espacio útil (sin contar el pie). */
export function ensurePageSpace(doc: PdfDoc, neededHeight: number) {
  const limit = doc.page.height - PAGE_MARGIN - FOOTER_ZONE;
  if (doc.y + neededHeight > limit) doc.addPage();
}

function footerText(doc: PdfDoc, text: string, y: number) {
  const w = doc.widthOfString(text);
  const x = Math.max(PAGE_MARGIN, (doc.page.width - w) / 2);
  doc.text(text, x, y, { lineBreak: false });
}

export function pdfToBuffer(doc: PdfDoc): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

export async function drawLetterhead(doc: PdfDoc, documentTitle: string, reference?: string) {
  const school = await getSchoolBranding();
  const top = doc.y;

  if (school.logoBase64?.startsWith("data:image")) {
    try {
      const b64 = school.logoBase64.split(",")[1];
      if (b64) {
        doc.image(Buffer.from(b64, "base64"), 48, top, { width: 48 });
      }
    } catch {
      /* skip logo */
    }
  }

  doc
    .font("Helvetica-Bold")
    .fontSize(16)
    .fillColor("#0f172a")
    .text(school.name, 110, top, { width: 400 });

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(MUTED)
    .text([school.address, school.phone, school.email].filter(Boolean).join(" · "), 110, top + 22, {
      width: 400,
    });

  doc
    .moveTo(48, top + 52)
    .lineTo(doc.page.width - 48, top + 52)
    .strokeColor(ACCENT)
    .lineWidth(2)
    .stroke();

  doc.y = top + 68;
  doc.font("Helvetica-Bold").fontSize(20).fillColor("#0f172a").text(documentTitle);
  if (reference) {
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(MUTED)
      .text(`Referencia: ${reference}`);
  }
  doc.moveDown(0.5);
}

export function drawMetaGrid(doc: PdfDoc, rows: Array<[string, string]>) {
  const startY = doc.y;
  const colW = (doc.page.width - 96) / 2;
  rows.forEach(([label, value], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 48 + col * colW;
    const y = startY + row * 36;
    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(label.toUpperCase(), x, y);
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a").text(value, x, y + 12);
  });
  doc.y = startY + Math.ceil(rows.length / 2) * 36 + 12;
}

export function drawTable(
  doc: PdfDoc,
  headers: string[],
  rows: string[][],
  options?: { alignRightFrom?: number },
) {
  const tableTop = doc.y;
  const colCount = headers.length;
  const tableWidth = doc.page.width - 96;
  const colWidth = tableWidth / colCount;
  const alignRightFrom = options?.alignRightFrom ?? colCount;

  doc.font("Helvetica-Bold").fontSize(9).fillColor("#0f172a");
  headers.forEach((h, i) => {
    doc.text(h, 48 + i * colWidth, tableTop, {
      width: colWidth - 8,
      align: i >= alignRightFrom ? "right" : "left",
    });
  });

  let y = tableTop + 18;
  doc
    .moveTo(48, y - 4)
    .lineTo(doc.page.width - 48, y - 4)
    .strokeColor(BORDER)
    .lineWidth(1)
    .stroke();

  doc.font("Helvetica").fontSize(10).fillColor("#334155");
  const pageBreakY = doc.page.height - PAGE_MARGIN - FOOTER_ZONE;
  for (const row of rows) {
    if (y + 22 > pageBreakY) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
    row.forEach((cell, i) => {
      doc.text(cell, 48 + i * colWidth, y, {
        width: colWidth - 8,
        align: i >= alignRightFrom ? "right" : "left",
      });
    });
    y += 22;
  }

  doc
    .moveTo(48, y)
    .lineTo(doc.page.width - 48, y)
    .strokeColor(BORDER)
    .stroke();
  doc.y = y + 16;
}

export function drawTotalBar(doc: PdfDoc, label: string, amount: number) {
  const y = doc.y;
  doc
    .rect(48, y, doc.page.width - 96, 36)
    .fillColor("#eff6ff")
    .fill();
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor("#0f172a")
    .text(label, 60, y + 11);
  doc.text(formatEuro(amount), 48, y + 11, {
    width: doc.page.width - 96 - 24,
    align: "right",
  });
  doc.y = y + 48;
}

export function drawFooter(doc: PdfDoc) {
  const range = doc.bufferedPageRange();
  const pageCount = range.count;
  const generated = `Generado el ${new Date().toLocaleString("es-ES")} · Finband`;

  for (let i = range.start; i < range.start + pageCount; i++) {
    doc.switchToPage(i);
    doc.font("Helvetica").fontSize(8).fillColor(MUTED);
    footerText(doc, generated, doc.page.height - 36);
    footerText(doc, `Página ${i - range.start + 1} de ${pageCount}`, doc.page.height - 24);
  }
}

export async function finalizeProfessionalPdf(
  doc: PdfDoc,
  documentTitle: string,
  build: (doc: PdfDoc) => void | Promise<void>,
  reference?: string,
) {
  await drawLetterhead(doc, documentTitle, reference);
  await build(doc);
  drawFooter(doc);
  doc.end();
  return pdfToBuffer(doc);
}
