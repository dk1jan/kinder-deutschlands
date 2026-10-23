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

# osmium-tool (BSL-1.0/GPL-3.0) für den Deutschland-Auszug (F-022) – nicht als Alpine-Paket verfügbar, daher aus dem
# Quellcode gebaut; Stände fest über Git-Commit geprüft (21.10.2026: osmium-tool v1.19.1, libosmium v2.23.1, protozero v1.8.2).
FROM node:24-alpine AS osmium
ARG OSMIUM_TOOL=v1.19.1 OSMIUM_TOOL_SHA=18ac055a71ffebefb3b7407c0d324e2532770a79
ARG LIBOSMIUM=v2.23.1 LIBOSMIUM_SHA=97dccf105391d410701ae8bd52170dc0ee041373
ARG PROTOZERO=v1.8.2 PROTOZERO_SHA=af2f6e274e0a873a00e34d8c9ab99fca76898047
RUN apk add --no-cache git build-base cmake boost-dev expat-dev bzip2-dev zlib-dev lz4-dev nlohmann-json \
	&& cd /tmp \
	&& for r in "osmcode/osmium-tool $OSMIUM_TOOL $OSMIUM_TOOL_SHA" "osmcode/libosmium $LIBOSMIUM $LIBOSMIUM_SHA" "mapbox/protozero $PROTOZERO $PROTOZERO_SHA"; do \
		set -- $r; git clone -q --depth 1 --branch "$2" "https://github.com/$1" "$(basename $1)" \
		&& test "$(git -C "$(basename $1)" rev-parse HEAD)" = "$3" || { echo "Commit von $1 passt nicht"; exit 1; }; done \
	&& cmake -S osmium-tool -B build -DCMAKE_BUILD_TYPE=Release -DOSMIUM_INCLUDE_DIR=/tmp/libosmium/include -DPROTOZERO_INCLUDE_DIR=/tmp/protozero/include -DBUILD_TESTING=OFF \
	&& cmake --build build -j"$(nproc)" --target osmium \
	&& strip build/src/osmium && build/src/osmium --version

FROM node:24-alpine
# pg_dump passend zur Datenbank (PostgreSQL 17) für die Sicherung vor Migrationen; tini für sauberes Beenden
RUN apk add --no-cache postgresql17-client tini tzdata boost-program_options expat libbz2 zlib lz4-libs && mkdir -p /backups /data/tiles /data/media /synapse-config && chown node:node /backups /data/tiles /data/media /synapse-config
# pmtiles (go-pmtiles, BSD-3) schneidet den Kartenausschnitt aus dem Protomaps-Build.
# Das Release hat keine Prüfsummendatei – die Prüfsumme des Archivs ist hier fest hinterlegt (geprüft 18.10.2026).
ARG PMTILES_VERSION=1.31.2
ARG PMTILES_SHA256=3ed7dbf4ec2e6dfe5e25b6f70d1ffc932729f93c86db353bf514dd71010a312f
RUN cd /tmp && f="go-pmtiles_${PMTILES_VERSION}_Linux_x86_64.tar.gz" \
	&& wget -q "https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSION}/$f" \
	&& echo "${PMTILES_SHA256}  $f" | sha256sum -c - \
	&& tar xzf "$f" -C /usr/local/bin pmtiles && rm -f "$f" && pmtiles version
COPY --from=osmium /tmp/build/src/osmium /usr/local/bin/osmium
RUN osmium --version
ENV NODE_ENV=production PORT=3000 TZ=Europe/Berlin TILES_DIR=/data/tiles MEDIA_DIR=/data/media
WORKDIR /app
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/scripts/migrate.mjs /app/scripts/synapse-prepare.mjs /app/scripts/server.mjs /app/scripts/overture-read.mjs /app/scripts/kd_rules.py ./scripts/
COPY --from=build /app/migrations ./migrations
ARG GIT_SHA=unbekannt
ENV GIT_SHA=$GIT_SHA
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "node scripts/migrate.mjs && exec node scripts/server.mjs"]
