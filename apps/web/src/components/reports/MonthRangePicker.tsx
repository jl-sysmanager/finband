import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { MonthSelect } from "@/components/form/MonthSelect";
import { FilterField } from "@/components/list/FilterField";
import { Button } from "@/components/ui/button";
import type { MonthRange } from "@/components/reports/report-catalog";
import { api } from "@/lib/api";
import { currentYearMonth } from "@/lib/utils";

const ymOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** Mes de una fecha de calendario guardada a medianoche UTC. */
const ymOfCalendarDate = (iso: string) => iso.slice(0, 7);

/** Selector "Desde / Hasta" con atajos habituales (mes, mes anterior, curso, año). */
export function MonthRangePicker({
  value,
  onChange,
}: {
  value: MonthRange;
  onChange: (range: MonthRange) => void;
}) {
  const school = useQuery({
    queryKey: ["school"],
    queryFn: () =>
      api<{ activeYear?: { name: string; startDate: string; endDate: string } | null }>(
        "/settings/school",
      ),
  });
  // Fecha de referencia fijada al montar (no cambia entre renders).
  const [now] = useState(() => new Date());
  const current = currentYearMonth();
  const previous = ymOf(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const course = school.data?.activeYear;

  const presets: Array<{ label: string; range: MonthRange }> = [
    { label: "Este mes", range: { monthFrom: current, monthTo: current } },
    { label: "Mes anterior", range: { monthFrom: previous, monthTo: previous } },
    ...(course
      ? [
          {
            label: `Curso ${course.name}`,
            range: {
              monthFrom: ymOfCalendarDate(course.startDate),
              monthTo: ymOfCalendarDate(course.endDate),
            },
          },
        ]
      : []),
    {
      label: `Año ${now.getFullYear()}`,
      range: { monthFrom: `${now.getFullYear()}-01`, monthTo: `${now.getFullYear()}-12` },
    },
  ];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <FilterField label="Desde">
          <MonthSelect
            className="min-w-[170px]"
            value={value.monthFrom}
            onChange={(monthFrom) =>
              onChange({ monthFrom, monthTo: monthFrom > value.monthTo ? monthFrom : value.monthTo })
            }
          />
        </FilterField>
        <FilterField label="Hasta">
          <MonthSelect
            className="min-w-[170px]"
            value={value.monthTo}
            onChange={(monthTo) =>
              onChange({ monthFrom: monthTo < value.monthFrom ? monthTo : value.monthFrom, monthTo })
            }
          />
        </FilterField>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Periodos habituales">
        {presets.map((p) => {
          const active = p.range.monthFrom === value.monthFrom && p.range.monthTo === value.monthTo;
          return (
            <Button
              key={p.label}
              type="button"
              size="sm"
              variant={active ? "default" : "outline"}
              aria-pressed={active}
              onClick={() => onChange(p.range)}
            >
              {p.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
