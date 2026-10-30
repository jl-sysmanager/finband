import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, Mail, MessageCircle } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useWhatsAppMode } from "@/hooks/useWhatsAppMode";
import { ApiError, api } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import { effectiveWhatsAppMode, openWhatsApp } from "@/lib/whatsapp";
import { toast } from "@/stores/toast";

type ReminderPayload = {
  feeId: string;
  studentName: string;
  pending: number;
  subject: string;
  body: string;
  mailto: string | null;
  whatsappPhone: string | null;
};

type Channel = "whatsapp-app" | "whatsapp-web" | "email";

type Props = {
  feeId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function FeeReminderDialog({ feeId, open, onOpenChange }: Props) {
  const [copied, setCopied] = useState(false);
  // Se lee para que el texto del modo se actualice si se cambia en Configuración.
  useWhatsAppMode();
  const mode = effectiveWhatsAppMode();

  // Vista previa: no deja rastro. El recordatorio se registra al enviarlo.
  const preview = useQuery({
    queryKey: ["fee-reminder", feeId],
    queryFn: () => api<ReminderPayload>(`/payments/student-fees/${feeId}/reminder`),
    enabled: open && !!feeId,
    staleTime: 0,
  });

  const record = useMutation({
    mutationFn: (channel: Channel) =>
      api(`/payments/student-fees/${feeId}/reminder`, {
        method: "POST",
        body: JSON.stringify({ channel }),
      }),
    onError: () => toast("No se pudo registrar el envío en la auditoría", "error"),
  });

  const data = preview.data;
  const error =
    preview.error instanceof ApiError ? preview.error.message : preview.error ? "Error" : null;

  function sendWhatsApp() {
    if (!data) return;
    // Primero se abre WhatsApp (dentro del clic, para que no lo bloquee el navegador).
    const used = openWhatsApp(data.whatsappPhone, data.body);
    record.mutate(used === "app" ? "whatsapp-app" : "whatsapp-web");
  }

  async function copyText() {
    if (!data?.body) return;
    await navigator.clipboard.writeText(data.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setCopied(false);
        onOpenChange(o);
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Recordatorio de cuota</DialogTitle>
        </DialogHeader>
        {preview.isLoading ? (
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
              {data.whatsappPhone ? (
                <Button size="sm" onClick={sendWhatsApp}>
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">Sin teléfono válido</span>
              )}
              {data.mailto ? (
                <Button size="sm" variant="outline" asChild>
                  <a href={data.mailto} onClick={() => record.mutate("email")}>
                    <Mail className="h-4 w-4" /> Email
                  </a>
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">Sin email del alumno</span>
              )}
              <Button size="sm" variant="outline" onClick={() => void copyText()}>
                <Copy className="h-4 w-4" /> {copied ? "Copiado" : "Copiar texto"}
              </Button>
            </div>
            {data.whatsappPhone ? (
              <p className="text-xs text-muted-foreground">
                WhatsApp se abrirá en{" "}
                {mode === "app" ? "la aplicación instalada" : "WhatsApp Web (siempre la misma pestaña)"}.
                Revise el mensaje y pulse «Enviar».{" "}
                <Link to="/configuracion" className="underline" onClick={() => onOpenChange(false)}>
                  Cambiar
                </Link>
              </p>
            ) : null}
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
