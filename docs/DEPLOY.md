# Inbetriebnahme auf travel.kirkanos.net

## 1. Authelia vorbereiten

In der Authelia-Konfiguration einen vertraulichen OIDC-Client anlegen:

```yaml
identity_providers:
  oidc:
    clients:
      - client_id: womoplaner
        client_name: WoMo Planer
        client_secret: '$pbkdf2-sha512$...'   # Hash aus: authelia crypto hash generate pbkdf2
        public: false
        authorization_policy: two_factor
        redirect_uris:
          - https://travel.kirkanos.net/api/auth/callback
        scopes: [openid, profile, email, groups]
        grant_types: [authorization_code]
        response_types: [code]
        token_endpoint_auth_method: client_secret_post
        pkce_challenge_method: S256
```

Das Klartext-Secret kommt in die `.env` als `OIDC_CLIENT_SECRET`, der Hash zu Authelia.

**Wichtig für später:** Sobald die öffentlichen Teilen-Links gebaut sind, müssen
`/s/*` und `/api/public/*` im Reverse Proxy von der Forward-Auth ausgenommen
werden – sonst verlangt Authelia auch von Leuten ohne Konto einen Login.

## 2. Konfiguration

```bash
cp .env.example .env
```

Auszufüllen:

| Variable | Woher |
|---|---|
| `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD` | frei wählen, danach in `DATABASE_URL` eintragen |
| `OIDC_ISSUER` | Basis-URL deiner Authelia-Instanz |
| `OIDC_CLIENT_SECRET` | das Klartext-Secret von oben |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `ORS_API_KEY` | kostenloser Schlüssel von openrouteservice.org (erst ab Schritt 5 nötig) |

## 3. Starten

```bash
docker compose up -d --build
```

Der API-Container wendet beim Start `prisma migrate deploy` an und startet erst
danach. Ein Update besteht deshalb nur aus:

```bash
git pull && docker compose up -d --build
```

## 4. Reverse Proxy

Der Web-Container veröffentlicht standardmäßig auf `127.0.0.1:8085` und bedient
sowohl die App als auch `/api` (das er intern an den API-Container weiterreicht).
Es genügt also, `travel.kirkanos.net` auf diesen einen Port zu leiten.

Mit Traefik stattdessen den Port-Eintrag in `docker-compose.yml` durch Labels
ersetzen:

```yaml
    labels:
      - traefik.enable=true
      - traefik.http.routers.womo.rule=Host(`travel.kirkanos.net`)
      - traefik.http.routers.womo.entrypoints=websecure
      - traefik.http.routers.womo.tls.certresolver=letsencrypt
      - traefik.http.services.womo.loadbalancer.server.port=80
```

Der Proxy muss `X-Forwarded-Proto: https` setzen – die API markiert ihr
Session-Cookie sonst nicht als `secure`. Für Foto-Uploads sollte das
Größenlimit bei mindestens 30 MB liegen.

## 5. Erste Anmeldung

`https://travel.kirkanos.net` aufrufen und „Mit Authelia anmelden“ wählen. Beim
ersten erfolgreichen Login legt die App das Konto automatisch an; Schlüssel ist
der OIDC-`sub`, nicht die E-Mail-Adresse.

Damit du jemanden zu einer Reise einladen kannst, muss diese Person sich einmal
angemeldet haben – vorher existiert ihr Konto nicht.

## Sicherung

Zwei Dinge sind zu sichern:

| Was | Wo |
|---|---|
| Datenbank | Volume `womoplaner_db_data`, z. B. per `docker compose exec db mariadb-dump -u root -p womoplaner` |
| Fotos | Volume `womoplaner_photo_data` (`/data/photos` im API-Container) |

Die Fotos liegen bewusst nicht in der Datenbank, aber ein Backup ohne sie ist
unvollständig: die Datensätze verweisen dann auf fehlende Dateien.

## Wenn etwas klemmt

| Symptom | Ursache |
|---|---|
| `502 Bad Gateway` | API-Container ist nicht hochgekommen: `docker compose logs api` |
| `Ungültige Konfiguration:` im Log | Eine `.env`-Variable fehlt oder hat einen unerlaubten Wert – die Meldung nennt sie |
| Login endet mit „Der Login ist abgelaufen“ | `OIDC_REDIRECT_URI` weicht von der in Authelia hinterlegten ab, oder der Proxy verwirft Cookies |
| Adresssuche antwortet nicht | Nominatim drosselt; die App hält selbst 1 Anfrage/Sekunde ein und cacht Ergebnisse 30 Tage |
