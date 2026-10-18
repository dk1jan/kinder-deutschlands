# Kinder Deutschlands – Web (SvelteKit, Node). Mehrstufig, ohne Entwicklungsabhängigkeiten im Laufzeit-Image.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine
# pg_dump passend zur Datenbank (PostgreSQL 17) für die Sicherung vor Migrationen; tini für sauberes Beenden
RUN apk add --no-cache postgresql17-client tini tzdata && mkdir /backups && chown node:node /backups
ENV NODE_ENV=production PORT=3000 TZ=Europe/Berlin
WORKDIR /app
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=build /app/migrations ./migrations
ARG GIT_SHA=unbekannt
ENV GIT_SHA=$GIT_SHA
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "node scripts/migrate.mjs && exec node build"]
