export type SlotWithClass = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  classGroup: {
    id: string;
    name: string;
    room: string | null;
    durationMinutes: number;
    teacher: { firstName: string; lastName: string };
  };
};

export type ScheduleOccurrence = {
  scheduleSlotId: string;
  sessionDate: string;
  classId: string;
  className: string;
  room: string | null;
  teacherName: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  cancelled: boolean;
  cancellationId: string | null;
  reason: string | null;
};

export function isoDateParts(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y: y!, m: m!, d: d! };
}

export function toIsoDate(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function isoDayOfWeek(iso: string): number {
  const { y, m, d } = isoDateParts(iso);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  return dow === 0 ? 7 : dow;
}

export function addDaysIso(iso: string, days: number): string {
  const { y, m, d } = isoDateParts(iso);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return toIsoDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function mondayOfWeek(referenceIso: string): string {
  const dow = isoDayOfWeek(referenceIso);
  return addDaysIso(referenceIso, -(dow - 1));
}

function slotDurationHours(startTime: string, endTime: string, fallbackMinutes: number) {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  let mins = eh! * 60 + em! - (sh! * 60 + sm!);
  if (mins <= 0) mins = fallbackMinutes;
  return mins / 60;
}

export function cancellationKey(scheduleSlotId: string, sessionDate: string) {
  return `${scheduleSlotId}:${sessionDate}`;
}

export function expandOccurrencesInRange(
  from: string,
  to: string,
  slots: SlotWithClass[],
  cancelledMap: Map<string, { id: string; reason: string | null }>,
): ScheduleOccurrence[] {
  const out: ScheduleOccurrence[] = [];
  let cursor = from;
  while (cursor <= to) {
    const dow = isoDayOfWeek(cursor);
    for (const slot of slots) {
      if (slot.dayOfWeek !== dow) continue;
      const key = cancellationKey(slot.id, cursor);
      const cancel = cancelledMap.get(key);
      out.push({
        scheduleSlotId: slot.id,
        sessionDate: cursor,
        classId: slot.classGroup.id,
        className: slot.classGroup.name,
        room: slot.classGroup.room,
        teacherName: `${slot.classGroup.teacher.firstName} ${slot.classGroup.teacher.lastName}`,
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
        cancelled: !!cancel,
        cancellationId: cancel?.id ?? null,
        reason: cancel?.reason ?? null,
      });
    }
    cursor = addDaysIso(cursor, 1);
  }
  return out.sort((a, b) =>
    a.sessionDate === b.sessionDate
      ? a.startTime.localeCompare(b.startTime)
      : a.sessionDate.localeCompare(b.sessionDate),
  );
}

export function monthBounds(yearMonth: string) {
  const [y, m] = yearMonth.split("-").map(Number);
  const lastDay = new Date(y!, m!, 0).getDate();
  return {
    from: toIsoDate(y!, m!, 1),
    to: toIsoDate(y!, m!, lastDay),
  };
}

export function scheduleTotalsInRange(
  from: string,
  to: string,
  classGroups: Array<{
    durationMinutes: number;
    scheduleSlots: Array<{ id: string; dayOfWeek: number; startTime: string; endTime: string }>;
  }>,
  cancelledKeys: Set<string>,
) {
  let sessionCount = 0;
  let totalHours = 0;
  const workDayDates = new Set<string>();

  let cursor = from;
  while (cursor <= to) {
    const dow = isoDayOfWeek(cursor);
    for (const group of classGroups) {
      for (const slot of group.scheduleSlots) {
        if (slot.dayOfWeek !== dow) continue;
        if (cancelledKeys.has(cancellationKey(slot.id, cursor))) continue;
        sessionCount += 1;
        totalHours += slotDurationHours(slot.startTime, slot.endTime, group.durationMinutes);
        workDayDates.add(cursor);
      }
    }
    cursor = addDaysIso(cursor, 1);
  }

  return {
    sessionCount,
    totalHours,
    workDays: workDayDates.size,
    classCount: classGroups.length,
  };
}
