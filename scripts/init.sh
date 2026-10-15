#!/bin/sh
set -e
mkdir -p /app/data
export DATABASE_URL="${DATABASE_URL:-file:/app/data/finband.db}"

# Si no se define un JWT_SECRET propio, se genera uno y se guarda junto a la base
# para que las sesiones sobrevivan a los reinicios del contenedor.
SECRET_FILE=/app/data/.jwt-secret
case "${JWT_SECRET:-}" in
  ""|dev-secret-change-me|change-me-in-production)
    if [ ! -s "$SECRET_FILE" ]; then
      echo "Generando JWT_SECRET en $SECRET_FILE…"
      (umask 077 && node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" > "$SECRET_FILE")
    fi
    JWT_SECRET="$(cat "$SECRET_FILE")"
    export JWT_SECRET
    ;;
esac

if [ ! -f /app/data/finband.db ]; then
  echo "Inicializando base de datos…"
  npx prisma migrate deploy
  SEED_MOCK="${SEED_MOCK:-false}" npx tsx prisma/seed.ts
else
  npx prisma migrate deploy
fi

exec node apps/api/dist/index.js
