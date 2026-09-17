# WoMoPlaner

Wohnmobil-Reisen planen, Stellplätze unterwegs erfassen und später wiederfinden.
Läuft selbst gehostet unter `https://travel.kirkanos.net`, Anmeldung über Authelia (OIDC).

Das ausführliche Konzept steht in [docs/KONZEPT.md](docs/KONZEPT.md), die
Inbetriebnahme in [docs/DEPLOY.md](docs/DEPLOY.md).

## Was heute funktioniert

- **Anmeldung** über Authelia per Authorization Code + PKCE. Das Backend führt den
  Flow durch und setzt ein httpOnly-Session-Cookie – im Browser liegt nie ein Token.
- **Reisen** anlegen, bearbeiten, löschen; Zeitraum, Status und Beschreibung.
- **Reisen teilen**: Mitreisende per E-Mail hinzufügen, mit Rolle `darf bearbeiten`
  oder `nur lesen`. Rechte werden serverseitig bei jedem Zugriff geprüft.
- **Zwischenziele** je Reise anlegen, sortieren und löschen; Karte mit nummerierten
  Punkten. Die tatsächliche Straßenroute folgt im nächsten Schritt.
- **Stellplätze** anlegen und bearbeiten – über die Karte, die Adresssuche oder den
  aktuellen Standort. Mit Art, Bewertung, Preis, Nächten, Ausstattung und Notizen.
- **Schnellerfassung** „Hier bin ich“: Standort, Name, Bewertung und Fotos in einem
  Rutsch, für unterwegs gedacht.
- **Fotos** hochladen; der Server dreht sie nach EXIF, skaliert sie in drei Größen als
  WebP und liest Aufnahmezeit und GPS aus. Ausgeliefert wird nur mit Zugriffsprüfung.
- **Karte** mit Clustern über alle Stellplätze, **Liste** mit Volltextsuche und Filtern
  nach Art, Bewertung, Preis, Ausstattung und Reise, dazu Umkreissuche.

## Noch nicht gebaut

Schritt 5 bis 9 aus dem Konzept: Straßenrouting über OpenRouteService mit
Wohnmobil-Maßen, PWA mit Offline-Erfassung, Reisetagebuch mit Kilometer- und
Kostenauswertung, öffentliche Teilen-Links sowie GPX/KML-Import und -Export.

## Aufbau

```
apps/api        NestJS + Prisma (MariaDB), OIDC, Fotos, Geocoding-Proxy
apps/web        React + Vite, Leaflet, TanStack Query
packages/shared Zod-Schemas und Typen, von beiden Seiten genutzt
docker/         Dockerfiles und nginx-Konfiguration
```

Die Schemas in `packages/shared` sind die einzige Quelle für die Validierung: das
Frontend prüft damit seine Formulare, das Backend dieselben Daten noch einmal.

## Entwicklung

```bash
cp .env.example .env          # Werte eintragen
npm install
npm run build -w @womo/shared

docker compose up -d db       # nur die Datenbank
npm run db:migrate -w @womo/api

npm run dev:api               # http://localhost:3000
npm run dev:web               # http://localhost:5173 (proxyt /api)
```

Für einen vollständigen Durchlauf inklusive nginx: `docker compose up -d --build`.

## Nützliche Befehle

| Zweck | Befehl |
|---|---|
| Alles typprüfen | `npm run typecheck` |
| Migration erzeugen | `npm run db:migrate -w @womo/api -- --name <beschreibung>` |
| Datenbank ansehen | `npm run db:studio -w @womo/api` |
| Stack neu bauen | `docker compose up -d --build` |
| Alles inkl. Daten löschen | `docker compose down -v` |
