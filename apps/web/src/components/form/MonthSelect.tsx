import { useMemo } from "react";
import { selectClassName } from "@/lib/form-classes";
import { cn, ensureMonthInOptions, monthOptions } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  id?: string;
};

export function MonthSelect({ value, onChange, className, disabled, id }: Props) {
  const options = useMemo(
    () => ensureMonthInOptions(value, monthOptions()),
    [value],
  );

  return (
    <select
      id={id}
      disabled={disabled}
      className={cn(selectClassName, className)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
