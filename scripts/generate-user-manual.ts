/**
 * Manual de uso Finband (orientado al usuario de la escuela, no técnico).
 * Uso: npm run manual:pdf
 */
import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "../docs/Finband-manual-de-uso.pdf");

const MUTED = "#64748b";
const ACCENT = "#2563eb";

type Doc = InstanceType<typeof PDFDocument>;

function heading(doc: Doc, text: string, level: 1 | 2 = 1) {
  if (doc.y > doc.page.height - 90) doc.addPage();
  doc.moveDown(level === 1 ? 0.7 : 0.35);
  doc
    .font("Helvetica-Bold")
    .fontSize(level === 1 ? 15 : 12)
    .fillColor(level === 1 ? ACCENT : "#0f172a")
    .text(text);
  doc.moveDown(0.25);
}

function paragraph(doc: Doc, text: string) {
  doc.font("Helvetica").fontSize(10.5).fillColor("#334155").text(text, { lineGap: 4 });
  doc.moveDown(0.35);
}

function bullets(doc: Doc, items: string[]) {
  doc.font("Helvetica").fontSize(10.5).fillColor("#334155");
  for (const item of items) {
    if (doc.y > doc.page.height - 55) doc.addPage();
    doc.text(`•  ${item}`, { indent: 10, lineGap: 3 });
  }
  doc.moveDown(0.35);
}

function menuBlock(doc: Doc, title: string, purpose: string, actions: string[]) {
  heading(doc, title, 2);
  paragraph(doc, purpose);
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f172a").text("Qué hace el usuario aquí:");
  doc.moveDown(0.15);
  bullets(doc, actions);
}

function drawCover(doc: Doc) {
  const top = 120;
  doc.font("Helvetica-Bold").fontSize(26).fillColor("#0f172a").text("Finband", 48, top);
  doc
    .font("Helvetica")
    .fontSize(14)
    .fillColor(MUTED)
    .text("Guía de uso para la gestión de la escuela", 48, top + 36);
  doc
    .moveTo(48, top + 70)
    .lineTo(doc.page.width - 48, top + 70)
    .strokeColor(ACCENT)
    .lineWidth(2)
    .stroke();
  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor("#334155")
    .text(
      "Este documento explica cada apartado del menú y el orden recomendado para llevar el control económico: cuotas de alumnos, pagos a profesores, ingresos y gastos del centro.",
      48,
      top + 90,
      { width: doc.page.width - 96, lineGap: 5 },
    );
  doc.moveDown(2);
  paragraph(
    doc,
    "Hay dos tipos de acceso: Administrador (puede registrar cobros, pagos y cambios) y Consulta (solo consulta listados e informes). Si no ve botones de guardar, su perfil es de consulta.",
  );
  doc.addPage();
}

