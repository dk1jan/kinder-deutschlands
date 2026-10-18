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
Hinweis: Eine Wiederherstellung macht spätere Löschungen (z. B. Kontolöschungen) rückgängig. Ab Abschnitt 1 wird ein Löschprotokoll geführt, das nach einer Wiederherstellung erneut angewendet wird.

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
| `APP_SECRET` | ja | ≥ 32 Zeichen, nie ändern |
| `POSTGRES_PASSWORD` | ja | Datenbankpasswort |
| `ALLOW_INDEXING` | nein | `true` erst beim echten Start |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | ab Abschnitt 1 | Plesk-Mailserver |

## Domainwechsel später
Neue Subdomain/Domain in Plesk wie oben, in Portainer `APP_URL` ändern, Stack „Update“. Keine Codeänderung.
