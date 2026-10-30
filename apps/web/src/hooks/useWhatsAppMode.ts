import { useSyncExternalStore } from "react";
import {
  getWhatsAppMode,
  setWhatsAppMode,
  subscribeWhatsAppMode,
  type WhatsAppMode,
} from "@/lib/whatsapp";

/** Preferencia de este equipo para abrir WhatsApp (aplicación o WhatsApp Web). */
export function useWhatsAppMode(): [WhatsAppMode, (mode: WhatsAppMode) => void] {
  const mode = useSyncExternalStore(subscribeWhatsAppMode, getWhatsAppMode, () => "web" as const);
  return [mode, setWhatsAppMode];
}
