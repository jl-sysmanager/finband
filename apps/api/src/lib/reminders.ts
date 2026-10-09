import { FEE_STATUS_LABELS } from "@finband/shared";
import { prisma } from "./prisma.js";
import { formatMoneyEs } from "./money-format.js";

function normalizePhoneForWhatsApp(phone: string | null | undefined) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 9) return null;
  if (digits.startsWith("34") && digits.length >= 11) return digits;
  if (digits.length === 9) return `34${digits}`;
  return digits;
}

export async function buildFeeReminder(feeId: string) {
  const fee = await prisma.studentFee.findUnique({
    where: { id: feeId },
    include: { student: true, payments: true },
  });
  if (!fee) throw new Error("Cuota no encontrada");

  const school = await prisma.schoolSettings.findFirst();
  const schoolName = school?.name ?? "Escuela de Música";
  const pending = Math.max(0, fee.totalAmount - fee.amountPaid);
  const student = fee.student;
  const statusLabel = FEE_STATUS_LABELS[fee.status as keyof typeof FEE_STATUS_LABELS] ?? fee.status;

  const subject = `Recordatorio de cuota ${fee.yearMonth} — ${schoolName}`;
  const body = [
    `Estimada familia de ${student.firstName} ${student.lastName}:`,
    "",
    `Le recordamos la cuota correspondiente a ${fee.yearMonth}.`,
    `Importe total: ${formatMoneyEs(fee.totalAmount)}`,
    `Pagado: ${formatMoneyEs(fee.amountPaid)}`,
    `Pendiente: ${formatMoneyEs(pending)}`,
    `Estado: ${statusLabel}`,
    fee.dueDate ? `Fecha límite: ${fee.dueDate.toISOString().slice(0, 10)}` : "",
    "",
    `Atentamente,`,
    schoolName,
    school?.phone ? `Tel: ${school.phone}` : "",
    school?.email ? `Email: ${school.email}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const mailto =
    student.email?.trim()
      ? `mailto:${encodeURIComponent(student.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
      : null;

  const waPhone = normalizePhoneForWhatsApp(student.phone);
  const whatsapp = waPhone
    ? `https://wa.me/${waPhone}?text=${encodeURIComponent(body)}`
    : null;

  return {
    feeId: fee.id,
    yearMonth: fee.yearMonth,
    studentId: student.id,
    studentName: `${student.lastName}, ${student.firstName}`,
    email: student.email,
    phone: student.phone,
    pending,
    subject,
    body,
    mailto,
    whatsapp,
  };
}

export type FeeReminderPayload = Awaited<ReturnType<typeof buildFeeReminder>>;
