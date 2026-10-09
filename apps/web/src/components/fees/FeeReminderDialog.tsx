import { useMutation } from "@tanstack/react-query";
import { Copy, Mail, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError, api } from "@/lib/api";
import { formatMoney } from "@/lib/utils";

type ReminderPayload = {
  feeId: string;
  studentName: string;
  pending: number;
  subject: string;
  body: string;
  mailto: string | null;
  whatsapp: string | null;
};

type Props = {
  feeId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function FeeReminderDialog({ feeId, open, onOpenChange }: Props) {
  const [copied, setCopied] = useState(false);

  const load = useMutation({
    mutationFn: (id: string) =>
      api<ReminderPayload>(`/payments/student-fees/${id}/reminder`, {
        method: "POST",
        body: JSON.stringify({ channel: "dialog" }),
      }),
  });

  useEffect(() => {
    if (open && feeId) {
      load.mutate(feeId);
    }
    if (!open) {
      load.reset();
      setCopied(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when dialog closes
  }, [open, feeId]);

  const data = load.data;
  const error = load.error instanceof ApiError ? load.error.message : load.error ? "Error" : null;

  async function copyText() {
    if (!data?.body) return;
    await navigator.clipboard.writeText(data.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Recordatorio de cuota</DialogTitle>
        </DialogHeader>
        {load.isPending ? (
          <p className="text-sm text-muted-foreground">Preparando mensaje…</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : data ? (
          <div className="space-y-3 text-sm">
            <p>
              <span className="font-medium">{data.studentName}</span> · Pendiente:{" "}
              {formatMoney(data.pending)}
            </p>
            <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs">
              {data.body}
            </pre>
            <div className="flex flex-wrap gap-2">
              {data.mailto ? (
                <Button size="sm" variant="outline" asChild>
                  <a href={data.mailto}>
                    <Mail className="h-4 w-4" /> Email
                  </a>
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">Sin email del alumno</span>
              )}
              {data.whatsapp ? (
                <Button size="sm" variant="outline" asChild>
                  <a href={data.whatsapp} target="_blank" rel="noreferrer">
                    <MessageCircle className="h-4 w-4" /> WhatsApp
                  </a>
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">Sin teléfono válido</span>
              )}
              <Button size="sm" variant="outline" onClick={() => void copyText()}>
                <Copy className="h-4 w-4" /> {copied ? "Copiado" : "Copiar texto"}
              </Button>
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
