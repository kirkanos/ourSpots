# Deployment auf spots.kirkanos.net

Das Deployment läuft über Woodpecker: Ein Push auf `main` entschlüsselt die
Konfiguration, prüft den Code, baut beide Images und legt sie in
`registry.kirkanos.net` ab. Auf dem Server landen nur drei Dateien –
`docker-compose.yml`, `.env` und `backup.sh` –, und die systemd-Unit holt die
Images und startet die Container neu.

Anders als bei `finance-tool` und `MagicPortal`, wo der Server den Quelltext
bekommt und selbst baut: Das Monorepo hätte über hundert Dateien übertragen
müssen, und ein Build auf dem Server dauert bei zwei Node-Images spürbar länger
als das Holen fertiger Schichten. Das Kaniko-Muster ist dasselbe wie in
`ci-build`.

## 1. Authelia vorbereiten

In der Authelia-Konfiguration einen vertraulichen OIDC-Client anlegen:

```yaml
identity_providers:
  oidc:
    clients:
      - client_id: ourspots
        client_name: OurSpots
        client_secret: '$pbkdf2-sha512$...'   # Hash aus: authelia crypto hash generate pbkdf2
        public: false
        authorization_policy: two_factor
        redirect_uris:
          - https://spots.kirkanos.net/api/auth/callback
        scopes: [openid, profile, email, groups]
        grant_types: [authorization_code]
        response_types: [code]
        token_endpoint_auth_method: client_secret_post
        pkce_challenge_method: S256
```

Das ist bereits umgesetzt: Der Client steht in `authelia/config/configuration.yml`
des `traefik`-Repos, das passende Klartext-Secret in der `.env.enc` hier. Damit
die Änderung wirksam wird, muss das `traefik`-Repo gepusht und damit ausgerollt
werden.

Zugang steuert die Gruppe `ourspots` in der `users_database.yml` – wer dort nicht
eingetragen ist, kommt nicht an der Anmeldung vorbei.

**Wichtig:** `/s/*` und `/api/public/*` müssen ohne Forward-Auth erreichbar bleiben,
sonst verlangt Authelia auch von Leuten ohne Konto einen Login und die
Teilen-Links funktionieren nicht.

## 2. Konfiguration

`.env.enc` liegt bereits im Repository: Datenbankpasswörter, Session-Schlüssel und
das OIDC-Secret sind erzeugt und passen zum Hash in der Authelia-Konfiguration.

Der `ORS_API_KEY` ist eingetragen und gegen den Dienst geprüft. Zum Ändern:

```bash
sops --decrypt --input-type dotenv --output-type dotenv --output .env .env.enc
# ORS_API_KEY eintragen
sops --encrypt --age age16cuepewz9gr62xq4cfc390rc44cjckrk6gvygsdyqsqskvd573aq98xn5d \
  --input-type dotenv --output-type dotenv --output .env.enc .env
rm .env && git add .env.enc && git commit -m "ORS-Schlüssel ergänzt"
```

Ohne den Schlüssel funktioniert die App vollständig, nur die Routenberechnung
meldet, dass er fehlt.

`.env` selbst ist in `.gitignore`; nur `.env.enc` gehört ins Repository. Die
Pipeline entschlüsselt sie mit dem Woodpecker-Secret `sops_age_key`.

Drei Werte steuern das Deployment und stehen ebenfalls in der `.env`:

| Variable | Bedeutung |
|---|---|
| `SERVICE` | Verzeichnis `/services/$SERVICE`, Containernamen, systemd-Unit, Traefik-Router |
| `HOST` | Domain für die Traefik-Regel |
| `PORT` | Port im Webcontainer, auf den Traefik zeigt (80) |

## 3. Repository in Woodpecker aktivieren

Das Repository aktivieren und prüfen, dass die beiden Secrets vorhanden sind –
dieselben wie bei den anderen Projekten:

| Secret | Inhalt | Auch benutzt von |
|---|---|---|
| `sops_age_key` | privater age-Schlüssel zum Entschlüsseln der `.env.enc` | allen Projekten |
| `ssh_host_local` | Ziel für ssh/scp, z. B. `root@server` | allen Projekten |
| `docker_username` | Anmeldung an `registry.kirkanos.net` | `ci-build` |
| `docker_password` | dazu das Passwort | `ci-build` |

Die beiden Registry-Secrets sind bisher nur in `ci-build` im Einsatz. Sind sie
dort am Repository hinterlegt und nicht organisationsweit, müssen sie für
OurSpots ergänzt werden – sonst scheitern die beiden Build-Schritte an der
Anmeldung.

Die Pipeline liegt in `.woodpecker/pipeline.yaml` und läuft nur bei Push auf `main`.

## 4. Was beim Deploy passiert

