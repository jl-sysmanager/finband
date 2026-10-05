import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
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
    update: {},
    create: {
      id: "default",
      name: "Escuela de Música Finband",
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

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
