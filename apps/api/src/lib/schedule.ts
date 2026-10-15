import type { Prisma } from "@prisma/client";

export type ScheduleSlotInput = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

/**
 * Sincroniza las franjas semanales de una clase. Las franjas que siguen
 * existiendo (mismo día y hora de inicio) se conservan para no perder sus
 * suspensiones puntuales (festivos), que cuelgan de ellas en cascada.
 */
export async function replaceScheduleSlots(
  tx: Prisma.TransactionClient,
  classGroupId: string,
  slots: ScheduleSlotInput[] | undefined,
) {
  if (slots === undefined) return;
  const key = (s: { dayOfWeek: number; startTime: string }) => `${s.dayOfWeek}|${s.startTime}`;
  const wanted = new Map(slots.map((s) => [key(s), s]));
  const current = await tx.classScheduleSlot.findMany({ where: { classGroupId } });

  const removed = current.filter((c) => !wanted.has(key(c)));
  if (removed.length > 0) {
    await tx.classScheduleSlot.deleteMany({ where: { id: { in: removed.map((r) => r.id) } } });
  }
  for (const c of current) {
    const next = wanted.get(key(c));
    if (next && next.endTime !== c.endTime) {
      await tx.classScheduleSlot.update({ where: { id: c.id }, data: { endTime: next.endTime } });
    }
  }
  const existingKeys = new Set(current.map(key));
  const added = [...wanted.values()].filter((s) => !existingKeys.has(key(s)));
  if (added.length > 0) {
    await tx.classScheduleSlot.createMany({
      data: added.map((s) => ({
        classGroupId,
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
      })),
    });
  }
}

export const classIncludeSchedule = {
  teacher: true,
  scheduleSlots: { orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] },
} satisfies Prisma.ClassGroupInclude;