| Schritt | Inhalt |
|---|---|
| `Decrypt .env File` | `.env.enc` → `.env` |
| `check` | `npm ci`, Prisma-Client, gemeinsames Paket, Typprüfung über alle drei Pakete, Produktionsbuild des Frontends |
| `build api image` | Kaniko baut `docker/api/Dockerfile` → `images/ourspots-api:latest` und `:<commit>` |
| `build web image` | Kaniko baut `docker/web/Dockerfile` → `images/ourspots-web:latest` und `:<commit>` |
| `deploy files` | `docker-compose.yml`, `.env` und `backup.sh` nach `/services/$SERVICE/`, systemd-Units aktivieren, Sicherungs-Timer einschalten |
| `restart service` | `systemctl stop` und `start`; die Unit holt die Images und startet die Container |

Die Unit räumt vor dem Start mit `docker compose down --remove-orphans` auf.
Das ist nötig, wenn ein Dienst in der Compose-Datei umbenannt wurde: Der alte
Container läuft dann unter einem Namen weiter, den der neue beansprucht, und
`up` scheitert am Namenskonflikt. Benannte Volumes bleiben unberührt, `down`
ohne `-v` fasst sie nicht an.

Zu beachten: Die Pipeline ruft nur `systemctl start` auf und wartet nicht auf
den Container-Start. Ein Fehler im `docker compose up` färbt deshalb **nicht**
auf die Pipeline ab – sie meldet Erfolg, obwohl die App nicht läuft. Nach einem
Deploy, der etwas an Compose-Datei oder Unit ändert, lohnt ein Blick auf
`https://spots.kirkanos.net/api/health`.

Der Prüfschritt läuft bewusst vor dem Image-Build – so landet eine kaputte
Fassung gar nicht erst in der Registry.

Ausgerollt wird nicht `latest`, sondern der Commit: Die Pipeline schreibt
`IMAGE_TAG=<kurz-sha>` in die `.env`, bevor sie sie hochlädt. Damit ist
nachvollziehbar, was läuft, und ein Neustart des Dienstes holt nicht
versehentlich eine neuere Fassung. Ohne `IMAGE_TAG` fällt die Compose-Datei auf
`latest` zurück.

Die Datenbank-Migrationen laufen automatisch beim Start des API-Containers.

## 5. Zustand prüfen

```bash
ssh -p822 server
systemctl status ourspots
cd /services/ourspots && docker compose ps
docker compose logs -f api
```

## Netzwerk

Alle drei Container hängen im `traefik-network`, damit der Monitoring-Stack sie
erreicht. Geroutet wird trotzdem nur der Webcontainer – Datenbank und API tragen
`traefik.enable=false`.

Weil in diesem Netz auch die Container anderer Projekte laufen, heißen die
Dienste selbst schon eindeutig – `ourspots-db`, `ourspots-api`, `ourspots-web`.
Der Grund: Compose vergibt den **Dienstnamen** automatisch als Netz-Alias. Hieße
der Dienst wie üblich `db`, wäre der Container im geteilten Netz unter `db`
erreichbar, und ein zweites Projekt mit einem Dienst gleichen Namens wäre es
ebenfalls – die Namensauflösung verteilte dann zwischen beiden. Ein zusätzlicher
Alias hilft dagegen nicht, er kommt zum automatischen hinzu, statt ihn zu
ersetzen.

| Dienst | Wird angesprochen von |
|---|---|
| `ourspots-db` | der API über `DATABASE_URL` |
| `ourspots-api` | nginx über `proxy_pass` |
| `ourspots-web` | Traefik, über Labels statt über DNS |

Das hat eine Kehrseite: Die Datenbank ist damit für jeden Container im
`traefik-network` erreichbar, nicht mehr nur für die eigene API. Nach außen
ändert sich nichts – veröffentlicht wird kein Port –, aber der Schutz ist jetzt
allein das Passwort.

## Sicherung

`scripts/backup.sh` legt jede Nacht ein Archiv in der Nextcloud ab. Es enthält
alles, was eine Wiederherstellung braucht:

| Datei im Archiv | Inhalt |
|---|---|
| `datenbank.sql` | vollständiger Dump aus `mariadb-dump` |
| `fotos.tar` | Inhalt des Volumes `photo_data` (`/data/photos` im API-Container) |
| `env` | die Konfiguration des Servers |

Die Fotos liegen bewusst nicht in der Datenbank, aber ein Backup ohne sie wäre
unvollständig: die Datensätze verweisen dann auf fehlende Dateien. Deshalb
stecken beide im selben Archiv – sie passen dann auch zeitlich zusammen.

**Das Archiv liegt unverschlüsselt in der Nextcloud.** Darin stehen das
Datenbankpasswort, der Session-Schlüssel, das OIDC-Secret und die als privat
markierten Notizen im Klartext. Der Zielordner gehört entsprechend geschützt
und nicht geteilt.

### Einrichten

In Nextcloud unter *Einstellungen → Sicherheit* ein App-Passwort erzeugen – kein
Kontopasswort. Ein Skript kann keine Zwei-Faktor-Anmeldung bedienen, und ein
App-Passwort lässt sich einzeln widerrufen, ohne das Konto anzufassen. Dann in
die `.env`:

