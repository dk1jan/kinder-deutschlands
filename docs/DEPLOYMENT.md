# DEPLOYMENT

## Server (Stand 18.10.2026)

Ubuntu 24.04, 8 Kerne, 31 GB RAM, ~318 GB frei · Plesk Obsidian 18.0.80 · Docker 29.8, Compose v5 · Portainer CE (lts) auf :9000 · IP 87.106.12.248 · Testdomain: `kinder.jan-krueger.org` (Plesk-Subdomain, Docker-Proxyregel → `kinder-deutschlands-web-1:3000`). `APP_URL` muss exakt `https://kinder.jan-krueger.org` sein – ohne Schrägstrich am Ende.
Belegt und tabu: UDP 10000 (Jitsi), TCP/UDP 40000–40100 (MiroTalk), viele TCP-Ports 3001–9080. Kinder Deutschlands nutzt nur `127.0.0.1:3120`.

## So kommt ein Update auf den Server (automatisch)

1. Commit auf `main` → GitHub Actions: Typprüfung, Unit-/DB-Tests, End-to-End-Test.
2. Nur wenn alles grün: Image `ghcr.io/dk1jan/kinder-deutschlands-web:sha-<commit>` bauen.
3. Branch `deploy` bekommt die Compose-Datei mit genau diesem Image.
4. Portainer sieht den neuen Commit (alle 5 Min) und startet den Stack neu.
5. Beim Start sichert `web` die DB (falls Migrationen anstehen), migriert und startet. Bei Fehler startet `web` nicht, Daten bleiben unverändert.

Rückrollen: in GitHub den vorherigen Lauf von „build-deploy“ erneut starten oder einen alten Commit auf `main` per Revert zurückholen.

## Einmalige Einrichtung (Jan)

### 1. GHCR-Paket öffentlich schalten (nach dem ersten grünen Lauf)
GitHub → Profil → Packages → `kinder-deutschlands-web` → Package settings → Change visibility → **Public**.

### 2. Plesk
1. Websites & Domains → Subdomain hinzufügen: `kinder` unter `jan-krueger.org`.
2. SSL/TLS-Zertifikate → Let's Encrypt → ausstellen (inkl. „Redirect HTTP → HTTPS“).
3. Docker → **Proxyregeln** → Regel hinzufügen: Container `kinder-deutschlands-web-1`, Port 3000. (Alternativ `deploy/plesk-nginx.conf` als zusätzliche nginx-Anweisung – nie beides gleichzeitig.)

### 3. Geheimnisse erzeugen (per SSH)
```bash
echo "APP_SECRET=$(openssl rand -hex 32)"; echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
```
Werte nur in Portainer eintragen, nirgends sonst speichern. `APP_SECRET` nie ändern.

### 4. Portainer-Stack
Stacks → Add stack → Name `kinder-deutschlands` → **Repository**:
- Repository URL: `https://github.com/dk1jan/kinder-deutschlands`
- Repository reference: `refs/heads/deploy`
- Compose path: `docker-compose.yml`
- GitOps updates: **an**, Mechanism **Polling**, Interval **5m**, „Re-pull image“ an
- Environment variables (je genau ein `=`): `APP_URL=https://kinder.jan-krueger.org`, `APP_SECRET=…`, `POSTGRES_PASSWORD=…`
- Deploy the stack

### 5. Ersten Admin anlegen
Portainer → Containers → `kinder-deutschlands-web-1` → Logs → Einmal-Token kopieren → `https://kinder.jan-krueger.org/setup` öffnen. Token ändert sich bei jedem Neustart, bis die Einrichtung abgeschlossen ist.

### 6. Optional: Notfall-Update-Befehl
Siehe Kopf von `deploy/update.sh` (Portainer-Access-Token nötig). Aufruf: `bash /opt/kinder-deutschlands/update.sh`.

## Prüfen

```bash
curl -fsS http://127.0.0.1:3120/readyz && echo
docker logs --tail 50 kinder-deutschlands-web-1
docker logs --tail 20 kinder-deutschlands-backup-1
ls -lh /var/lib/docker/volumes/kinder-deutschlands_backups/_data/
```

