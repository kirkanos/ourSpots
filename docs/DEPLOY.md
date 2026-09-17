# Deployment auf spots.kirkanos.net

Das Deployment läuft wie bei den anderen Projekten über Woodpecker: Ein Push auf
`main` entschlüsselt die Konfiguration, prüft den Code, lädt den Quelltext auf den
Server und startet die systemd-Unit neu, die dort `docker compose up --build`
fährt. Gebaut wird also auf dem Zielrechner, nicht in der CI.

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

Das Klartext-Secret kommt in die `.env` als `OIDC_CLIENT_SECRET`, der Hash zu Authelia.

**Wichtig:** `/s/*` und `/api/public/*` müssen ohne Forward-Auth erreichbar bleiben,
sonst verlangt Authelia auch von Leuten ohne Konto einen Login und die
Teilen-Links funktionieren nicht.

## 2. Konfiguration verschlüsseln

```bash
cp .env.sample .env
# Werte eintragen, mindestens:
#   MYSQL_PASSWORD / MYSQL_ROOT_PASSWORD  (frei wählen)
#   DATABASE_URL                          (dasselbe Passwort eintragen)
#   OIDC_CLIENT_SECRET                    (Klartext aus Schritt 1)
#   SESSION_SECRET                        (openssl rand -hex 32)
#   ORS_API_KEY                           (openrouteservice.org, kostenlos)

sops --encrypt --input-type dotenv --output-type dotenv --output .env.enc .env
git add .env.enc && git commit -m "Konfiguration"
```

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

| Secret | Inhalt |
|---|---|
| `sops_age_key` | privater age-Schlüssel zum Entschlüsseln der `.env.enc` |
| `ssh_host_local` | Ziel für ssh/scp, z. B. `root@server` |

Die Pipeline liegt in `.woodpecker/pipeline.yaml` und läuft nur bei Push auf `main`.

## 4. Was beim Deploy passiert

| Schritt | Inhalt |
|---|---|
| `Decrypt .env File` | `.env.enc` → `.env` |
| `check` | `npm ci`, Prisma-Client, gemeinsames Paket, Typprüfung über alle drei Pakete, Produktionsbuild des Frontends |
| `deploy files` | Quelltext als Archiv nach `/services/$SERVICE/` entpacken, systemd-Unit aus `template.service` schreiben und aktivieren |
| `restart service` | `systemctl stop` und `start` – der Build läuft danach im Hintergrund |

Abweichung zu den anderen Projekten: Statt einzelner `scp`-Aufrufe je Verzeichnis
wandert ein `tar`-Archiv hinüber. Das Monorepo hat über hundert Dateien in drei
Verzeichnissen, und die Ausschlüsse im Archiv verhindern, dass `node_modules`
oder Build-Reste aus dem Prüfschritt mitgeschickt werden.

Der erste Start dauert einige Minuten, weil der Server beide Images baut. Die
Datenbank-Migrationen laufen automatisch beim Start des API-Containers.

## 5. Zustand prüfen

```bash
ssh -p822 server
systemctl status ourspots
cd /services/ourspots && docker compose ps
docker compose logs -f api
```

## Sicherung

| Was | Wo |
|---|---|
| Datenbank | Volume `ourspots_db_data`, z. B. per `docker compose exec db mariadb-dump -u root -p ourspots` |
| Fotos | Volume `ourspots_photo_data` (`/data/photos` im API-Container) |

Die Fotos liegen bewusst nicht in der Datenbank, aber ein Backup ohne sie ist
unvollständig: die Datensätze verweisen dann auf fehlende Dateien.

## Ohne Pipeline von Hand ausrollen

Falls Woodpecker einmal nicht kann:

```bash
sops --decrypt --input-type dotenv --output-type dotenv --output .env .env.enc
tar czf deploy.tgz --exclude=node_modules --exclude=dist --exclude=.git \
  package.json package-lock.json tsconfig.base.json docker-compose.yml .dockerignore apps packages docker
scp -P822 deploy.tgz .env server:/services/ourspots/
ssh -p822 server "cd /services/ourspots && tar xzf deploy.tgz && rm deploy.tgz && systemctl restart ourspots"
```

## Wenn etwas klemmt

| Symptom | Ursache |
|---|---|
| Traefik zeigt 404 | Container läuft nicht oder `HOST` in der `.env` passt nicht zur aufgerufenen Domain |
| `Ungültige Konfiguration:` im Log | Eine Variable fehlt oder hat einen unerlaubten Wert – die Meldung nennt sie |
| Login endet mit „Der Login ist abgelaufen" | `OIDC_REDIRECT_URI` weicht von der in Authelia hinterlegten ab |
| Adresssuche antwortet nicht | Nominatim drosselt; die App hält selbst 1 Anfrage/Sekunde ein und cacht 30 Tage |
| Pipeline scheitert im Schritt `Decrypt` | Das Secret `sops_age_key` fehlt oder passt nicht zum Empfänger in `.env.enc` |

## Lokal wie im Betrieb testen

```bash
docker compose -f docker-compose.local.yml up -d --build   # http://localhost:8085
```

Dieselben Images und dieselben Dockerfiles, aber ohne Traefik und mit
veröffentlichtem Port. Beenden mit `npm run stop -- --all`.
