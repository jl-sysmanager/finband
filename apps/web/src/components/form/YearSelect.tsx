import { FormSelect } from "@/components/form/FormSelect";
import { yearOptions } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
};

export function YearSelect({ value, onChange, className, disabled }: Props) {
  return (
    <FormSelect
      disabled={disabled}
      className={className}
      value={value}
      onValueChange={onChange}
      options={yearOptions()}
      placeholder="Año…"
    />
  );
}
