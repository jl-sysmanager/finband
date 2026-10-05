FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY prisma ./prisma/
RUN npm ci || npm install

FROM deps AS build
COPY . .
RUN npm run build -w @finband/shared
RUN npm run build -w @finband/web
RUN npm run build -w @finband/api
RUN npx prisma generate

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV SERVE_WEB=true
ENV WEB_DIST=/app/web-dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/apps/web/dist ./web-dist
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY scripts/init.sh ./scripts/init.sh
RUN chmod +x ./scripts/init.sh
EXPOSE 8080
CMD ["./scripts/init.sh"]
