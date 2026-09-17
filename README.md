# OurSpots

> Self-hosted trip planner and campsite log for camper vans — vehicle-aware routing,
> photos on a map, shared with the people you travel with, works offline.

Wohnmobil-Reisen planen, Stellplätze unterwegs erfassen und später wiederfinden.
Läuft selbst gehostet unter `https://travel.kirkanos.net`, Anmeldung über Authelia (OIDC).

| Dokument | Inhalt |
|---|---|
| [docs/KONZEPT.md](docs/KONZEPT.md) | Datenmodell, Architektur, getroffene Entscheidungen |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Authelia-Client, Konfiguration, Reverse Proxy, Backup |
| [docs/ENTWICKLUNG.md](docs/ENTWICKLUNG.md) | Lokale Umgebung mit Beispieldaten, ohne Authelia |

## Was die App kann

**Reisen planen**
- Reisen mit Zeitraum, Status, Beschreibung und zugeordnetem Fahrzeug
- Zwischenziele per Karte, Adresssuche oder GPS; sortierbar, einzelne Ziele festpinnbar
- Etappen: die Reise in Tagesabschnitte zerlegen, jeder mit eigener Route
- **Straßenroute** über OpenRouteService – mit den Maßen des Wohnmobils, also ohne
  Wege unter zu niedrigen Brücken oder über gesperrte Straßen
- Reihenfolge der Zwischenziele optimieren lassen (Vorschlag, der erst auf
  Bestätigung übernommen wird)
- Berechnete Routen werden zwischengespeichert; unveränderte Routen kosten kein
  API-Kontingent
- Export als GPX oder KML

**Stellplätze sammeln**
- Anlegen über Karte, Adresssuche oder aktuellen Standort
- Art, Bewertung, Preis, Nächte, Ausstattung (18 Merkmale) und Notizen
- Notizen einzeln als privat markierbar – die verlassen die App nie
- Schnellerfassung „Hier bin ich": Standort, Name, Bewertung, Fotos in einem Zug
- Fotos mit EXIF-Auswertung, serverseitig in drei WebP-Größen, ausgeliefert nur
  nach Zugriffsprüfung
- Karte mit Clustern, Liste mit Volltextsuche, Filtern und Umkreissuche
- Import aus GPX, KML und CSV, mit Erkennung bereits vorhandener Punkte

**Unterwegs**
- Als PWA installierbar
- Offline erfasste Stellplätze und Fotos warten lokal und gehen los, sobald wieder
  Verbindung besteht; die Oberfläche zeigt, wie viel noch aussteht
- Kartenausschnitte lassen sich für die Offline-Nutzung vorladen

**Festhalten und auswerten**
- Reisetagebuch mit Kilometerstand und Wetter
- Tankungen; Verbrauch wird aus aufeinanderfolgenden Volltankungen berechnet
- Ausgaben nach Kategorien, mit Auswertung je Reise: Gesamtkosten, Kosten pro Tag
  und pro Kilometer, Durchschnittsbewertung und -stellplatzpreis

**Teilen**
- Reisen für Mitreisende freigeben, mit „darf bearbeiten" oder „nur lesen"
- Öffentlicher Link zu einer Reise für Leute ohne Konto, wahlweise mit Fotos,
  jederzeit widerrufbar

## Aufbau

```
apps/api        NestJS + Prisma (MariaDB), OIDC, Fotos, Routing, Geocoding
apps/web        React + Vite, Leaflet, TanStack Query, Dexie, Service Worker
packages/shared Zod-Schemas und Typen, von beiden Seiten genutzt
docker/         Dockerfiles, nginx-Konfiguration, Init-SQL für die Entwicklung
```

Die Schemas in `packages/shared` sind die einzige Quelle für die Validierung: das
Frontend prüft damit seine Formulare, das Backend dieselben Daten noch einmal.
IDs sind client-seitig erzeugte UUIDv7 und alle Schreibzugriffe laufen über PUT –
das ist die Grundlage dafür, dass die Offline-Warteschlange gefahrlos erneut
zustellen darf.

## Schnellstart

```bash
# Lokal entwickeln – ein Befehl, auch beim ersten Mal
npm run dev
```

Das richtet beim ersten Aufruf alles ein (Konfiguration, Abhängigkeiten,
Datenbank im Container, Schema, Beispieldaten) und startet API und Oberfläche.
Danach http://localhost:5173 öffnen und „Lokal anmelden (Entwicklung)" wählen –
Authelia wird dafür nicht gebraucht. `npm run dev -- --reset` baut die Datenbank
neu auf.

```bash
# Vollständiger Stack wie im Betrieb
cp .env.example .env     # Werte eintragen
docker compose up -d --build
```

| Zweck | Befehl |
|---|---|
| Alles typprüfen | `npm run typecheck` |
| Datenbank ansehen | `npm run db:studio` |
| Lokale Datenbank neu aufbauen | `npm run dev -- --reset` |
| Stack neu bauen | `docker compose up -d --build` |
| Alles stoppen | `npm run stop` |
| Alles stoppen, auch den Stack | `npm run stop -- --all` |
| Alles inklusive Daten löschen | `npm run stop -- --purge` |
