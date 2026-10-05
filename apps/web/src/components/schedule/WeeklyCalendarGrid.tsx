import { WEEKDAYS, parseTimeToMinutes, weekdayLabel } from "@finband/shared";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export type CalendarEvent = {
  classId: string;
  className: string;
  room?: string | null;
  teacherName: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

const DAY_START = 8 * 60;
const DAY_END = 21 * 60;
const HOUR_HEIGHT = 48;

type Props = {
  events: CalendarEvent[];
};

export function WeeklyCalendarGrid({ events }: Props) {
  const hours: number[] = [];
  for (let m = DAY_START; m <= DAY_END; m += 60) hours.push(m);

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-border bg-muted/40 text-xs font-medium">
          <div className="p-2" />
          {WEEKDAYS.map((d) => (
            <div key={d.value} className="border-l border-border p-2 text-center">
              {d.short}
            </div>
          ))}
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
          {WEEKDAYS.map((day) => (
            <div key={day.value} className="relative border-l border-border">
              {hours.map((m) => (
                <div
                  key={m}
                  className="border-b border-border/40"
                  style={{ height: HOUR_HEIGHT }}
                />
              ))}
              {events
                .filter((e) => e.dayOfWeek === day.value)
                .map((e) => {
                  const top =
                    ((parseTimeToMinutes(e.startTime) - DAY_START) / 60) * HOUR_HEIGHT;
                  const height =
                    ((parseTimeToMinutes(e.endTime) - parseTimeToMinutes(e.startTime)) / 60) *
                    HOUR_HEIGHT;
                  return (
                    <Link
                      key={`${e.classId}-${e.startTime}`}
                      to={`/clases/${e.classId}`}
                      className={cn(
                        "absolute left-1 right-1 overflow-hidden rounded-md border border-primary/30 bg-primary/10 p-1.5 text-[10px] leading-tight shadow-sm hover:bg-primary/15",
                      )}
                      style={{ top: Math.max(0, top), height: Math.max(28, height) }}
                      title={`${e.className} · ${weekdayLabel(e.dayOfWeek)} ${e.startTime}-${e.endTime}`}
                    >
                      <p className="font-semibold text-primary">{e.className}</p>
                      <p className="text-muted-foreground">
                        {e.startTime}–{e.endTime}
                      </p>
                      <p className="truncate text-muted-foreground">{e.teacherName}</p>
                    </Link>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
