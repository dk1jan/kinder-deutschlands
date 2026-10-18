# Kinder Deutschlands – Web (SvelteKit, Node). Mehrstufig, ohne Entwicklungsabhängigkeiten im Laufzeit-Image.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Kartenschriften und -symbole (Protomaps basemaps-assets, OFL/CC0) – fest auf einen Stand gepinnt, nur die genutzten Schriften
ARG BASEMAPS_ASSETS=028c18f713baecad011301ff7a69acc39bcc2ae7
RUN wget -qO /tmp/assets.tgz "https://codeload.github.com/protomaps/basemaps-assets/tar.gz/${BASEMAPS_ASSETS}" \
	&& mkdir -p /tmp/assets static/karte-assets/fonts static/karte-assets/sprites \
	&& tar xzf /tmp/assets.tgz -C /tmp/assets --strip-components=1 \
	&& cp -r "/tmp/assets/fonts/Noto Sans Regular" "/tmp/assets/fonts/Noto Sans Medium" "/tmp/assets/fonts/Noto Sans Italic" /tmp/assets/fonts/OFL.txt static/karte-assets/fonts/ \
	&& cp -r /tmp/assets/sprites/v4 static/karte-assets/sprites/ \
	&& rm -rf /tmp/assets /tmp/assets.tgz
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine
# pg_dump passend zur Datenbank (PostgreSQL 17) für die Sicherung vor Migrationen; tini für sauberes Beenden
RUN apk add --no-cache postgresql17-client tini tzdata && mkdir -p /backups /data/tiles /data/media && chown node:node /backups /data/tiles /data/media
# pmtiles (go-pmtiles, BSD-3) schneidet den Kartenausschnitt aus dem Protomaps-Build.
# Das Release hat keine Prüfsummendatei – die Prüfsumme des Archivs ist hier fest hinterlegt (geprüft 18.10.2026).
ARG PMTILES_VERSION=1.31.2
ARG PMTILES_SHA256=3ed7dbf4ec2e6dfe5e25b6f70d1ffc932729f93c86db353bf514dd71010a312f
RUN cd /tmp && f="go-pmtiles_${PMTILES_VERSION}_Linux_x86_64.tar.gz" \
	&& wget -q "https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSION}/$f" \
	&& echo "${PMTILES_SHA256}  $f" | sha256sum -c - \
	&& tar xzf "$f" -C /usr/local/bin pmtiles && rm -f "$f" && pmtiles version
ENV NODE_ENV=production PORT=3000 TZ=Europe/Berlin TILES_DIR=/data/tiles MEDIA_DIR=/data/media
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
