#!/usr/bin/env bash
# Notfall-Update: Portainer sofort neu ausrollen lassen (statt auf die automatische Abfrage zu warten).
# Normalfall: NICHT nötig – Portainer prüft den Branch „deploy“ alle 5 Minuten selbst.
#
# Einmalig einrichten (als root):
#   mkdir -p /opt/kinder-deutschlands
#   curl -fsSL https://raw.githubusercontent.com/dk1jan/kinder-deutschlands/main/deploy/update.sh -o /opt/kinder-deutschlands/update.sh
#   chmod 700 /opt/kinder-deutschlands/update.sh
#   printf 'PORTAINER_TOKEN=%s\n' 'HIER_ACCESS_TOKEN' > /opt/kinder-deutschlands/portainer.env
#   chmod 600 /opt/kinder-deutschlands/portainer.env
# (Access-Token: Portainer → Benutzer oben rechts → My account → Access tokens → Add access token)
#
# Aufruf: bash /opt/kinder-deutschlands/update.sh
set -euo pipefail

CONF=/opt/kinder-deutschlands/portainer.env
PORTAINER_URL="http://127.0.0.1:9000"
STACK_NAME="kinder-deutschlands"
[ -f "$CONF" ] && . "$CONF"
: "${PORTAINER_TOKEN:?PORTAINER_TOKEN fehlt in $CONF}"

api() { curl -fsS -H "X-API-Key: ${PORTAINER_TOKEN}" "$@"; }

echo "→ Suche Stack „${STACK_NAME}“ in Portainer …"
STACKS=$(api "${PORTAINER_URL}/api/stacks")
read -r STACK_ID ENDPOINT_ID < <(python3 -c '
import json,sys
name=sys.argv[1]
for s in json.load(sys.stdin):
    if s.get("Name")==name:
        print(s["Id"], s["EndpointId"]); break
else:
    sys.exit("Stack nicht gefunden")
' "$STACK_NAME" <<<"$STACKS")

# Vorhandene Stack-Umgebungsvariablen unverändert mitschicken (sonst würden sie geleert)
BODY=$(python3 -c '
import json,sys
name=sys.argv[1]
s=[x for x in json.load(sys.stdin) if x.get("Name")==name][0]
print(json.dumps({"env": s.get("Env") or [], "prune": False, "pullImage": True}))
' "$STACK_NAME" <<<"$STACKS")

echo "→ Hole Branch „deploy“ und rolle neu aus (Stack ${STACK_ID}) …"
api -X PUT -H "Content-Type: application/json" \
	"${PORTAINER_URL}/api/stacks/${STACK_ID}/git/redeploy?endpointId=${ENDPOINT_ID}" -d "$BODY" >/dev/null

echo "→ Warte auf gesunden Start …"
for i in $(seq 1 60); do
	if curl -fsS http://127.0.0.1:3120/readyz >/dev/null 2>&1; then
		echo "✔ Kinder Deutschlands läuft ($(date '+%H:%M:%S'))."
		exit 0
	fi
	sleep 5
done
echo "✖ Nach 5 Minuten nicht bereit. Logs: docker logs --tail 100 kinder-deutschlands-web-1"
exit 1
