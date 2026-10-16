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
| `deploy files` | `docker-compose.yml`, `.env`, `backup.sh` und `verify-deploy.sh` nach `/services/$SERVICE/`, systemd-Units aktivieren, Sicherungs-Timer einschalten |
| `restart service` | `systemctl stop` und `start`; die Unit holt die Images und startet die Container |
| `verify deploy` | wartet, bis alle Container gesund sind, und fragt dann `/api/health` im API-Container ab |

Die Unit räumt vor dem Start mit `docker compose down --remove-orphans` auf.
Das ist nötig, wenn ein Dienst in der Compose-Datei umbenannt wurde: Der alte
Container läuft dann unter einem Namen weiter, den der neue beansprucht, und
`up` scheitert am Namenskonflikt. Benannte Volumes bleiben unberührt, `down`
ohne `-v` fasst sie nicht an.

`systemctl start` kehrt zurück, sobald der Startbefehl abgesetzt ist – nicht,
wenn die Anwendung antwortet. Deshalb der Schritt `verify deploy`: Er wartet
über SSH, bis alle Container laufen und ihre Healthchecks bestehen, und fragt
danach `/api/health` aus dem API-Container heraus ab. Von außen ginge das
nicht, weil die API keinen Port veröffentlicht und Authelia davorsteht.

Schlägt das fehl, wird die Pipeline rot und gibt den Zustand der Container samt
der letzten Protokollzeilen aus. Ohne diesen Schritt meldete die Pipeline
Erfolg, während die App nicht hochkam – so ist der Sprung auf `mariadb:13`
unbemerkt durchgegangen.

Das Zeitlimit liegt bei 240 Sekunden; der API-Container wartet erst auf die
Datenbank und lässt dann die Migrationen laufen. Von Hand prüfen:

```bash
ssh -p822 server "/services/ourspots/verify-deploy.sh"
```

Der Prüfschritt läuft bewusst vor dem Image-Build – so landet eine kaputte
Fassung gar nicht erst in der Registry.

Ausgerollt wird nicht `latest`, sondern der Commit: Die Pipeline schreibt
`IMAGE_TAG=sha-<kurz-sha>` in die `.env`, bevor sie sie hochlädt. Damit ist
nachvollziehbar, was läuft, und ein Neustart des Dienstes holt nicht
versehentlich eine neuere Fassung. Ohne `IMAGE_TAG` fällt die Compose-Datei auf
`latest` zurück.

Das Präfix `sha-` ist nötig: Einen Kurz-Hash nur aus Ziffern mit führender Null
(etwa `0269357`) macht Kaniko zur Zahl und taggt `269357` – der Server findet
das Image dann nicht.

Die Datenbank-Migrationen laufen automatisch beim Start des API-Containers.

## 5. Zustand prüfen

```bash
ssh -p822 server
systemctl status ourspots
cd /services/ourspots && docker compose ps
docker compose logs -f api
```

## Netzwerk

Alle vier Container hängen im `traefik-network`, damit der Monitoring-Stack sie
erreicht. Geroutet wird trotzdem nur der Webcontainer – Datenbank, API und
Renderer tragen `traefik.enable=false`.

Weil in diesem Netz auch die Container anderer Projekte laufen, heißen die
Dienste selbst schon eindeutig – `ourspots-db`, `ourspots-api`, `ourspots-web`,
`ourspots-video`.
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
| `ourspots-web` | Traefik, über Labels statt über DNS; dazu dem Renderer, der dort die Renderseite holt |
| `ourspots-video` | der API über `VIDEO_RENDERER_URL` |

Das hat eine Kehrseite: Die Datenbank ist damit für jeden Container im
`traefik-network` erreichbar, nicht mehr nur für die eigene API. Nach außen
ändert sich nichts – veröffentlicht wird kein Port –, aber der Schutz ist jetzt
allein das Passwort.

## Reisevideos

