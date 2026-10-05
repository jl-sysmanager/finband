import {
  ClassType,
  FeeStatus,
  PaymentMethod,
  PayoutStatus,
  PrismaClient,
  UserRole,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function yearMonth(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthStart(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

async function seedBase() {
  const adminUser = process.env.ADMIN_USERNAME ?? "admin";
  const adminPass = process.env.ADMIN_PASSWORD ?? "admin123";
  const hash = await bcrypt.hash(adminPass, 10);

  await prisma.user.upsert({
    where: { username: adminUser },
    update: {},
    create: {
      username: adminUser,
      passwordHash: hash,
      role: UserRole.ADMIN,
    },
  });

  await prisma.user.upsert({
    where: { username: "consulta" },
    update: {},
    create: {
      username: "consulta",
      passwordHash: await bcrypt.hash("consulta123", 10),
      role: UserRole.READONLY,
    },
  });

  const year = await prisma.academicYear.upsert({
    where: { id: "default-year" },
    update: {},
    create: {
      id: "default-year",
      name: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
      startDate: new Date(`${new Date().getFullYear()}-09-01`),
      endDate: new Date(`${new Date().getFullYear() + 1}-06-30`),
      isActive: true,
    },
  });

  await prisma.schoolSettings.upsert({
    where: { id: "default" },
    update: {
      name: "Escuela de Música Finband",
      address: "C/ Música 12, 28001 Madrid",
      phone: "+34 910 000 123",
      email: "info@finband.local",
      activeYearId: year.id,
    },
    create: {
      id: "default",
      name: "Escuela de Música Finband",
      address: "C/ Música 12, 28001 Madrid",
      phone: "+34 910 000 123",
      email: "info@finband.local",
      activeYearId: year.id,
    },
  });

  const incomeCats = [
    "Cuotas mensuales",
    "Matrículas",
    "Actividades extraordinarias",
    "Conciertos",
    "Donaciones",
  ];
  for (let i = 0; i < incomeCats.length; i++) {
    await prisma.incomeCategory.upsert({
      where: { name: incomeCats[i]! },
      update: {},
      create: { name: incomeCats[i]!, sortOrder: i },
    });
  }

  const expenseCats = [
    "Profesores",
    "Material didáctico",
    "Actividades",
    "Mantenimiento",
    "Suministros",
    "Otros",
  ];
  for (let i = 0; i < expenseCats.length; i++) {
    await prisma.expenseCategory.upsert({
      where: { name: expenseCats[i]! },
      update: {},
      create: { name: expenseCats[i]!, sortOrder: i },
    });
  }
}

async function seedMock() {
  if (process.env.SEED_MOCK === "false") return;

  const existing = await prisma.student.count({ where: { id: { startsWith: "mock-" } } });
  const skipEntities = existing > 0;
  if (skipEntities) {
    console.log("Datos mock ya presentes; actualizando horarios…");
  }

  const ym = yearMonth();
  const due = new Date(new Date().getFullYear(), new Date().getMonth(), 5);

  const t1 = await prisma.teacher.upsert({
    where: { id: "mock-teacher-1" },
    update: {},
    create: {
      id: "mock-teacher-1",
      firstName: "Laura",
      lastName: "Martínez",
      email: "l.martinez@finband.local",
      phone: "+34 600 111 001",
      specialty: "Piano",
      hourlyRate: 28,
      weeklyHours: 18,
      monthlySalary: 1800,
      costPerClass: 32,
      transportCostPerDay: 6.5,
    },
  });

  const t2 = await prisma.teacher.upsert({
    where: { id: "mock-teacher-2" },
    update: {},
    create: {
      id: "mock-teacher-2",
      firstName: "Carlos",
      lastName: "Ruiz",
      email: "c.ruiz@finband.local",
      phone: "+34 600 111 002",
      specialty: "Guitarra",
      hourlyRate: 25,
      weeklyHours: 16,
      costPerClass: 28,
      transportCostPerDay: 5,
    },
  });

  const t3 = await prisma.teacher.upsert({
    where: { id: "mock-teacher-3" },
    update: {},
    create: {
      id: "mock-teacher-3",
      firstName: "Elena",
      lastName: "Vega",
      email: "e.vega@finband.local",
      specialty: "Lenguaje musical",
      hourlyRate: 22,
      weeklyHours: 12,
      costPerClass: 24,
      transportCostPerDay: 4.5,
    },
  });

  const tariffs = [
    {
      id: "mock-tariff-1",
      name: "Piano individual",
      instrument: "Piano",
      classType: ClassType.INDIVIDUAL,
      amount: 75,
      priority: 10,
    },
    {
      id: "mock-tariff-2",
      name: "Guitarra individual",
      instrument: "Guitarra",
      classType: ClassType.INDIVIDUAL,
      amount: 65,
      priority: 10,
    },
    {
      id: "mock-tariff-3",
      name: "Lenguaje colectivo",
      classType: ClassType.LENGUAJE,
      amount: 35,
      priority: 5,
    },
    {
      id: "mock-tariff-4",
      name: "Banda",
      classType: ClassType.BANDA,
      amount: 40,
      priority: 5,
    },
  ] as const;
  for (const rule of tariffs) {
    await prisma.tariffRule.upsert({
      where: { id: rule.id },
      create: rule,
      update: {},
    });
  }

  const cPiano = await prisma.classGroup.upsert({
    where: { id: "mock-class-1" },
    update: {},
    create: {
      id: "mock-class-1",
      name: "Piano — Laura M.",
      type: ClassType.INDIVIDUAL,
      teacherId: t1.id,
      room: "Aula 1",
      durationMinutes: 45,
      maxStudents: 1,
    },
  });

  const cGuitar = await prisma.classGroup.upsert({
    where: { id: "mock-class-2" },
    update: {},
    create: {
      id: "mock-class-2",
      name: "Guitarra — Carlos R.",
      type: ClassType.INDIVIDUAL,
      teacherId: t2.id,
      room: "Aula 2",
      durationMinutes: 45,
      maxStudents: 1,
    },
  });

  const cLang = await prisma.classGroup.upsert({
    where: { id: "mock-class-3" },
    update: {},
    create: {
      id: "mock-class-3",
      name: "Lenguaje musical A",
      type: ClassType.LENGUAJE,
      teacherId: t3.id,
      room: "Aula 3",
      durationMinutes: 60,
      maxStudents: 8,
    },
  });

  const cBand = await prisma.classGroup.upsert({
    where: { id: "mock-class-4" },
    update: {},
    create: {
      id: "mock-class-4",
      name: "Banda juvenil",
      type: ClassType.BANDA,
      teacherId: t2.id,
      room: "Salón",
      durationMinutes: 90,
      maxStudents: 15,
    },
  });

  const mockSlots = [
    { id: "mock-slot-1", classGroupId: cPiano.id, dayOfWeek: 2, startTime: "17:00", endTime: "17:45" },
    { id: "mock-slot-2", classGroupId: cPiano.id, dayOfWeek: 4, startTime: "18:00", endTime: "18:45" },
    { id: "mock-slot-3", classGroupId: cGuitar.id, dayOfWeek: 1, startTime: "19:00", endTime: "19:45" },
    { id: "mock-slot-4", classGroupId: cLang.id, dayOfWeek: 3, startTime: "17:30", endTime: "18:30" },
    { id: "mock-slot-5", classGroupId: cBand.id, dayOfWeek: 5, startTime: "18:00", endTime: "19:30" },
  ] as const;
  for (const slot of mockSlots) {
    await prisma.classScheduleSlot.upsert({
      where: { id: slot.id },
      create: slot,
      update: {
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
      },
    });
  }

  const s1 = await prisma.student.upsert({
    where: { id: "mock-student-1" },
    update: {},
    create: {
      id: "mock-student-1",
      firstName: "Lucía",
      lastName: "García",
      birthDate: new Date("2012-04-15"),
      phone: "+34 611 000 101",
      email: "familia.garcia@example.com",
      legalGuardian: "María García",
      mainInstrument: "Piano",
      level: "Intermedio",
      primaryTeacherId: t1.id,
      address: "C/ Mayor 8, Madrid",
    },
  });

  const s2 = await prisma.student.upsert({
    where: { id: "mock-student-2" },
    update: {},
    create: {
      id: "mock-student-2",
      firstName: "Hugo",
      lastName: "López",
      birthDate: new Date("2010-11-02"),
      mainInstrument: "Guitarra",
      level: "Avanzado",
      primaryTeacherId: t2.id,
      legalGuardian: "Pedro López",
    },
  });

  const s3 = await prisma.student.upsert({
    where: { id: "mock-student-3" },
    update: {},
    create: {
      id: "mock-student-3",
      firstName: "Sofía",
      lastName: "Navarro",
      birthDate: new Date("2014-07-20"),
      mainInstrument: "Piano",
      level: "Iniciación",
      primaryTeacherId: t1.id,
      legalGuardian: "Ana Navarro",
    },
  });

  const s4 = await prisma.student.upsert({
    where: { id: "mock-student-4" },
    update: {},
    create: {
      id: "mock-student-4",
      firstName: "Mateo",
      lastName: "Ibáñez",
      birthDate: new Date("2011-01-30"),
      mainInstrument: "Guitarra",
      level: "Intermedio",
      primaryTeacherId: t2.id,
    },
  });

  const enrollments = [
    [s1.id, cPiano.id],
    [s1.id, cLang.id],
    [s2.id, cGuitar.id],
    [s2.id, cBand.id],
    [s3.id, cPiano.id],
    [s3.id, cLang.id],
    [s4.id, cGuitar.id],
    [s4.id, cLang.id],
  ] as const;

  for (const [studentId, classGroupId] of enrollments) {
    await prisma.enrollment.upsert({
      where: { studentId_classGroupId: { studentId, classGroupId } },
      create: { studentId, classGroupId, active: true },
      update: { active: true },
    });
  }

  await prisma.studentDiscount.upsert({
    where: { id: "mock-discount-1" },
    update: {},
    create: {
      id: "mock-discount-1",
      studentId: s1.id,
      name: "Descuento familiar (2º hermano)",
      type: "PERCENT",
      value: 10,
      active: true,
    },
  });

  await prisma.studentDiscount.upsert({
    where: { id: "mock-discount-2" },
    update: {},
    create: {
      id: "mock-discount-2",
      studentId: s3.id,
      name: "Beca parcial",
      type: "FIXED",
      value: 15,
      isScholarship: true,
      active: true,
    },
  });

  const feeLucia = await prisma.studentFee.upsert({
    where: { studentId_yearMonth: { studentId: s1.id, yearMonth: ym } },
    create: {
      id: "mock-fee-1",
      studentId: s1.id,
      yearMonth: ym,
      baseAmount: 110,
      discountAmount: 11,
      totalAmount: 99,
      amountPaid: 99,
      status: FeeStatus.PAID,
      dueDate: due,
      lineItems: JSON.stringify([
        { label: "Piano individual", amount: 75 },
        { label: "Lenguaje colectivo", amount: 35 },
      ]),
    },
    update: {},
  });

  await prisma.studentPayment.upsert({
    where: { id: "mock-pay-1" },
    update: {},
    create: {
      id: "mock-pay-1",
      feeId: feeLucia.id,
      amount: 99,
      method: PaymentMethod.BIZUM,
      paidAt: monthStart(),
    },
  });

  const feeHugo = await prisma.studentFee.upsert({
    where: { studentId_yearMonth: { studentId: s2.id, yearMonth: ym } },
    create: {
      id: "mock-fee-2",
      studentId: s2.id,
      yearMonth: ym,
      baseAmount: 105,
      discountAmount: 0,
      totalAmount: 105,
      amountPaid: 50,
      status: FeeStatus.PARTIAL,
      dueDate: due,
    },
    update: {},
  });

  await prisma.studentPayment.upsert({
    where: { id: "mock-pay-2" },
    update: {},
    create: {
      id: "mock-pay-2",
      feeId: feeHugo.id,
      amount: 50,
      method: PaymentMethod.TRANSFERENCIA,
      paidAt: monthStart(),
    },
  });

  await prisma.studentFee.upsert({
    where: { studentId_yearMonth: { studentId: s3.id, yearMonth: ym } },
    create: {
      id: "mock-fee-3",
      studentId: s3.id,
      yearMonth: ym,
      baseAmount: 110,
      discountAmount: 15,
      totalAmount: 95,
      amountPaid: 0,
      status: FeeStatus.PENDING,
      dueDate: due,
    },
    update: {},
  });

  await prisma.studentFee.upsert({
    where: { studentId_yearMonth: { studentId: s4.id, yearMonth: ym } },
    create: {
      id: "mock-fee-4",
      studentId: s4.id,
      yearMonth: ym,
      baseAmount: 100,
      discountAmount: 0,
      totalAmount: 100,
      amountPaid: 0,
      status: FeeStatus.PENDING,
      dueDate: due,
    },
    update: {},
  });

  const incomeCuotas = await prisma.incomeCategory.findFirst({
    where: { name: "Cuotas mensuales" },
  });
  const incomeMat = await prisma.incomeCategory.findFirst({
    where: { name: "Matrículas" },
  });
  const expProf = await prisma.expenseCategory.findFirst({
    where: { name: "Profesores" },
  });
  const expMat = await prisma.expenseCategory.findFirst({
    where: { name: "Material didáctico" },
  });

  const today = new Date();
  if (incomeCuotas) {
    const incomes = [
      {
        id: "mock-income-1",
        date: monthStart(),
        concept: "Cuota Lucía García",
        categoryId: incomeCuotas.id,
        amount: 99,
        method: PaymentMethod.BIZUM,
      },
      {
        id: "mock-income-2",
        date: new Date(today.getFullYear(), today.getMonth(), 8),
        concept: "Cuota parcial Hugo López",
        categoryId: incomeCuotas.id,
        amount: 50,
        method: PaymentMethod.TRANSFERENCIA,
      },
    ] as const;
    for (const row of incomes) {
      await prisma.incomeEntry.upsert({
        where: { id: row.id },
        create: row,
        update: {},
      });
    }
  }

  if (incomeMat) {
    await prisma.incomeEntry.upsert({
      where: { id: "mock-income-3" },
      create: {
        id: "mock-income-3",
        date: new Date(today.getFullYear(), today.getMonth(), 3),
        concept: "Matrícula Sofía Navarro",
        categoryId: incomeMat.id,
        amount: 45,
        method: PaymentMethod.EFECTIVO,
      },
      update: {},
    });
  }

  if (expProf && expMat) {
    const expenses = [
      {
        id: "mock-expense-1",
        date: monthStart(),
        concept: "Nómina Laura Martínez (anticipo)",
        categoryId: expProf.id,
        amount: 900,
      },
      {
        id: "mock-expense-2",
        date: new Date(today.getFullYear(), today.getMonth(), 10),
        concept: "Partituras y métodos",
        categoryId: expMat.id,
        amount: 128.5,
      },
    ] as const;
    for (const row of expenses) {
      await prisma.expenseEntry.upsert({
        where: { id: row.id },
        create: row,
        update: {},
      });
    }
  }

  const { calculateTeacherPayout } = await import(
    "../apps/api/src/lib/teacher-payout.js"
  );
  const mockPayoutPaid: Record<string, number> = {
    [t1.id]: 900,
    [t2.id]: 0,
  };
  for (const teacherId of [t1.id, t2.id, t3.id]) {
    const calc = await calculateTeacherPayout(teacherId, ym);
    if (calc.amount <= 0) continue;
    const amountPaid = mockPayoutPaid[teacherId] ?? 0;
    await prisma.teacherPayout.upsert({
      where: { teacherId_yearMonth: { teacherId, yearMonth: ym } },
      create: {
        teacherId,
        yearMonth: ym,
        baseAmount: calc.baseAmount,
        transportAmount: calc.transportAmount,
        workDays: calc.workDays,
        amount: calc.amount,
        amountPaid,
        status:
          amountPaid <= 0
            ? PayoutStatus.PENDING
            : amountPaid >= calc.amount
              ? PayoutStatus.PAID
              : PayoutStatus.PARTIAL,
      },
      update: {
        baseAmount: calc.baseAmount,
        transportAmount: calc.transportAmount,
        workDays: calc.workDays,
        amount: calc.amount,
      },
    });
  }

  const session = await prisma.attendanceSession.upsert({
    where: {
      classGroupId_sessionDate: {
        classGroupId: cLang.id,
        sessionDate: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7),
      },
    },
    create: {
      id: "mock-session-1",
      classGroupId: cLang.id,
      sessionDate: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7),
      notes: "Repaso de ritmos",
    },
    update: {},
  });

  for (const [studentId, present] of [
    [s1.id, true],
    [s3.id, true],
    [s4.id, false],
  ] as const) {
    await prisma.attendanceRecord.upsert({
      where: { sessionId_studentId: { sessionId: session.id, studentId } },
      create: { sessionId: session.id, studentId, present },
      update: { present },
    });
  }

  console.log("Datos mock insertados (4 alumnos, 3 profesores, 4 clases).");
}

async function main() {
  await seedBase();
  await seedMock();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
