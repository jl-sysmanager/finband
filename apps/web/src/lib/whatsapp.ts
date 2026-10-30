/**
 * Envío de mensajes por WhatsApp sin coste: se abre WhatsApp con el chat y el texto
 * ya escritos y la persona pulsa «Enviar». Cada equipo elige cómo abrirlo:
 *
 * - "app": la aplicación de WhatsApp instalada (escritorio o móvil) mediante
 *   `whatsapp://`. No abre ventanas nuevas ni recarga nada: la sesión es la de la app.
 * - "web": WhatsApp Web, siempre en la MISMA pestaña ("finband-whatsapp"). Así no se
 *   abre una pestaña por mensaje ni aparece «WhatsApp está abierto en otra ventana».
 *
 * La preferencia se guarda en este navegador: depende de si el equipo tiene la app.
 */

export type WhatsAppMode = "app" | "web";

const STORAGE_KEY = "finband:whatsapp-mode";
const WINDOW_NAME = "finband-whatsapp";
const listeners = new Set<() => void>();

export function getWhatsAppMode(): WhatsAppMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "app" || v === "web") return v;
  } catch {
    // Sin almacenamiento (modo privado): valor por defecto.
  }
  return "web";
}

export function setWhatsAppMode(mode: WhatsAppMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Se aplica solo en esta sesión.
  }
  listeners.forEach((l) => l());
}

export function subscribeWhatsAppMode(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** En móviles WhatsApp Web no funciona: siempre se usa la aplicación. */
function isMobileDevice() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** Modo que se aplicará de verdad en este dispositivo. */
export function effectiveWhatsAppMode(): WhatsAppMode {
  return isMobileDevice() ? "app" : getWhatsAppMode();
}

/** `phone`: solo dígitos con prefijo internacional (p. ej. 34600111222); vacío = elegir chat. */
export function whatsAppUrl(phone: string | null, text: string, mode: WhatsAppMode) {
  // encodeURIComponent (espacios como %20, no "+"), que es el formato que documenta
  // WhatsApp para sus enlaces.
  const query = [phone ? `phone=${encodeURIComponent(phone)}` : null, `text=${encodeURIComponent(text)}`]
    .filter(Boolean)
    .join("&");
  return mode === "app"
    ? `whatsapp://send?${query}`
    : `https://web.whatsapp.com/send?${query}`;
}

/**
 * Abre WhatsApp con el mensaje. Debe llamarse directamente desde el clic (si no,
 * el navegador puede bloquear la ventana). Devuelve el modo usado.
 */
export function openWhatsApp(phone: string | null, text: string): WhatsAppMode {
  const mode = effectiveWhatsAppMode();
  const url = whatsAppUrl(phone, text, mode);
  if (mode === "app") {
    // El protocolo lo atiende la aplicación; la página actual no navega.
    window.location.href = url;
  } else {
    const win = window.open(url, WINDOW_NAME);
    win?.focus();
  }
  return mode;
}