## Wiederherstellen einer Sicherung

```bash
# Beispiel: neueste tägliche Sicherung zurückspielen (überschreibt die aktuelle Datenbank!)
docker stop kinder-deutschlands-web-1
F=$(ls -t /var/lib/docker/volumes/kinder-deutschlands_backups/_data/daily-*.dump | head -1)
docker exec -i kinder-deutschlands-db-1 pg_restore -U kd -d kd --clean --if-exists --no-owner < "$F"
docker start kinder-deutschlands-web-1
```
Kontolöschungen werden zusätzlich in `/backups/deletions.log` (Sicherungs-Volume, nicht in der DB) vermerkt. Beim Start wendet die App diese Liste automatisch erneut an – nach einer Wiederherstellung sind gelöschte Konten also sofort wieder gelöscht (Log-Zeile „Löschliste: … erneut gelöscht“). Nichts von Hand nötig.

## Bilder (Volume `media`)
Hochgeladene Bilder liegen im Volume `media` (`/data/media` im Web-Container). Der Container `backup` packt sie täglich nach `/backups/media-*.tar.gz` (letzte 3 bleiben). Wiederherstellen:
```bash
F=$(ls -t /var/lib/docker/volumes/kinder-deutschlands_backups/_data/media-*.tar.gz | head -1)
docker run --rm -v kinder-deutschlands_media:/m -v "$F":/b.tgz:ro alpine sh -c 'tar -xzf /b.tgz -C /m'
```

## Chat (ab Abschnitt 4)
Nichts von Hand: Der Stack enthält den Container `synapse`. Die App schreibt dessen Konfiguration beim Start in das Volume `synapse-config` und legt die Datenbank `synapse` an; Synapse startet sich bei Änderungen selbst neu (Log: „Konfiguration geändert – Neustart“). Kein eigener Port, keine Plesk-Änderung – Browser erreichen den Chat über die App.

Prüfen: Verwaltung → Übersicht → „Chat-Server“ = „In Ordnung“. Logs: `docker logs --tail 50 kinder-deutschlands-synapse-1`.

Chat-Datenbank wiederherstellen (überschreibt den aktuellen Chat-Stand!):
```bash
docker stop kinder-deutschlands-synapse-1
F=$(ls -t /var/lib/docker/volumes/kinder-deutschlands_backups/_data/chat-*.dump | head -1)
docker exec -i kinder-deutschlands-db-1 pg_restore -U kd -d synapse --clean --if-exists --no-owner < "$F"
docker start kinder-deutschlands-synapse-1
```
Chat-Medien (verschlüsselt): `chatmedien-*.tar.gz` analog zu den Bildern in das Volume `kinder-deutschlands_synapse-data` (Ordner `media_store`) entpacken.

## Anrufe / TURN (ab Abschnitt 7)
Der Stack enthält den Container `turn` (coturn, Host-Netz). Konfiguration schreibt die App ins Volume `synapse-config` (`turnserver.conf`), Neustart bei Änderung automatisch. Nötig ist nur, dass diese Ports am Server von außen erreichbar und frei sind:

| Port | Protokoll | Zweck |
|---|---|---|
| 3479 | UDP + TCP | TURN (bewusst nicht 3478, falls Plesk/anderes dort lauscht) |
| 49160–49200 | UDP | Medien-Relay |

Prüfen auf dem Server:
```bash
ss -lunpt | grep -E ':3479|:4916|:4917|:4918|:4919|:4920' ; docker logs --tail 30 kinder-deutschlands-turn-1
```
Falls eine Firewall aktiv ist (ufw / IONOS-Cloud-Firewall), diese Ports freigeben, z. B. `ufw allow 3479 && ufw allow 49160:49200/udp`. Hostname = Host aus `APP_URL` (muss auf die öffentliche IP zeigen). Abschalten: `TURN_ENABLED=false`.

