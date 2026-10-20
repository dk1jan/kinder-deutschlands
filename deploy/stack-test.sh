#!/bin/sh
# Stack-Test: startet den echten Stack (frisch gebautes Web-Image, Synapse-Image, PostGIS) wie auf dem Server
# und prüft das Zusammenspiel. Läuft in GitHub Actions vor dem Ausrollen. Aufruf: deploy/stack-test.sh <web-image>
set -eu
IMG="$1"
ROOT=$(pwd)
DIR=$(mktemp -d)
sed "s#__WEB_IMAGE__#${IMG}#" "$ROOT/deploy/docker-compose.yml" > "$DIR/docker-compose.yml"
{
	echo "APP_URL=http://127.0.0.1:3120"
	echo "APP_SECRET=$(openssl rand -hex 32)"
	echo "POSTGRES_PASSWORD=$(openssl rand -hex 16)"
} > "$DIR/.env"
cd "$DIR"
dc() { docker compose -p kdstack "$@"; }
fail() {
	echo "::error::Stack-Test: $1"
	dc ps || true
	dc logs --tail 80 web synapse livekit || true
	dc down -v --remove-orphans >/dev/null 2>&1 || true
	exit 1
}

dc up -d
echo "Warte auf Web und Chat-Server …"
for i in $(seq 1 100); do
	w=$(docker inspect -f '{{.State.Health.Status}}' kdstack-web-1 2>/dev/null || echo none)
	s=$(docker inspect -f '{{.State.Health.Status}}' kdstack-synapse-1 2>/dev/null || echo none)
	[ "$w" = healthy ] && [ "$s" = healthy ] && break
	sleep 4
done
[ "$w" = healthy ] || fail "Web nicht gesund ($w)"
[ "$s" = healthy ] || fail "Synapse nicht gesund ($s)"
echo "OK  Web und Synapse gesund"

