export const WEEKDAYS = [
  { value: 1, label: "Lunes", short: "Lun" },
  { value: 2, label: "Martes", short: "Mar" },
  { value: 3, label: "Miércoles", short: "Mié" },
  { value: 4, label: "Jueves", short: "Jue" },
  { value: 5, label: "Viernes", short: "Vie" },
  { value: 6, label: "Sábado", short: "Sáb" },
  { value: 7, label: "Domingo", short: "Dom" },
] as const;

export type WeekdayValue = (typeof WEEKDAYS)[number]["value"];

export function weekdayLabel(dayOfWeek: number, short = false) {
  const d = WEEKDAYS.find((w) => w.value === dayOfWeek);
  if (!d) return "—";
  return short ? d.short : d.label;
}

export function parseTimeToMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