Lokale Browsertests nach dem Rauchtest – Barrierefreiheit: `TEST_DATABASE_URL=… python3 scripts/a11y-check.py` (axe-core, WCAG 2.1 AA). Anruftest (zwei Browser, künstliche Kamera, plus Chat-Suche): `TEST_DATABASE_URL=… SYNAPSE_PYTHON=/opt/synvenv/bin/python python3 scripts/call-check.py`.

## E-Mail-Versand einrichten (Pflicht für Registrierung und Passwort-Zurücksetzen)
1. Plesk → `jan-krueger.org` → **E-Mail-Adressen** → **E-Mail-Adresse erstellen**: `noreply@jan-krueger.org`, starkes Passwort.
2. Plattform → **Verwaltung → Einstellungen** → E-Mail-Versand: Mailserver `jan-krueger.org`, Port `587`, Absender und Benutzername `noreply@jan-krueger.org`, Passwort → **Speichern und Verbindung prüfen**.
3. **Test-E-Mail an mich senden**. Landet sie im Spam: Plesk → Mail-Einstellungen → DKIM aktivieren (SPF/DMARC prüfen).
Das Passwort liegt nur verschlüsselt in der Datenbank (Schlüssel aus `APP_SECRET`) und wird nie angezeigt. Wird `APP_SECRET` geändert, muss es neu eingegeben werden.
Rückfall: Ist in der Verwaltung nichts gespeichert, gelten die Portainer-Variablen `SMTP_*` (siehe Tabelle unten). Nicht nötig, wenn die Verwaltung genutzt wird.

## Karte und Datenabrufe (ab Abschnitt 2)
Läuft von selbst. Nach dem ersten Ausrollen holt die App nacheinander: Regionen (VG250, Stadtteile), dann die Kartenkacheln (~1,5 GB in das Volume `tiles`, wenige Minuten), dann die Orte (Spielplätze, Toiletten …, je nach Overpass-Auslastung 5–30 Minuten). Stand sichtbar unter **Verwaltung → Daten und Orte**; dort auch „Jetzt abrufen“ und „Pausieren“.
- Speicher: `tiles` ≈ 1,5 GB + beim Erneuern kurz dieselbe Menge zusätzlich (Prüfung: mindestens 3 GB frei).
- Arbeitsspeicher: Web-Container 2 GB (Niedersachsen-Import).
- Ausgehende Verbindungen des Web-Containers: overpass-api.de (+ Ausweichserver), sgx.geodatenzentrum.de, build.protomaps.com, opendata.lgln.niedersachsen.de (Luftbild), optional ibasemaps-api.arcgis.com. Beim Kartenaufruf der Besucher: keine direkten Anfragen an Dritte.
- Luftbild Bremen: Verwaltung → Einstellungen → Esri-API-Schlüssel (optional).
- Abruffehler prüfen: Meldung in Verwaltung → Daten und Orte. Netz testen: `docker exec kinder-deutschlands-web-1 wget -qO- "https://sgx.geodatenzentrum.de/wfs_vg250?service=WFS&request=GetCapabilities" | head -c 200`
- Nur zum Testen (nie in Produktion setzen): `SCHEDULER=off`, `OVERPASS_URL`, `VG250_URL`, `PROTOMAPS_BUILDS_URL`, `PROTOMAPS_BUILD_BASE`, `PMTILES_BIN`.

