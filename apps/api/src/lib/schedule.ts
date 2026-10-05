import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export type ScheduleSlotInput = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

export async function replaceScheduleSlots(
  classGroupId: string,
  slots: ScheduleSlotInput[] | undefined,
) {
  if (slots === undefined) return;
  await prisma.classScheduleSlot.deleteMany({ where: { classGroupId } });
  if (slots.length === 0) return;
  await prisma.classScheduleSlot.createMany({
    data: slots.map((s) => ({
      classGroupId,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
    })),
  });
}

export const classIncludeSchedule = {
  teacher: true,
  scheduleSlots: { orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] },
} satisfies Prisma.ClassGroupInclude;