```bash
sops --decrypt --input-type dotenv --output-type dotenv --output .env .env.enc
# NEXTCLOUD_URL, NEXTCLOUD_USER, NEXTCLOUD_PASSWORD, NEXTCLOUD_PATH eintragen
sops --encrypt --age age16cuepewz9gr62xq4cfc390rc44cjckrk6gvygsdyqsqskvd573aq98xn5d \
  --input-type dotenv --output-type dotenv --output .env.enc .env
rm .env && git add .env.enc && git commit -m "Nextcloud-Zugang für die Sicherung"
```

Den Rest erledigt die Pipeline: Sie legt `backup.sh` neben die `docker-compose.yml`,
installiert `<SERVICE>-backup.service` und `<SERVICE>-backup.timer` und schaltet
den Timer ein. Er läuft täglich um 3 Uhr mit bis zu 15 Minuten Streuung und holt
einen verpassten Lauf nach (`Persistent=true`).

### Nachsehen und von Hand auslösen

```bash
systemctl list-timers ourspots-backup.timer   # wann als Nächstes
systemctl start ourspots-backup.service       # sofort sichern
journalctl -u ourspots-backup.service -n 50   # was zuletzt passierte
```

Das Skript bricht ab, ohne etwas hochzuladen, wenn der Dump unvollständig ist –
ein abgebrochener Dump sieht sonst aus wie eine Sicherung, bis man ihn braucht.
Ältere Archive löscht es erst nach dem erfolgreichen Hochladen, gesteuert über
`BACKUP_KEEP_DAYS` (Vorgabe 30 Tage).

### Wiederherstellen

Archiv aus der Nextcloud holen und auspacken:

```bash
tar -xzf ourspots-2026-09-20-0300.tar.gz   # datenbank.sql, fotos.tar, env
```

Datenbank zurückspielen – der Dump enthält `DROP TABLE`/`CREATE TABLE`, die
vorhandenen Tabellen werden also ersetzt:

```bash
cd /services/ourspots
docker compose exec -T -e MYSQL_PWD="$(sed -n 's/^MYSQL_ROOT_PASSWORD=//p' .env)" \
  ourspots-db mariadb --user=root ourspots < datenbank.sql
```

Fotos zurück ins Volume:

```bash
docker compose exec -T ourspots-api tar -xf - -C /data/photos < fotos.tar
```

Danach die API einmal neu starten, damit Prisma eine frische Verbindung
aufbaut: `systemctl restart ourspots`.

Die mitgesicherte `env` ist nur zum Nachschlagen gedacht – die gültige
Konfiguration kommt aus `.env.enc` über die Pipeline. Sie hilft, wenn der Server
neu aufgesetzt wird und man wissen muss, welcher `IMAGE_TAG` zuletzt lief.

## Ohne Pipeline von Hand ausrollen

Falls Woodpecker einmal nicht kann – die Images müssen dann schon in der
Registry liegen:

```bash
sops --decrypt --input-type dotenv --output-type dotenv --output .env .env.enc
echo "IMAGE_TAG=latest" >> .env
scp -P822 docker-compose.yml .env server:/services/ourspots/
ssh -p822 server "systemctl restart ourspots"
```

Zurück auf eine frühere Fassung, ohne etwas neu zu bauen:

```bash
ssh -p822 server "sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=<kurz-sha>/' /services/ourspots/.env && systemctl restart ourspots"
```

## Wenn etwas klemmt

| Symptom | Ursache |
|---|---|
| Traefik zeigt 404 | Container läuft nicht oder `HOST` in der `.env` passt nicht zur aufgerufenen Domain |
| `Ungültige Konfiguration:` im Log | Eine Variable fehlt oder hat einen unerlaubten Wert – die Meldung nennt sie |
| Login endet mit „Der Login ist abgelaufen" | `OIDC_REDIRECT_URI` weicht von der in Authelia hinterlegten ab |
| Adresssuche antwortet nicht | Nominatim drosselt; die App hält selbst 1 Anfrage/Sekunde ein und cacht 30 Tage |
| Pipeline scheitert im Schritt `Decrypt` | Das Secret `sops_age_key` fehlt oder passt nicht zum Empfänger in `.env.enc` |
| Pipeline scheitert beim Image-Build | `docker_username`/`docker_password` fehlen für dieses Repository |
| Server zieht ein altes Image | `IMAGE_TAG` in `/services/$SERVICE/.env` prüfen |

## Lokal wie im Betrieb testen

```bash
docker compose -f docker-compose.local.yml up -d --build   # http://localhost:8085
```

Dieselben Images und dieselben Dockerfiles, aber ohne Traefik und mit
veröffentlichtem Port. Beenden mit `npm run stop -- --all`.

Die Werte stehen in `docker-compose.local.yml` ausgeschrieben und nicht als
Platzhalter: Compose liest die `.env` im Projektverzeichnis von sich aus ein, und
das ist hier die entschlüsselte Produktivkonfiguration. Mit Platzhaltern liefe
der lokale Aufbau sonst mit den echten Passwörtern.
