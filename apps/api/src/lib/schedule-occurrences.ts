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

/**
 * Duración de una franja en minutos. Si la hora de fin no es posterior a la de
 * inicio (dato incompleto), se usa la duración configurada en la clase.
 */
export function slotDurationMinutes(startTime: string, endTime: string, fallbackMinutes: number) {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const mins = eh! * 60 + em! - (sh! * 60 + sm!);
  return mins > 0 ? mins : fallbackMinutes;
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

export type ScheduleGroupInput = {
  id?: string;
  name?: string;
  durationMinutes: number;
  scheduleSlots: Array<{ id: string; dayOfWeek: number; startTime: string; endTime: string }>;
  /** Primer día ("YYYY-MM-DD") en que existe la clase: antes no cuenta. */
  activeFrom?: string | null;
  /** Último día (incluido, "YYYY-MM-DD") en que se impartió una clase ya borrada. */
  activeUntil?: string | null;
};

/**
 * Sesiones y minutos del horario entre dos fechas (incluidas), sin las sesiones
 * suspendidas ni los días en que la clase aún no existía o ya estaba borrada.
 * Devuelve también el desglose por clase y los días distintos con clase (para el
 * transporte por jornada).
 */
export function scheduleTotalsInRange(
  from: string,
  to: string,
  classGroups: ScheduleGroupInput[],
  cancelledKeys: Set<string>,
) {
  const perGroup = classGroups.map((g) => ({ group: g, sessions: 0, minutes: 0 }));
  const workDayDates = new Set<string>();

  let cursor = from;
  while (cursor <= to) {
    const dow = isoDayOfWeek(cursor);
    for (const acc of perGroup) {
      const group = acc.group;
      if (group.activeFrom && cursor < group.activeFrom) continue;
      if (group.activeUntil && cursor > group.activeUntil) continue;
      for (const slot of group.scheduleSlots) {
        if (slot.dayOfWeek !== dow) continue;
        if (cancelledKeys.has(cancellationKey(slot.id, cursor))) continue;
        acc.sessions += 1;
        acc.minutes += slotDurationMinutes(slot.startTime, slot.endTime, group.durationMinutes);
        workDayDates.add(cursor);
      }
    }
    cursor = addDaysIso(cursor, 1);
  }

  const sessionCount = perGroup.reduce((t, g) => t + g.sessions, 0);
  const totalMinutes = perGroup.reduce((t, g) => t + g.minutes, 0);
  return {
    sessionCount,
    totalMinutes,
    totalHours: totalMinutes / 60,
    workDays: workDayDates.size,
    classCount: classGroups.length,
    perGroup,
  };
}
