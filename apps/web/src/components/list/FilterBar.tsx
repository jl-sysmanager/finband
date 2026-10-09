import type { ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  className?: string;
};

export function FilterBar({ children, className }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className={cn("hidden flex-wrap items-end gap-3 md:flex", className)}>{children}</div>
      <div className="md:hidden">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="w-full">
              <SlidersHorizontal className="h-4 w-4" /> Filtros
            </Button>
          </DialogTrigger>
          <DialogContent size="sm">
            <DialogHeader>
              <DialogTitle>Filtros</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3" onClick={() => setOpen(false)}>
              {children}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
