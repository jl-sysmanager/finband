# Finband — Gestión Escuela de Música

Aplicación web local para gestionar alumnos, profesores, clases, tarifas, pagos, ingresos y gastos de una escuela de música.

## Arranque con Docker (recomendado)

```bash
docker compose up -d --build
```

Abrir [http://localhost:8080](http://localhost:8080)

**Credenciales por defecto**

| Usuario   | Contraseña   | Perfil        |
|-----------|--------------|---------------|
| admin     | admin123     | Administrador |
| consulta  | consulta123  | Solo lectura  |

Variables opcionales en `.env` o entorno: `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`.

La base SQLite se guarda en `./data/finband.db` (hacer copia de seguridad de la carpeta `data/`).

## Desarrollo local

```bash
cp .env.example .env   # o usar .env incluido
npm install
npm run build -w @finband/shared
npx prisma migrate dev --name init
npm run db:seed
npm run dev
```

- Frontend: [http://localhost:5173](http://localhost:5173)
- API: [http://localhost:3000](http://localhost:3000)

## Stack

React · Vite · TypeScript · Tailwind · Fastify · Prisma · SQLite