## Veranstaltungen, Einrichtungen, Radar (ab Abschnitt 5)
Läuft von selbst im Web-Container, keine neuen Container oder Variablen.
- Zeitplan (jede Minute): fällige Erinnerungen; alle 10 Minuten: Familienradar (wöchentlich Mo ab 7 Uhr, täglich ab 7 Uhr) und Bitte um erneute Bestätigung abgelaufener Platzangaben.
- Radar per E-Mail nur, wenn SMTP eingerichtet ist; sonst nur Übersicht im Portal und – falls gewählt – Push ohne Inhalt.
- Einrichtungs-Kalender (ICS) erscheinen als Quelle `org-ics-…` unter **Verwaltung → Daten und Orte** (täglicher Abruf, „Jetzt abrufen“ möglich). Ausgehende Verbindung zur Kalender-Adresse der Einrichtung (gegen interne Adressen geschützt, max. 3 MB).
- Einrichtungen prüfen: **Verwaltung → Einrichtungen**. Redaktionelle Hinweise: **Verwaltung → Hinweise**.
- Abschnitt 6 (Marktplatz, Hilfe, Kompass, Einladungen): ebenfalls ohne neue Container/Variablen. Im selben Takt (alle 10 Min.): Suchaufträge, Ablauf von Anzeigen/Hilfe-Einträgen, Löschen vergangener Einladungen. Marktplatz-Bilder liegen im Volume `media` (Sicherung wie Community-Bilder). Kompass pflegen: **Verwaltung → Lebenslagen**.
- Nur zum Testen (nie in Produktion setzen): `IMPORT_ALLOW_LOCAL=1`, `ANGEBOTE_JOBS=on`, `ANGEBOTE_JOBS_MS`.

## Falsches Zertifikat / „Nicht sicher“
Prüfen: `echo | openssl s_client -connect 87.106.12.248:443 -servername kinder.jan-krueger.org 2>/dev/null | grep subject=` muss `CN = kinder.jan-krueger.org` zeigen. Kommt `public-power.de`, fehlt der nginx-Block der Subdomain: `ls /var/www/vhosts/system/kinder.jan-krueger.org/conf/` ist dann leer/fehlt. Lösung (18.10.2026 so behoben):
```bash
plesk bin site --remove kinder.jan-krueger.org
plesk bin subdomain --create kinder -domain jan-krueger.org -www-root /httpdocs/kinder
```
Danach Let's Encrypt ausstellen, 301 auf HTTPS, Docker-Proxyregel `kinder-deutschlands-web-1:3000`.

## Datenbank lehnt Passwort ab
Log zeigt `Anmeldung an der Datenbank abgelehnt (28P01)`: Das DB-Volume wurde mit einem anderen `POSTGRES_PASSWORD` angelegt. Solange noch keine Daten existieren:
```bash
docker rm -f kinder-deutschlands-web-1 kinder-deutschlands-backup-1 kinder-deutschlands-db-1
docker volume rm kinder-deutschlands_db kinder-deutschlands_backups
```
Danach Portainer → Stack → **Pull and redeploy**. Mit echten Daten stattdessen das Passwort in der DB angleichen (`ALTER USER kd PASSWORD …`), nie das Volume löschen.

## Geheimnisse
Niemals in Chats, Tickets oder Screenshots. Gelangen sie doch hinaus: neu erzeugen. `APP_SECRET` nach der Einrichtung zu ändern macht die 2FA unbrauchbar – dann Admin-2FA neu einrichten.

## Umgebungsvariablen

| Variable | Pflicht | Bedeutung |
|---|---|---|
| `APP_URL` | ja | öffentliche Adresse mit https |
| `APP_SECRET` | ja | ≥ 32 Zeichen, nie ändern (auch Chat-Geheimnisse werden daraus abgeleitet) |
| `POSTGRES_PASSWORD` | ja | Datenbankpasswort |
| `ALLOW_INDEXING` | nein | `true` erst beim echten Start |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | nein | nur Rückfall – normal in Verwaltung → Einstellungen |
| `SMTP_INSECURE_TLS` | nein | nur bei Zertifikatsfehler des Mailservers |
| `TURN_ENABLED` | nein | Standard `true`; `false` schaltet den TURN-Server für Anrufe ab |
| `TURN_HOST` | nein | Standard: Host aus `APP_URL` |
| `TURN_EXTERNAL_IP` | nein | nur nötig, wenn der Server hinter NAT steht (öffentliche IP) |

## Domainwechsel später
Neue Subdomain/Domain in Plesk wie oben, in Portainer `APP_URL` ändern, Stack „Update“. Keine Codeänderung. Chats bleiben erhalten (feste Chat-Serverkennung, D-035); Push-Abos melden sich auf der neuen Adresse neu an.
