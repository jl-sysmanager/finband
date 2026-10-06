import { useCallback, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
};

export function useConfirm() {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({ title: "" });
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const finish = useCallback((value: boolean) => {
    setOpen(false);
    resolveRef.current?.(value);
    resolveRef.current = null;
  }, []);

  const dialog = (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) finish(false);
      }}
      title={options.title}
      description={options.description}
      confirmLabel={options.confirmLabel}
      destructive={options.destructive}
      onConfirm={() => finish(true)}
    />
  );

  return { confirm, dialog };
}
