#!/bin/sh
set -e
mkdir -p /app/data
export DATABASE_URL="${DATABASE_URL:-file:/app/data/finband.db}"

if [ ! -f /app/data/finband.db ]; then
  echo "Inicializando base de datos…"
  npx prisma migrate deploy
  SEED_MOCK="${SEED_MOCK:-true}" npx tsx prisma/seed.ts
else
  npx prisma migrate deploy
fi

exec node apps/api/dist/index.js
