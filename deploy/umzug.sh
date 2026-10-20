#!/usr/bin/env bash
# Umzug auf einen anderen Server (F-014). Zwei Schritte, beide als root:
#
#   Alter Server:  bash umzug.sh export            → /root/kd-umzug-<Datum>.tar (enthält Geheimnisse – nur per scp kopieren!)
#                  scp /root/kd-umzug-<Datum>.tar root@NEUER-SERVER:/root/
#   Neuer Server:  bash umzug.sh import /root/kd-umzug-<Datum>.tar
#
# Was mitgeht: Datenbank (kd), Chat-Datenbank (synapse), Bilder (media), Chat-Medien (synapse-data),
# Geheimnisse (APP_SECRET, POSTGRES_PASSWORD, SMTP-Rückfallwerte, TURN-Einstellungen). APP_SECRET bleibt gleich –
# sonst wären verschlüsselte Einstellungen, Chat-Konten und Sitzungen ungültig.
# Nicht mitgeht (wird neu geholt/erzeugt): Kartenkacheln (Verwaltung → Daten → Kartenhintergrund „Jetzt abrufen“),
# Chat-Konfiguration (schreibt die App beim Start), tägliche Sicherungen (neue entstehen ab dem ersten Tag).
# Danach: DNS der Domain auf den neuen Server, Plesk-Subdomain + nginx-Block (plesk-nginx.conf), TLS,
# TURN-Ports 3479 UDP/TCP und 49160–49200 UDP sowie 49210 UDP/TCP (Gruppenanrufe) freigeben (DEPLOYMENT.md). Alter Server: Stack erst stoppen,
# wenn der neue läuft.
set -euo pipefail

STACK="${KD_STACK:-kinder-deutschlands}"
OUTDIR="${KD_UMZUG_DIR:-/root}"
IMG=postgis/postgis:17-3.6-alpine
KEYS="APP_URL APP_SECRET POSTGRES_PASSWORD ALLOW_INDEXING SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASSWORD SMTP_FROM SMTP_INSECURE_TLS TURN_ENABLED TURN_HOST TURN_EXTERNAL_IP LIVEKIT_ENABLED LIVEKIT_NODE_IP LIVEKIT_MAX_PARTICIPANTS"
PORTAINER_URL="${PORTAINER_URL:-http://127.0.0.1:9000}"
CONF=/opt/kinder-deutschlands/portainer.env

die() { echo "✖ $*" >&2; exit 1; }
need() { docker ps --format '{{.Names}}' | grep -qx "$1" || die "Container $1 läuft nicht."; }

vol_out() { # Volume → tar.gz im Arbeitsordner
	docker run --rm -v "${STACK}_$1:/v:ro" -v "$2:/o" "$IMG" sh -c "tar czf /o/$1.tar.gz -C /v ."
}
vol_in() { # tar.gz → Volume (Inhalt wird ersetzt)
	docker volume create "${STACK}_$1" >/dev/null
	docker run --rm -v "${STACK}_$1:/v" -v "$2:/o:ro" "$IMG" sh -c "find /v -mindepth 1 -delete; tar xzf /o/$1.tar.gz -C /v"
}

export_all() {
	need "${STACK}-db-1"; need "${STACK}-web-1"
	local day dir out
	day=$(date +%Y%m%d-%H%M); dir=$(mktemp -d "$OUTDIR/kd-umzug-XXXX"); out="$OUTDIR/kd-umzug-${day}.tar"
	chmod 700 "$dir"
	echo "→ Geheimnisse aus dem laufenden Stack lesen"
	docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "${STACK}-web-1" | while IFS= read -r line; do
		k="${line%%=*}"; for want in $KEYS; do [ "$k" = "$want" ] && printf '%s\n' "$line"; done
	done > "$dir/stack.env"
	chmod 600 "$dir/stack.env"
	grep -q '^APP_SECRET=' "$dir/stack.env" || die "APP_SECRET nicht gefunden."
	echo "→ Datenbanken sichern (läuft im Betrieb, konsistenter Stand je Datenbank)"
	docker exec "${STACK}-db-1" pg_dump -U kd -d kd -Fc > "$dir/kd.dump"
	if docker exec "${STACK}-db-1" psql -U kd -d kd -tAc "select 1 from pg_database where datname = 'synapse'" | grep -q 1; then
		docker exec "${STACK}-db-1" pg_dump -U kd -d synapse -Fc > "$dir/synapse.dump"
	fi
	echo "→ Bilder und Chat-Medien packen"
	vol_out media "$dir"
	vol_out synapse-data "$dir"
	date -Is > "$dir/erstellt"
	tar cf "$out" -C "$dir" .
	chmod 600 "$out"; rm -rf "$dir"
	echo "✔ Fertig: $out ($(du -h "$out" | cut -f1))"
	echo "  Enthält APP_SECRET und Passwörter. Nur per scp kopieren, danach auf beiden Servern löschen:"
	echo "  scp $out root@NEUER-SERVER:/root/"
}

