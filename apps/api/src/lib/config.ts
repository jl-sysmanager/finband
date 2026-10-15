const isProduction = process.env.NODE_ENV === "production";

/** Secretos de ejemplo publicados en el repositorio: nunca válidos en producción. */
const KNOWN_DEFAULT_SECRETS = new Set([
  "dev-secret-change-me",
  "change-me-in-production",
]);

const MIN_SECRET_LENGTH = 32;

function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!isProduction) return secret || "dev-secret-change-me";

  if (!secret || KNOWN_DEFAULT_SECRETS.has(secret) || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET debe definirse en producción con al menos ${MIN_SECRET_LENGTH} caracteres ` +
        "y no puede ser un valor de ejemplo (genere uno con: openssl rand -hex 32)",
    );
  }
  return secret;
}

function resolveCookieSecure(): boolean {
  const raw = process.env.COOKIE_SECURE?.toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;
  return isProduction;
}

export const config = {
  isProduction,
  jwtSecret: resolveJwtSecret(),
  /** Duración de la sesión (cookie y JWT). */
  sessionMaxAgeSeconds: 60 * 60 * 12,
  /** Desactivar con COOKIE_SECURE=false si se accede por HTTP desde la red local. */
  cookieSecure: resolveCookieSecure(),
};
