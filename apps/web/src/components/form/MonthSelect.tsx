import { useMemo } from "react";
import { FormSelect } from "@/components/form/FormSelect";
import { ensureMonthInOptions, monthOptions } from "@/lib/utils";

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
    <FormSelect
      id={id}
      disabled={disabled}
      className={className}
      value={value}
      onValueChange={onChange}
      options={options}
      placeholder="Mes…"
    />
  );
}
