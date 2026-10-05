import { WEEKDAYS, parseTimeToMinutes, weekdayLabel } from "@finband/shared";
import { X } from "lucide-react";
import { Link } from "react-router-dom";
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
const HOUR_HEIGHT = 48;

type Props = {
  weekStartIso: string;
  occurrences: ScheduleOccurrence[];
  isAdmin?: boolean;
  onCancel?: (occ: ScheduleOccurrence) => void;
};

export function WeeklyCalendarGrid({ weekStartIso, occurrences, isAdmin, onCancel }: Props) {
  const hours: number[] = [];
  for (let m = DAY_START; m <= DAY_END; m += 60) hours.push(m);

  const active = occurrences.filter((o) => !o.cancelled);

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-border bg-muted/40 text-xs font-medium">
          <div className="p-2" />
          {WEEKDAYS.map((d, i) => {
            const dateIso = addDaysIso(weekStartIso, i);
            return (
              <div key={d.value} className="border-l border-border p-2 text-center">
                <div>{d.short}</div>
                <div className="text-[10px] font-normal text-muted-foreground">
                  {formatShortDate(dateIso)}
                </div>
              </div>
            );
          })}
        </div>
        <div className="relative grid grid-cols-[56px_repeat(7,1fr)]">
          <div>
            {hours.map((m) => (
              <div
                key={m}
                className="border-b border-border/60 pr-2 text-right text-[10px] text-muted-foreground"
                style={{ height: HOUR_HEIGHT }}
              >
                {String(Math.floor(m / 60)).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          {WEEKDAYS.map((day, colIndex) => {
            const dateIso = addDaysIso(weekStartIso, colIndex);
            return (
              <div key={day.value} className="relative border-l border-border">
                {hours.map((m) => (
                  <div
                    key={m}
                    className="border-b border-border/40"
                    style={{ height: HOUR_HEIGHT }}
                  />
                ))}
                {active
                  .filter((e) => e.sessionDate === dateIso)
                  .map((e) => {
                    const top =
                      ((parseTimeToMinutes(e.startTime) - DAY_START) / 60) * HOUR_HEIGHT;
                    const height =
                      ((parseTimeToMinutes(e.endTime) - parseTimeToMinutes(e.startTime)) / 60) *
                      HOUR_HEIGHT;
                    return (
                      <div
                        key={`${e.scheduleSlotId}-${e.sessionDate}`}
                        className={cn(
                          "absolute left-1 right-1 overflow-hidden rounded-md border border-primary/30 bg-primary/10 p-1.5 text-[10px] leading-tight shadow-sm",
                        )}
                        style={{ top: Math.max(0, top), height: Math.max(36, height) }}
                        title={`${e.className} · ${weekdayLabel(e.dayOfWeek)} ${e.startTime}-${e.endTime}`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <Link
                            to={`/clases/${e.classId}`}
                            className="min-w-0 flex-1 hover:underline"
                          >
                            <p className="font-semibold text-primary">{e.className}</p>
                            <p className="text-muted-foreground">
                              {e.startTime}–{e.endTime}
                            </p>
                            <p className="truncate text-muted-foreground">{e.teacherName}</p>
                          </Link>
                          {isAdmin && onCancel ? (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 shrink-0"
                              aria-label="Suspender esta sesión"
                              onClick={() => onCancel(e)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
