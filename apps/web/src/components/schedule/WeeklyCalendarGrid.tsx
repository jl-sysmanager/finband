import { WEEKDAYS, parseTimeToMinutes, weekdayLabel } from "@finband/shared";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addDaysIso, formatShortDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

export type ScheduleOccurrence = {
  scheduleSlotId: string;
  sessionDate: string;
  classId: string;
  className: string;
  room?: string | null;
  teacherName: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  cancelled: boolean;
  cancellationId: string | null;
  reason: string | null;
};

const DAY_START = 8 * 60;
const DAY_END = 21 * 60;
const HOUR_HEIGHT = 52;

const CLASS_PALETTE = [
  { bg: "bg-teal-500/15", border: "border-teal-600/45", text: "text-teal-900 dark:text-teal-100", accent: "bg-teal-600" },
  { bg: "bg-amber-500/15", border: "border-amber-600/45", text: "text-amber-950 dark:text-amber-100", accent: "bg-amber-500" },
  { bg: "bg-violet-500/15", border: "border-violet-600/45", text: "text-violet-950 dark:text-violet-100", accent: "bg-violet-600" },
  { bg: "bg-sky-500/15", border: "border-sky-600/45", text: "text-sky-950 dark:text-sky-100", accent: "bg-sky-600" },
  { bg: "bg-rose-500/15", border: "border-rose-600/45", text: "text-rose-950 dark:text-rose-100", accent: "bg-rose-600" },
  { bg: "bg-emerald-500/15", border: "border-emerald-600/45", text: "text-emerald-950 dark:text-emerald-100", accent: "bg-emerald-600" },
];

function paletteForClass(classId: string) {
  let h = 0;
  for (let i = 0; i < classId.length; i++) h = (h + classId.charCodeAt(i) * 17) % CLASS_PALETTE.length;
  return CLASS_PALETTE[h]!;
}

type Props = {
  weekStartIso: string;
  occurrences: ScheduleOccurrence[];
  isAdmin?: boolean;
  onOccurrenceClick?: (occ: ScheduleOccurrence) => void;
  onCancel?: (occ: ScheduleOccurrence) => void;
};

export function WeeklyCalendarGrid({
  weekStartIso,
  occurrences,
  isAdmin,
  onOccurrenceClick,
  onCancel,
}: Props) {
  const hours: number[] = [];
  for (let m = DAY_START; m <= DAY_END; m += 60) hours.push(m);

  const active = occurrences.filter((o) => !o.cancelled);
  const cancelledCount = occurrences.filter((o) => o.cancelled).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-6 rounded-md border-2 border-teal-600/40 bg-teal-500/20 shadow-sm" />
          Clase programada — pulsa para gestionar
        </span>
        {cancelledCount > 0 ? (
          <span>{cancelledCount} sesión(es) suspendida(s) (listado inferior)</span>
        ) : null}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-gradient-to-b from-card to-muted/20 shadow-md">
        <div className="min-w-[780px]">
          <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border bg-muted/50 text-xs font-semibold tracking-wide">
            <div className="p-2" />
            {WEEKDAYS.map((d, i) => {
              const dateIso = addDaysIso(weekStartIso, i);
              const isToday = dateIso === new Date().toISOString().slice(0, 10);
              return (
                <div
                  key={d.value}
                  className={cn(
                    "border-l border-border p-2 text-center",
                    isToday && "bg-primary/5",
                  )}
                >
                  <div className={isToday ? "text-primary" : undefined}>{d.short}</div>
                  <div className="text-[10px] font-normal text-muted-foreground">
                    {formatShortDate(dateIso)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="relative grid grid-cols-[60px_repeat(7,1fr)]">
            <div className="bg-muted/20">
              {hours.map((m) => (
                <div
                  key={m}
                  className="border-b border-border/50 pr-2 text-right text-[10px] font-medium text-muted-foreground"
                  style={{ height: HOUR_HEIGHT }}
                >
                  {String(Math.floor(m / 60)).padStart(2, "0")}:00
                </div>
              ))}
            </div>
            {WEEKDAYS.map((day, colIndex) => {
              const dateIso = addDaysIso(weekStartIso, colIndex);
              return (
                <div key={day.value} className="relative border-l border-border/80 bg-card/40">
                  {hours.map((m) => (
                    <div
                      key={m}
                      className="border-b border-border/30"
                      style={{ height: HOUR_HEIGHT }}
                    />
                  ))}
                  {active
                    .filter((e) => e.sessionDate === dateIso)
                    .map((e) => {
                      const pal = paletteForClass(e.classId);
                      const top =
                        ((parseTimeToMinutes(e.startTime) - DAY_START) / 60) * HOUR_HEIGHT;
                      const height =
                        ((parseTimeToMinutes(e.endTime) - parseTimeToMinutes(e.startTime)) / 60) *
                        HOUR_HEIGHT;
                      return (
                        <button
                          type="button"
                          key={`${e.scheduleSlotId}-${e.sessionDate}`}
                          className={cn(
                            "absolute left-1.5 right-1.5 overflow-hidden rounded-lg border-2 p-2 text-left text-[11px] leading-snug shadow-md transition hover:scale-[1.02] hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                            pal.bg,
                            pal.border,
                            pal.text,
                          )}
                          style={{ top: Math.max(0, top), height: Math.max(44, height) }}
                          title={`${e.className} · ${weekdayLabel(e.dayOfWeek)} ${e.startTime}-${e.endTime}`}
                          onClick={() => onOccurrenceClick?.(e)}
                        >
                          <span className={cn("absolute left-0 top-0 h-full w-1", pal.accent)} />
                          <div className="flex items-start justify-between gap-1 pl-1">
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-bold">{e.className}</p>
                              <p className="font-medium opacity-90">
                                {e.startTime}–{e.endTime}
                              </p>
                              {e.room ? (
                                <p className="truncate text-[10px] opacity-75">Aula {e.room}</p>
                              ) : null}
                              <p className="truncate text-[10px] opacity-75">{e.teacherName}</p>
                            </div>
                            {isAdmin && onCancel ? (
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 shrink-0 opacity-70 hover:opacity-100"
                                aria-label="Suspender esta sesión"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  onCancel(e);
                                }}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