`ourspots-video` rendert die Reisevideos: ein Chromium öffnet die Renderseite
des Webcontainers (`/video-rendern`), wird Bild für Bild weitergeschaltet und
fotografiert jedes einzeln; ffmpeg macht daraus ein MP4. Die Aufträge verwaltet
die API, das Rendern passiert dort drüben.

Drei Punkte, die im Betrieb zählen:

**Speicher.** Chromium mit Kartenkacheln und Höhenmodell ist der größte
Speicherfresser im Stack: gemessen gut 1,1 GB bei 720p, mehr bei 1080p. Der
Container ist auf 10 GB gedeckelt: Ein 4K-Lauf über die 392-km-Testreise stieg
auf 2,7 GB, und der Bedarf wächst mit der Länge der Route, weil Chromium die
Kacheln der gesamten Strecke vorhält. Der Wert ist reine Reserve und wird im
Normalbetrieb nie erreicht. Die Grenze ist kein Budget, sondern eine
Notbremse – belegt wird nur, was der Lauf tatsächlich braucht, und nur während
er läuft. Sie knapp zu setzen bringt nichts: Dann brechen Aufträge mitten im
Lauf ab, statt dass weniger Speicher gebraucht würde.

Umgekehrt gilt aber auch: **Je näher die Grenze an den freien Arbeitsspeicher
des Servers rückt, desto weniger schützt sie.** Der Sinn der Grenze ist, dass
bei einem Ausreißer der Browser in diesem Container stirbt und nicht Datenbank
oder API. Liegt sie oberhalb dessen, was wirklich frei ist, ist der Speicher
schon knapp, bevor der Container seine Grenze überhaupt sieht – dann sucht sich
der Kernel sein Opfer selbst aus, und das muss nicht der Renderer sein. Wer den
Server später mit weiteren Diensten füllt, sollte diesen Wert deshalb noch
einmal gegen `free -h` halten.

**Dauer.** Jedes Bild ist ein eigener Screenshot, und die Karte muss dafür
fertig geladen sein. Gemessen auf derselben Testreise (392 km, Container ohne
Grafikbeschleunigung), Sekunden je Bild:

| Stufe | je Bild | eine Minute Video bei 25 B/s |
|---|---|---|
| 720p | 1,5 – 3,0 s | 40 – 75 min |
| 1080p | ~3,9 s | ~100 min |
| 4K | ~6,6 s | ~165 min |

Die Spanne bei 720p ist der Unterschied zwischen nativer Ausführung und einer
virtualisierten Docker-Umgebung; auf einem echten Linux-Server ist eher das
untere Ende zu erwarten. **Ein Video von einer Minute dauert damit ein bis drei
Stunden.** Wer das abkürzen will, dreht die Bildrate auf 12 herunter – das
halbiert die Zeit – oder hält das Video kurz.

Der Engpass ist dabei nicht die Rechenleistung: Während eines Laufs steht die
CPU immer wieder bei 0 %, während Chromium auf Kacheln von OpenFreeMap und auf
die Höhendaten von AWS wartet. Mehr Arbeitsspeicher oder mehr Kerne ändern daran
wenig. Es läuft
immer nur ein Auftrag gleichzeitig, und ein Neustart des Stacks bricht einen
laufenden ab – die API meldet ihn danach ehrlich als gescheitert, statt den
Nutzer auf einen Fortschritt warten zu lassen, der nie kommt.

**Auflösung.** Die Stufen unterscheiden sich nicht in der Fenstergröße, sondern
in der Pixeldichte: 1080p und 4K zeigen **denselben Kartenausschnitt**, 4K
zeichnet ihn nur doppelt so fein. Das ist bei einer Vektorkarte der richtige
Hebel – ein breiteres Fenster würde bei gleicher Zoomstufe mehr Landschaft
zeigen statt dieselbe schärfer. Hochrechnen eines fertigen Videos ist dagegen
nie sinnvoll: Es erfindet Details, die aus den Vektordaten ohnehin vorliegen.
Bezahlt wird die Schärfe mit Rechenzeit und Dateigröße: 4K brauchte in der
Messung die anderthalbfache Zeit von 1080p und ergab eine rund drei Mal so
große Datei. MapLibre holt bei doppelter Dichte zusätzlich Kacheln einer
tieferen Zoomstufe – daher auch der höhere Speicherbedarf.

