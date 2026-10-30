import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWhatsAppMode } from "@/hooks/useWhatsAppMode";
import { openWhatsApp, type WhatsAppMode } from "@/lib/whatsapp";

const OPTIONS: Array<{ value: WhatsAppMode; title: string; help: string }> = [
  {
    value: "app",
    title: "Aplicación de WhatsApp instalada",
    help: "Recomendado si este equipo tiene WhatsApp Desktop: abre el chat directamente, sin ventanas nuevas ni volver a vincular.",
  },
  {
    value: "web",
    title: "WhatsApp Web",
    help: "Usa siempre la misma pestaña del navegador. Escanee el código QR una vez; no use el modo incógnito o se pedirá cada vez.",
  },
];

/** Preferencia de este equipo para abrir WhatsApp al enviar mensajes. */
export function WhatsAppSettingsCard() {
  const [mode, setMode] = useWhatsAppMode();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">WhatsApp en este equipo</CardTitle>
        <p className="text-sm text-muted-foreground">
          Los recordatorios se abren en WhatsApp con el chat y el texto preparados; solo hay que
          pulsar «Enviar». Este ajuste se guarda en este navegador.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div role="radiogroup" aria-label="Abrir WhatsApp con" className="grid gap-2 md:grid-cols-2">
          {OPTIONS.map((o) => (
            <label
              key={o.value}
              className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${
                mode === o.value ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <input
                type="radio"
                name="whatsapp-mode"
                value={o.value}
                checked={mode === o.value}
                onChange={() => setMode(o.value)}
                className="mt-0.5 accent-primary"
              />
              <span>
                <span className="block font-medium">{o.title}</span>
                <span className="block text-xs text-muted-foreground">{o.help}</span>
              </span>
            </label>
          ))}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => openWhatsApp(null, "Prueba de envío desde Finband")}
        >
          <MessageCircle className="h-4 w-4" /> Probar
        </Button>
        <p className="text-xs text-muted-foreground">
          «Probar» abre WhatsApp para elegir un chat con un mensaje de prueba (no se envía nada solo).
          En el móvil se usa siempre la aplicación.
        </p>
      </CardContent>
    </Card>
  );
}
