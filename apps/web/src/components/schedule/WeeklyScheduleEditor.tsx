import { WEEKDAYS } from "@finband/shared";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export type ScheduleSlotDraft = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

type Props = {
  value: ScheduleSlotDraft[];
  onChange: (slots: ScheduleSlotDraft[]) => void;
  disabled?: boolean;
};

export function WeeklyScheduleEditor({ value, onChange, disabled }: Props) {
  function update(index: number, patch: Partial<ScheduleSlotDraft>) {
    onChange(value.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function add() {
    onChange([...value, { dayOfWeek: 1, startTime: "17:00", endTime: "18:00" }]);
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      <Label>Horario semanal</Label>
      {value.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin franjas horarias definidas.</p>
      ) : (
        <ul className="space-y-2">
          {value.map((slot, index) => (
            <li
              key={index}
              className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
            >
              <select
                className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
                value={slot.dayOfWeek}
                disabled={disabled}
                onChange={(e) => update(index, { dayOfWeek: Number(e.target.value) })}
              >
                {WEEKDAYS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
              <input
                type="time"
                className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
                value={slot.startTime}
                disabled={disabled}
                onChange={(e) => update(index, { startTime: e.target.value })}
              />
              <input
                type="time"
                className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
                value={slot.endTime}
                disabled={disabled}
                onChange={(e) => update(index, { endTime: e.target.value })}
              />
              {!disabled ? (
                <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {!disabled ? (
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="h-4 w-4" /> Añadir franja
        </Button>
      ) : null}
    </div>
  );
}