**Ablage.** Die fertigen Dateien liegen im Volume `video_data`, getrennt von den
Fotos. Je Reise wird nur das letzte Video aufbewahrt; ein neuer Lauf ersetzt das
alte samt Datei. Die nächtliche Sicherung lässt sie bewusst aus: Sie sind
jederzeit aus der Reise neu erzeugbar und wären mit Hunderten Megabyte das
Größte im Archiv.

**Musik.** Mitgelieferte Stücke liegen beim Webcontainer unter `/musik/`; der
Renderer lädt sie von dort über `VIDEO_WEB_URL`. Eigene Dateien je Reise liegen
im Volume `video_data` unter `musik/` und sind damit für API und Renderer
erreichbar. Der Ordner im Repository ist absichtlich leer – siehe
`apps/web/public/musik/HERKUNFT.md`.

Zwischen API und Renderer steht `VIDEO_RENDER_TOKEN` aus der `.env`. Beide
hängen im geteilten `traefik-network`; ohne das Token könnte dort jeder Nachbar
Renderaufträge aufgeben.

## Rollen und erster Administrator

Es gibt zwei globale Rollen: `admin` und `user`. Ein Administrator darf alles
anlegen, ändern und löschen und vergibt die Rollen; was jemand innerhalb einer
Reise darf, steht weiterhin an der Mitgliedschaft.

**Auf einer bestehenden Installation** macht die Migration den ältesten Nutzer
zum Administrator – aber nur, wenn es noch keinen gibt.

**Auf einer frischen Installation** schreibt die API bei jedem Start ein
Einrichtungstoken ins Log, solange kein Administrator existiert:

```bash
docker compose logs ourspots-api | grep -A6 "noch keinen Administrator"
```

Wer das Log lesen kann, betreibt den Server – so wird nicht der erste
Anmeldende zum Administrator, sondern derjenige mit Zugriff auf die Maschine.
Das Token liegt nur im Arbeitsspeicher und gilt bis zum nächsten Neustart.
Eingegeben wird es unter *Einstellungen*.

## Datenbank-Hauptversionen

Die Compose-Datei setzt `MARIADB_AUTO_UPGRADE: 1`. Nach einem Sprung auf eine
neue Hauptversion passt der Einstiegspunkt damit beim Start die Systemtabellen
an (`mariadb-upgrade`). Ohne den Schalter überspringt er den Schritt und
vermerkt ihn nur im Log – der Server läuft dann mit dem Datenverzeichnis der
alten Fassung weiter, was MariaDB nicht vorsieht.

Das passiert beim **Start des Containers**, also beim nächsten Deploy nach
einem Versionswechsel. Der Schritt verändert die Datenbank und lässt sich
nicht zurücknehmen. Vor einem geplanten Versionswechsel gehört deshalb ein
Blick auf die letzte Sicherung:

```bash
journalctl -u ourspots-backup.service -n 30
```

Die Benutzertabellen rührt der Schritt nicht an (`--upgrade-system-tables`);
geprüft wurde ein Sprung von 11.8 auf 13.0 mit unverändertem Datenbestand.

## Sicherung

`scripts/backup.sh` legt jede Nacht ein Archiv in der Nextcloud ab. Es enthält
alles, was eine Wiederherstellung braucht:

| Datei im Archiv | Inhalt |
|---|---|
| `datenbank.sql` | vollständiger Dump aus `mariadb-dump` |
| `fotos.tar` | Inhalt des Volumes `photo_data` (`/data/photos` im API-Container) |
| `env` | die Konfiguration des Servers |

Nicht enthalten sind die gerenderten Reisevideos aus dem Volume `video_data` –
siehe oben.

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
ssh -p822 server "sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=sha-<kurz-sha>/' /services/ourspots/.env && systemctl restart ourspots"
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