portainer_api() { curl -fsS -H "X-API-Key: ${PORTAINER_TOKEN}" "$@"; }

create_stack() { # Stack per Portainer-API aus Git anlegen (wie in DEPLOYMENT.md, Schritt 4)
	local env_json ep
	env_json=$(python3 -c 'import json,sys; print(json.dumps([{"name": l.split("=",1)[0], "value": l.split("=",1)[1]} for l in open(sys.argv[1]).read().splitlines() if "=" in l]))' "$1")
	ep=$(portainer_api "$PORTAINER_URL/api/endpoints" | python3 -c 'import json,sys; e=json.load(sys.stdin); print(e[0]["Id"])')
	portainer_api -X POST -H 'Content-Type: application/json' "$PORTAINER_URL/api/stacks/create/standalone/repository?endpointId=$ep" -d "$(python3 -c '
import json,sys
print(json.dumps({"name": sys.argv[1], "repositoryURL": "https://github.com/dk1jan/kinder-deutschlands", "repositoryReferenceName": "refs/heads/deploy",
  "composeFile": "docker-compose.yml", "env": json.loads(sys.argv[2]), "autoUpdate": {"interval": "5m"}}))' "$STACK" "$env_json")" >/dev/null
}

wait_for() { # Container läuft und ist gesund (bzw. läuft, wenn ohne Gesundheitsprüfung)
	for _ in $(seq 1 120); do
		s=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$1" 2>/dev/null || true)
		[ "$s" = healthy ] || [ "$s" = running ] && return 0
		sleep 5
	done
	die "$1 startet nicht."
}

import_all() {
	local file="$1" dir
	[ -f "$file" ] || die "Datei $file fehlt."
	dir=$(mktemp -d "$OUTDIR/kd-umzug-restore-XXXX"); chmod 700 "$dir"
	tar xf "$file" -C "$dir"
	[ -f "$dir/stack.env" ] && [ -f "$dir/kd.dump" ] || die "Das ist keine Umzugsdatei."
	if ! docker ps -a --format '{{.Names}}' | grep -qx "${STACK}-db-1"; then
		if [ -f "$CONF" ]; then
			. "$CONF"
			echo "→ Stack „$STACK“ per Portainer-API aus Git anlegen"
			create_stack "$dir/stack.env" || die "Anlegen per API fehlgeschlagen – bitte in Portainer anlegen (DEPLOYMENT.md, Schritt 4) und dieses Skript erneut starten. Werte: $dir/stack.env"
		else
			echo "✖ Kein Stack und kein Portainer-Token ($CONF)."
			echo "  Entweder Token anlegen (Kopf von update.sh) und neu starten – oder Stack in Portainer anlegen (DEPLOYMENT.md, Schritt 4)."
			echo "  Umgebungsvariablen dafür stehen in: $dir/stack.env  (danach löschen!)"
			exit 1
		fi
	fi
	echo "→ Warte auf Datenbank"
	wait_for "${STACK}-db-1"
	echo "→ App, Chat, TURN, Gruppenanrufe und Sicherung anhalten"
	for c in web synapse turn livekit backup; do docker stop "${STACK}-$c-1" >/dev/null 2>&1 || true; done
	echo "→ Datenbank zurückspielen"
	docker exec -i "${STACK}-db-1" pg_restore -U kd -d kd --clean --if-exists --no-owner < "$dir/kd.dump"
	if [ -f "$dir/synapse.dump" ]; then
		docker exec "${STACK}-db-1" psql -U kd -d kd -tAc "select 1 from pg_database where datname = 'synapse'" | grep -q 1 \
			|| docker exec "${STACK}-db-1" createdb -U kd -T template0 -E UTF8 --locale=C synapse
		docker exec -i "${STACK}-db-1" pg_restore -U kd -d synapse --clean --if-exists --no-owner < "$dir/synapse.dump"
	fi
	echo "→ Bilder und Chat-Medien zurückspielen"
	vol_in media "$dir"
	vol_in synapse-data "$dir"
	echo "→ Starten"
	for c in web synapse turn livekit backup; do docker start "${STACK}-$c-1" >/dev/null 2>&1 || true; done
	wait_for "${STACK}-web-1"
	rm -rf "$dir"
	echo "✔ Umzug fertig. Jetzt: DNS umstellen, Plesk-Subdomain + nginx-Block, TLS, Ports für Anrufe (DEPLOYMENT.md → Umzug)."
	echo "  Kartenhintergrund: Verwaltung → Daten → Kartenhintergrund → „Jetzt abrufen“."
	echo "  Umzugsdatei löschen: rm -f $file"
}

case "${1:-}" in
	export) export_all ;;
	import) import_all "${2:-}" ;;
	*) echo "Aufruf: bash umzug.sh export | bash umzug.sh import /root/kd-umzug-<Datum>.tar"; exit 1 ;;
esac