function footer(doc: Doc) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    if (i === range.start) continue;
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(MUTED)
      .text(`Finband · Guía de uso · ${new Date().toLocaleDateString("es-ES")}`, 48, doc.page.height - 28, {
        align: "center",
        width: doc.page.width - 96,
      });
  }
}

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });

  const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));

  drawCover(doc);

  heading(doc, "Cómo llevar el control financiero mes a mes");
  paragraph(
    doc,
    "La escuela trabaja por meses naturales (enero, febrero…). Cada mes conviene cerrar tres bloques: lo que deben los alumnos, lo que se paga a los profesores, y el dinero que entra y sale de la caja del centro (no solo cuotas).",
  );
  bullets(doc, [
    "Inicio de mes: comprobar que las cuotas del mes están generadas y revisar el Dashboard.",
    "Durante el mes: registrar cada cobro a alumno en cuanto se recibe el dinero.",
    "Durante el mes: anotar ingresos y gastos reales (alquiler, material, conciertos, etc.).",
    "Fin de mes o inicio del siguiente: generar y revisar liquidaciones de profesores; marcar como pagadas cuando se haga la transferencia o efectivo.",
    "Cierre: revisar Informes (impagos, balance) y actuar sobre familias con deuda pendiente.",
  ]);

  heading(doc, "Recorrido del menú lateral");

  menuBlock(
    doc,
    "Dashboard",
    "Pantalla de inicio con la foto global del mes: resumen de ingresos y gastos, evolución reciente y avisos de cuotas pendientes o próximas a vencer.",
    [
      "Entrar al empezar la jornada para ver si hay impagos destacados.",
      "Comprobar que las cifras encajan con lo que se ha cobrado y pagado en la semana.",
    ],
  );

  menuBlock(
    doc,
    "Alumnos",
    "Ficha de cada alumno: datos personales, instrumento, profesor, clases en las que está matriculado e historial de cuotas.",
    [
      "Dar de alta nuevos alumnos al matricularlos.",
      "Mantener teléfono, tutor legal y nivel actualizados.",
      "En la pestaña económica, revisar cuotas generadas y si están pagadas, parciales o pendientes.",
      "En listado: buscar por nombre; el lápiz abre la ficha; la papelera da de baja (solo administrador).",
    ],
  );

  menuBlock(
    doc,
    "Profesores",
    "Datos del profesor y condiciones económicas (salario, coste por clase, transporte por jornada si aplica).",
    [
      "Registrar profesores antes de asignarles clases.",
      "Actualizar importes cuando cambie el acuerdo económico.",
      "Consultar liquidaciones pasadas en la ficha del profesor.",
    ],
  );

  menuBlock(
    doc,
    "Clases",
    "Grupos o clases individuales: profesor, horario semanal, aula, plazas e alumnos inscritos.",
    [
      "Crear la clase y definir el horario (día y hora de cada franja).",
      "Inscribir alumnos desde la ficha de la clase.",
      "Usar el calendario semanal para ver el occupancy del centro.",
      "Las clases activas son la base para calcular cuotas y liquidaciones de profesores.",
    ],
  );

  doc.addPage();

  menuBlock(
    doc,
    "Tarifas",
    "Reglas de precio (por instrumento, nivel, tipo de clase) y generación de las cuotas mensuales de todos los alumnos.",
    [
      "Definir o ajustar reglas al inicio de curso o cuando cambien precios.",
      "Usar el simulador eligiendo un alumno para ver qué cuota le corresponde antes de generar.",
      "Cada mes: elegir el mes en el desplegable y pulsar «Generar cuotas del mes» (solo una vez por mes salvo correcciones puntuales).",
      "Tras generar, ir a Pagos o al Dashboard para ver el efecto.",
    ],
  );

  menuBlock(
    doc,
    "Ingresos",
    "Dinero que entra en la escuela además de (o incluyendo) conceptos que quiera reflejar en contabilidad: matrículas, ventas, subvenciones, etc.",
    [
      "Registrar cada entrada con fecha, concepto, categoría e importe.",
      "Filtrar por fechas y buscar por texto para cuadrar con el banco.",
      "Los cobros de cuotas de alumnos se registran principalmente en Pagos; aquí puede reflejar otros ingresos.",
    ],
  );

  menuBlock(
    doc,
    "Gastos",
    "Salidas de dinero: alquiler, luz, material, reparaciones, etc.",
    [
      "Anotar cada factura o pago con fecha e importe.",
      "Revisar el listado filtrando el mes para saber cuánto ha gastado el centro.",
    ],
  );

  menuBlock(
    doc,
    "Pagos",
    "Centro de control de cobros a familias y pagos a profesores. Es el módulo más importante para el día a día financiero.",
    [
      "Pestaña «Cobros de alumnos»: elegir mes desde y mes hasta; buscar alumno si hace falta.",
      "Seleccionar la cuota en la tabla (o en el desplegable), indicar importe y forma de pago, y «Registrar cobro».",
      "Puede imprimir recibo PDF tras cada cobro.",
      "Pestaña «Pagos a profesores»: generar liquidaciones del mes elegido; revisar base, transporte y total.",
      "Cuando se pague al profesor, «Marcar pagado» y guardar el PDF de liquidación como justificante.",
      "Filtrar por estado (pendiente / pagado) para ver qué queda por hacer.",
    ],
  );

  menuBlock(
    doc,
    "Informes",
    "Cuadros de mando para dirección y para conciliación: balance, impagos, ingresos por alumno, coste por profesor, evolución anual.",
    [
      "Elegir el informe en la lista de la izquierda.",
      "Seleccionar mes o año según pida el informe.",
      "Leer la vista previa en pantalla antes de descargar PDF o Excel.",
      "Usar «Listado de impagos» para llamadas o emails a familias.",
      "Usar «Balance mensual» para reunión de cierre de mes.",
    ],
  );

  menuBlock(
    doc,
    "Configuración",
    "Datos del centro (nombre, contacto), curso académico activo y usuarios que pueden entrar en Finband.",
    [
      "Mantener el nombre de la escuela correcto (aparece en PDFs).",
      "Crear usuarios de consulta para personal que solo deba mirar datos.",
      "Editar o eliminar usuarios cuando alguien deje de trabajar en el centro (administrador).",
    ],
  );

  doc.addPage();

  heading(doc, "Buenas prácticas de control");
  bullets(doc, [
    "No mezclar meses: al cobrar o liquidar, filtre siempre el mes con el que está trabajando.",
    "Cobro parcial: registre el importe realmente recibido; el sistema dejará la cuota en «Parcial» hasta completar.",
    "Si un alumno no debe cuota ese mes, compruebe matrícula en clases y que las cuotas del mes estén generadas en Tarifas.",
    "Antes de pagar a un profesor, abra el PDF de liquidación y compruebe horas/clases y transporte.",
    "Una vez al mes, compare Dashboard + Informe balance con el extracto bancario.",
    "Guarde los PDF de recibos a alumnos y liquidaciones a profesores como archivo legal interno.",
  ]);

  heading(doc, "Roles: quién hace qué");
  bullets(doc, [
    "Secretaría / administración: altas de alumnos, cobros en Pagos, ingresos y gastos, generar cuotas.",
    "Dirección: Dashboard, Informes, impagos, aprobación de liquidaciones de profesores.",
    "Profesores (perfil consulta): pueden consultar alumnos y clases si se les da usuario, sin modificar cobros.",
  ]);

  footer(doc);
  doc.end();

  await new Promise<void>((resolve, reject) => {
    doc.on("end", () => {
      fs.writeFileSync(OUT, Buffer.concat(chunks));
      resolve();
    });
    doc.on("error", reject);
  });

  console.log(`Manual generado: ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
