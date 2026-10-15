# Finband — Gestión Escuela de Música

Aplicación web local para gestionar alumnos, profesores, clases, tarifas, pagos, ingresos y gastos de una escuela de música.

## Arranque con Docker (recomendado)

```bash
docker compose up -d --build
```

Abrir [http://localhost:8080](http://localhost:8080)

**Primer arranque**

- Si no se define `ADMIN_PASSWORD`, se crea el usuario `admin` con una **contraseña aleatoria** que se muestra una sola vez en los logs (`docker compose logs finband`). Cámbiela desde *Ajustes › Usuarios*.
- Si no se define `JWT_SECRET`, se genera uno y se guarda en `./data/.jwt-secret`.
- Los datos de demostración (y el usuario `consulta`/`consulta123`, solo lectura) se cargan únicamente con `SEED_MOCK=true`.

Variables opcionales en `.env` o entorno:

| Variable | Uso |
|---|---|
| `JWT_SECRET` | Secreto de sesión (mín. 32 caracteres en producción; `openssl rand -hex 32`). |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Administrador inicial (solo se usa al crear la base). |
| `SEED_MOCK` | `true` para cargar datos de demostración en una base nueva. |
| `COOKIE_SECURE` | `true` si la aplicación se sirve detrás de HTTPS. |
| `APP_TZ` | Zona horaria de la escuela para meses y días (por defecto `Europe/Madrid`). |

Las sesiones duran 12 horas y se cierran al cambiar la contraseña del usuario. El acceso se bloquea 15 minutos tras 10 intentos desde la misma IP.

La base SQLite se guarda en `./data/finband.db` (hacer copia de seguridad de la carpeta `data/`). Desde *Ajustes* se puede descargar y restaurar una copia; al restaurar se guarda la base anterior como `finband.db.pre-restore-*.bak` y se aplican las migraciones pendientes.

## Desarrollo local

```bash
cp .env.example .env   # o usar .env incluido
npm install
npm run build -w @finband/shared
npx prisma migrate dev --name init
npm run db:seed
npm run dev
```

En desarrollo el administrador es `admin`/`admin123` salvo que se defina `ADMIN_PASSWORD`. El seed incluye **datos mock** (alumnos, profesores, clases, cuotas, ingresos/gastos) para probar el dashboard. Para omitirlos: `SEED_MOCK=false npm run db:seed`.

- Frontend: [http://localhost:5173](http://localhost:5173)
- API: [http://localhost:3000](http://localhost:3000)

## Calidad

```bash
npm test           # tests de la API (Vitest, base SQLite temporal por fichero)
npm run lint       # oxlint (web y API)
npm run typecheck  # TypeScript de API y web
```

GitHub Actions ejecuta tipos, lint, tests y build en cada push a `main`/`dev` y en cada PR.

## Manual de usuario (PDF)

```bash
npm run manual:pdf
```

Genera `docs/Finband-manual-de-uso.pdf` (guía por menús y control financiero para usuarios de la escuela).

## Stack

React · Vite · TypeScript · Tailwind · Fastify · Prisma · SQLite
