import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  size?: "sm" | "md" | "lg";
  children: ReactNode;
  submitLabel?: string;
  cancelLabel?: string;
  onSubmit?: () => void;
  submitDisabled?: boolean;
  pending?: boolean;
};

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  size = "md",
  children,
  submitLabel = "Guardar",
  cancelLabel = "Cancelar",
  onSubmit,
  submitDisabled,
  pending,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size={size}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
        <DialogFooter className="gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          {onSubmit ? (
            <Button type="button" size="sm" disabled={submitDisabled || pending} onClick={onSubmit}>
              {pending ? "Guardando…" : submitLabel}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
