import { selectClassName } from "@/lib/form-classes";
import { cn, yearOptions } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
};

export function YearSelect({ value, onChange, className, disabled }: Props) {
  const options = yearOptions();

  return (
    <select
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