curl -fsS http://127.0.0.1:3120/healthz >/dev/null || fail "/healthz"
curl -fsS http://127.0.0.1:3120/_matrix/client/versions | grep -q '"versions"' || fail "Chat-Server über die App nicht erreichbar"
echo "OK  /_matrix/client über die App"
flows=$(curl -fsS http://127.0.0.1:3120/_matrix/client/v3/login)
echo "$flows" | grep -q 'org.matrix.login.jwt' || fail "JWT-Anmeldung fehlt ($flows)"
echo "$flows" | grep -q 'de.kinder.reauth' || fail "Regelmodul nicht geladen ($flows)"
echo "$flows" | grep -q 'm.login.password' && fail "Passwort-Anmeldung ist aktiv"
echo "OK  Anmeldearten: nur Token der App, Regelmodul geladen"
# Nie an Synapse weitergereicht: vor der Ersteinrichtung leitet die App auf /setup um (303), danach 404
body=$(curl -s -w ' HTTP%{http_code}' http://127.0.0.1:3120/_synapse/admin/v1/server_version)
echo "$body" | grep -q 'server_version' && fail "Admin-Schnittstelle von außen erreichbar"
echo "$body" | grep -qE 'HTTP(303|404)$' || fail "Unerwartete Antwort der Admin-Schnittstelle ($body)"
echo "OK  Admin-Schnittstelle von außen gesperrt"

# Testkonto direkt anlegen und echten Ablauf im internen Netz prüfen: JWT-Anmeldung → Raum → Senden (Regelprüfung über die App)
dc exec -T db psql -U kd -d kd -v ON_ERROR_STOP=1 -q -c "with u as (insert into users (email, password_hash, email_verified_at) values ('stack@example.org', '!', now()) returning id) insert into chat_accounts (user_id, localpart) select id, 'kstacktest234567' from u" || fail "Testkonto"
dc exec -T web node -e '
const { hkdfSync, createHmac } = require("crypto");
const sec = (k) => Buffer.from(hkdfSync("sha256", process.env.APP_SECRET, "kinder-deutschlands", "chat:" + k, 32)).toString("base64url");
const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const h = b({ alg: "HS256", typ: "JWT" }), p = b({ sub: "kstacktest234567", iss: "kinder-deutschlands", exp: Math.floor(Date.now() / 1000) + 60 });
const t = h + "." + p + "." + createHmac("sha256", sec("jwt")).update(h + "." + p).digest("base64url");
(async () => {
	const S = process.env.SYNAPSE_URL;
	const j = await (await fetch(S + "/_matrix/client/v3/login", { method: "POST", body: JSON.stringify({ type: "org.matrix.login.jwt", token: t }) })).json();
	if (!j.access_token) { console.error("Login", j); process.exit(1); }
	const H = { authorization: "Bearer " + j.access_token, "content-type": "application/json" };
	const room = await (await fetch(S + "/_matrix/client/v3/createRoom", { method: "POST", headers: H, body: "{}" })).json();
	const enc = await (await fetch(S + "/_matrix/client/v3/rooms/" + encodeURIComponent(room.room_id) + "/state/m.room.encryption", { headers: H })).json();
	if (enc.algorithm !== "m.megolm.v1.aes-sha2") { console.error("nicht verschlüsselt", enc); process.exit(1); }
	const send = await fetch(S + "/_matrix/client/v3/rooms/" + encodeURIComponent(room.room_id) + "/send/m.room.message/1", { method: "PUT", headers: H, body: JSON.stringify({ msgtype: "m.text", body: "Stacktest" }) });
	if (send.status !== 200) { console.error("Senden", send.status, await send.text()); process.exit(1); }
	const inv = await fetch(S + "/_matrix/client/v3/rooms/" + encodeURIComponent(room.room_id) + "/invite", { method: "POST", headers: H, body: JSON.stringify({ user_id: "@kfremdfremdfremd:kinder-deutschlands" }) });
	if (inv.status !== 403) { console.error("Einladung nicht abgelehnt", inv.status); process.exit(1); }
	console.log("OK  JWT-Anmeldung, Raum verschlüsselt, Senden erlaubt (Regelmodul ↔ App), fremde Einladung abgelehnt");
})().catch((e) => { console.error(e); process.exit(1); });
' || fail "Chat-Ablauf im Stack"

# Anrufe: TURN-Server läuft mit der Konfiguration der App, Synapse gibt kurzlebige Zugangsdaten aus
for i in $(seq 1 15); do
	t=$(docker inspect -f '{{.State.Running}}' kdstack-turn-1 2>/dev/null || echo false)
	[ "$t" = true ] && dc logs turn 2>&1 | grep -qv "warte auf Konfiguration" && break
	sleep 4
done
[ "$t" = true ] || fail "TURN-Server läuft nicht"
sleep 5
docker inspect -f '{{.State.Running}}' kdstack-turn-1 | grep -q true || fail "TURN-Server beendet sich"
dc logs turn 2>&1 | grep -qE "ERROR:" && { dc logs --tail 40 turn; fail "Fehler im TURN-Log"; }
dc exec -T web sh -c 'grep -q "^listening-port=3479" /synapse-config/turnserver.conf && grep -q "^use-auth-secret" /synapse-config/turnserver.conf' || fail "TURN-Konfiguration fehlt"
dc exec -T web node -e '
const { hkdfSync, createHmac } = require("crypto");
const sec = (k) => Buffer.from(hkdfSync("sha256", process.env.APP_SECRET, "kinder-deutschlands", "chat:" + k, 32)).toString("base64url");
const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const h = b({ alg: "HS256", typ: "JWT" }), p = b({ sub: "kstacktest234567", iss: "kinder-deutschlands", exp: Math.floor(Date.now() / 1000) + 60 });
const t = h + "." + p + "." + createHmac("sha256", sec("jwt")).update(h + "." + p).digest("base64url");
(async () => {
	const S = process.env.SYNAPSE_URL;
	const j = await (await fetch(S + "/_matrix/client/v3/login", { method: "POST", body: JSON.stringify({ type: "org.matrix.login.jwt", token: t }) })).json();
	const r = await (await fetch(S + "/_matrix/client/v3/voip/turnServer", { headers: { authorization: "Bearer " + j.access_token } })).json();
	if (!r.uris || !r.uris.some((u) => u.includes(":3479")) || !r.username || !r.password) { console.error("TURN", r); process.exit(1); }
	console.log("OK  TURN-Zugangsdaten vom Chat-Server (" + r.uris.length + " Adressen, gültig " + r.ttl + " s)");
})().catch((e) => { console.error(e); process.exit(1); });
' || fail "TURN-Zugangsdaten"
echo "OK  TURN-Server läuft"

# Volumes für die App beschreibbar (Dienst „init“), sonst scheitern Bild-Uploads und Sicherungen vor Migrationen
dc exec -T web sh -c 'test -w /data/media && test -w /backups' || fail "Volumes media/backups für die App nicht beschreibbar"
echo "OK  Volumes media und backups beschreibbar"

# Gruppenanrufe (D-072): LiveKit läuft mit der Konfiguration der App, Signalweg nur über /livekit/rtc der App
for i in $(seq 1 30); do
	l=$(docker inspect -f '{{.State.Health.Status}}' kdstack-livekit-1 2>/dev/null || echo none)
	[ "$l" = healthy ] && break
	sleep 4
done
[ "$l" = healthy ] || { dc logs --tail 40 livekit; fail "LiveKit nicht gesund ($l)"; }
dc exec -T web sh -c 'grep -q "udp_port: 49210" /synapse-config/livekit.yaml && grep -q "auto_create: false" /synapse-config/livekit.yaml' || fail "LiveKit-Konfiguration fehlt"
lkout=$(dc exec -T web node -e '
const { hkdfSync, createHmac } = require("crypto");
const sec = Buffer.from(hkdfSync("sha256", process.env.APP_SECRET, "kinder-deutschlands", "chat:livekit", 32)).toString("base64url");
const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (c) => { const n = Math.floor(Date.now() / 1000), h = b({ alg: "HS256", typ: "JWT" }), p = b({ iss: "kd-app", nbf: n - 5, exp: n + 60, ...c }); return h + "." + p + "." + createHmac("sha256", sec).update(h + "." + p).digest("base64url"); };
(async () => {
	const L = process.env.LIVEKIT_URL;
	const cr = await fetch(L + "/twirp/livekit.RoomService/CreateRoom", { method: "POST", headers: { authorization: "Bearer " + jwt({ video: { roomCreate: true } }), "content-type": "application/json" }, body: JSON.stringify({ name: "kd-stacktest", metadata: "x" }) });
	if (cr.status !== 200) { console.error("CreateRoom", cr.status, await cr.text()); process.exit(1); }
	const t = jwt({ sub: "@kstacktest234567:kinder-deutschlands|STACK", video: { room: "kd-stacktest", roomJoin: true } });
	const v = await fetch("http://127.0.0.1:3000/livekit/rtc/validate?access_token=" + t);
	if (v.status !== 200) { console.error("validate über die App", v.status, await v.text()); process.exit(1); }
	const bad = await fetch("http://127.0.0.1:3000/livekit/rtc/validate?access_token=" + t.slice(0, -4) + "AAAA");
	if (bad.status === 200) { console.error("falsches Token angenommen"); process.exit(1); }
	const tw = await fetch("http://127.0.0.1:3000/livekit/twirp/livekit.RoomService/ListRooms", { method: "POST", redirect: "manual" });
	// vor der Ersteinrichtung leitet die App alles auf /setup um (303), danach 404 – nie die LiveKit-Verwaltung
	if (tw.status !== 404 && tw.status !== 303) { console.error("Verwaltung von außen erreichbar", tw.status); process.exit(1); }
	console.log("OK  LiveKit: Raum nur über die App, Token geprüft, Signalweg /livekit/rtc über die App, Verwaltung nicht erreichbar");
})().catch((e) => { console.error(String(e)); process.exit(1); });
' 2>&1) || fail "Gruppenanrufe (LiveKit): $(echo "$lkout" | tr '\n' ' ' | cut -c1-300)"
echo "$lkout"
docker port kdstack-livekit-1 | grep -q "49210/udp" || fail "LiveKit-Port 49210/udp nicht veröffentlicht"
echo "OK  LiveKit läuft, Port 49210 UDP/TCP veröffentlicht"

# Umzug (F-014): exportieren, Daten verändern, importieren → alter Stand ist wieder da
U=$(mktemp -d)
dc exec -T web sh -c 'echo umzugstest > /data/media/umzug-marke.txt' || fail "Marke im Bilder-Volume"
KD_STACK=kdstack KD_UMZUG_DIR="$U" bash "$ROOT/deploy/umzug.sh" export > "$U/export.log" 2>&1 || { cat "$U/export.log"; fail "Umzug: Export"; }
F=$(ls "$U"/kd-umzug-*.tar | head -1)
tar tf "$F" | grep -q 'kd.dump' && tar tf "$F" | grep -q 'synapse.dump' && tar tf "$F" | grep -q 'media.tar.gz' && tar tf "$F" | grep -q 'stack.env' || fail "Umzugsdatei unvollständig"
dc exec -T db psql -U kd -d kd -q -c "delete from chat_accounts where localpart = 'kstacktest234567'; delete from users where email = 'stack@example.org'" || fail "Testdaten ändern"
dc exec -T web rm -f /data/media/umzug-marke.txt
KD_STACK=kdstack KD_UMZUG_DIR="$U" bash "$ROOT/deploy/umzug.sh" import "$F" > "$U/import.log" 2>&1 || { cat "$U/import.log"; fail "Umzug: Import"; }
dc exec -T db psql -U kd -d kd -tAc "select count(*) from users where email = 'stack@example.org'" | grep -q '^1$' || fail "Umzug: Datenbank nicht zurückgespielt"
dc exec -T web cat /data/media/umzug-marke.txt | grep -q umzugstest || fail "Umzug: Bilder nicht zurückgespielt"
curl -fsS http://127.0.0.1:3120/healthz >/dev/null || fail "Umzug: App nach Import nicht erreichbar"
rm -rf "$U"
echo "OK  Umzug: Export → Import stellt Datenbank, Chat-Datenbank und Bilder wieder her"

dc logs synapse 2>&1 | grep -q "Traceback" && fail "Fehler im Synapse-Log"
dc logs web 2>&1 | grep -q "\[chat\] Synapse-Konfiguration" || fail "Web hat keine Synapse-Konfiguration geschrieben"
echo "OK  Logs sauber"

dc down -v --remove-orphans >/dev/null 2>&1 || true
echo "Stack-Test bestanden."
