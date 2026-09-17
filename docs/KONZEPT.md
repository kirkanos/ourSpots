# OurSpots – Konzept

Stand: 2026-09-16 · Status: **Entwurf zur Abnahme**

## 1. Entscheidungen (aus der Abstimmung)

| Thema | Entscheidung |
|---|---|
| Deployment | Docker Compose, MariaDB (kein Postgres/PostGIS) |
| Frontend | React SPA (Vite + TypeScript), PWA mit Offline-Erfassung |
| Backend | NestJS + Prisma, eigener Container |
| Auth | OIDC gegen Authelia, **BFF-Pattern**: Backend macht den Code+PKCE-Flow, httpOnly-Session-Cookie |
| Routing | OpenRouteService (API-Key), Profil `driving-hgv` mit Fahrzeugmaßen |
| Karte | OpenStreetMap-Raster (Leaflet), optional OpenTopoMap-Layer |
| Fotos | Lokales Volume im Container, Thumbnails serverseitig |
| Nutzer | Mehrere Nutzer, Reisen teilbar (Rollen) |
| Extras | Bewertung/Ausstattung, Reisetagebuch + km/Tanken, GPX/KML + POI-Suche, öffentlicher Teilen-Link |

---

## 2. Architektur

```
                    ┌──────────────────────────────┐
  Handy / Browser ──▶│ Traefik / nginx (dein Proxy) │
                    └──────────────┬───────────────┘
                                   │
          ┌────────────────────────┴────────────────────────┐
          │                                                 │
   ┌──────▼──────┐                                   ┌──────▼──────┐
   │  web (SPA)  │  statisch, nginx-Container        │  api (Nest) │
   │  Vite+React │  ── /api/* proxy ────────────────▶│  Node 22    │
   └─────────────┘                                   └──┬───────┬──┘
                                                        │       │
                                        ┌───────────────▼─┐   ┌─▼──────────────┐
                                        │ MariaDB 11      │   │ Volume /data   │
                                        │ (Prisma)        │   │ Fotos + Thumbs │
                                        └─────────────────┘   └────────────────┘
                                                        │
                                   externe Dienste ─────┴──▶ Authelia (OIDC)
                                                             OpenRouteService
                                                             Nominatim (Geocoding)
                                                             OSM-Tiles
```

**Monorepo** (npm workspaces):

```
OurSpots/
├─ apps/
│  ├─ api/            NestJS, Prisma, Module: auth, trips, stages, spots,
│  │                  photos, routing, diary, search, share, import-export
│  └─ web/            React 19 + Vite + TS, Leaflet, TanStack Query,
│                     Dexie (IndexedDB), Workbox (Service Worker)
├─ packages/
│  └─ shared/         Zod-Schemas + TS-Typen, von API und Web genutzt
├─ docker/            Dockerfiles, nginx.conf
├─ docs/              dieses Konzept, API.md, DEPLOY.md
└─ docker-compose.yml
```

Warum geteiltes `packages/shared`: DTO-Validierung (Zod) einmal definiert, Backend validiert damit
Requests, Frontend validiert Formulare und den Offline-Outbox-Inhalt — keine divergierenden Typen.

---

## 3. Datenmodell (Prisma / MariaDB)

Geo-Daten werden als `DOUBLE` gespeichert, **nicht** als MariaDB-`POINT`: Prisma unterstützt
Spatial-Typen nicht sauber, und für privaten Umfang (einige tausend Stellplätze) reicht ein
Bounding-Box-Index + Haversine-Berechnung vollkommen. `DOUBLE` statt des ursprünglich geplanten
`DECIMAL`, weil Prisma `DECIMAL` als Decimal.js-Objekt ausliefert – für Koordinaten wäre das
nur Umrechnungsaufwand ohne Genauigkeitsgewinn. Geldbeträge bleiben `DECIMAL(10,2)`.
Alle IDs sind **UUIDv7, clientseitig erzeugbar** — damit funktioniert Offline-Anlage ohne ID-Konflikte
und Uploads sind idempotent wiederholbar.

```
User            id, oidcSub(unique), email, displayName, avatarUrl, createdAt, lastLoginAt
Session         id, userId, expiresAt, userAgent            // BFF-Session, httpOnly-Cookie
Vehicle         id, ownerId, name, heightM, widthM, lengthM, weightT, axles,
                consumptionL100km                            // fließt ins ORS-HGV-Profil
Trip            id, ownerId, title, description, startDate, endDate, vehicleId,
                status(planned|active|done), coverPhotoId, createdAt, updatedAt
TripMember      tripId, userId, role(owner|editor|viewer)     // geteilte Reisen
Stage           id, tripId, seq, title, date, notes           // Etappe/Tag – optional nutzbar
Waypoint        id, tripId, stageId?, seq, kind(start|via|end),
                name, lat, lon, address, plannedArrival, plannedNights, locked
Route           id, tripId, stageId?, profileHash(unique), distanceM, durationS,
                geometry(LONGTEXT, encoded polyline), bbox, computedAt, provider
                                                              // Cache, spart ORS-Kontingent
Spot            id, tripId?, createdById, name, lat, lon, address, country,
                type(stellplatz|campingplatz|wildcamping|parkplatz|sonstiges),
                visitedAt, nights, rating(1..5), pricePerNight, currency,
                notes, isPrivateNote, source(gps|manual|import), createdAt, updatedAt
SpotAmenity     spotId, amenity(enum)                          // Strom, Wasser, Entsorgung,
                                                               // WC, Dusche, WLAN, Hund, ruhig,
                                                               // Schranke, Winter, Ver-/Entsorgung…
Photo           id, spotId?, diaryEntryId?, uploadedById, filename, mimeType,
                width, height, bytes, takenAt, lat, lon, sortIndex, caption
DiaryEntry      id, tripId, date, title, text, odometerKm, weather, mood
FuelLog         id, tripId, date, lat?, lon?, liters, pricePerL, totalCost,
                odometerKm, isFull
Expense         id, tripId, date, category(sprit|stellplatz|maut|essen|sonstiges),
                amount, currency, note
ShareLink       id, tripId, token(unique), createdById, expiresAt?,
                includePhotos, includePrivateNotes(false), revokedAt?
GeocodeCache   key, response, createdAt                       // Nominatim-Ergebnisse, 30 Tage
```

Indizes: `Spot(lat, lon)`, `Spot(tripId)`, `Spot(createdById)`, `Spot(visitedAt)`,
`Waypoint(tripId, seq)`.

---

## 4. Routing (die drei gewünschten Modi)

Alle drei Modi laufen über dieselbe Datenstruktur `Trip → Stage → Waypoint`:

1. **Feste Reihenfolge** — Waypoints per Drag&Drop sortiert, ORS `/v2/directions/driving-hgv`
   in genau dieser Reihenfolge. Standardfall.
2. **Reihenfolge optimieren** — Button „kürzeste Reihenfolge finden": ORS `/optimization`
   (VROOM) über alle nicht als `locked` markierten Waypoints; Start/Ziel bleiben fix.
   Ergebnis wird als Vorschlag angezeigt und erst auf Bestätigung übernommen.
3. **Etappen/Tage** — Waypoints werden Stages zugeordnet; jede Stage bekommt eine eigene Route
   mit eigener Distanz/Dauer. Die Reise-Gesamtansicht summiert die Etappen.

**Fahrzeugmaße** aus `Vehicle` gehen als ORS-Restriktionen mit (`height`, `width`, `length`,
`weight`, `hazmat=false`) → keine Routen über zu niedrige Brücken oder gesperrte Straßen.
Zusätzliche Optionen pro Reise: Mautstraßen meiden, Fähren meiden, Autobahn meiden.

**Quota-Schutz:** jede berechnete Route wird unter einem `profileHash`
(SHA256 aus Waypoint-Koordinaten + Profil + Optionen) gecacht. Unveränderte Route = kein API-Call.
ORS-Free-Tier liegt bei 2.000 Requests/Tag, das reicht damit locker.

---

## 5. Offline / PWA

- **Service Worker (Workbox):** App-Shell precached; Kartenkacheln `CacheFirst` mit
  Größenlimit (z. B. 500 MB) → besuchte Gebiete bleiben offline verfügbar.
  Zusätzlich Button „Aktuellen Kartenausschnitt für offline laden" (Zoom 10–15).
- **Daten:** Dexie/IndexedDB spiegelt Trips, Spots und Fotos der letzten/aktiven Reise.
- **Outbox:** Jede Änderung ohne Netz landet als Mutation (mit clientseitiger UUIDv7) in einer
  Queue; Background-Sync schiebt sie nach, sobald Netz da ist. Server-Endpunkte sind idempotent
  (`PUT` mit Client-ID), doppelte Zustellung ist damit ungefährlich.
- **Fotos offline:** Blob liegt in IndexedDB, Upload läuft nach dem Sync der Metadaten;
  UI zeigt „x Fotos warten auf Upload".
- **Konflikte:** `updatedAt`-Vergleich, Last-Write-Wins pro Feld mit Hinweis-Banner
  („Dieser Stellplatz wurde auch auf einem anderen Gerät geändert" + Diff-Ansicht).

---

## 6. Screens

| Screen | Inhalt |
|---|---|
| **Reisen** | Liste/Kacheln aller Reisen, Status, Zeitraum, Vorschaukarte, „+ Neue Reise" |
| **Reise-Detail** | Tabs: Route · Etappen · Stellplätze · Tagebuch · Kosten · Teilen |
| **Routenplaner** | Karte + sortierbare Waypoint-Liste, Distanz/Dauer, Fahrzeugprofil, Optimieren, GPX-Export |
| **Karte (global)** | Alle Stellplätze über alle Reisen, Cluster, Filter-Leiste, Standort-Button |
| **Stellplatz-Liste** | Suchfeld (Volltext), Filter (Bewertung, Preis, Ausstattung, Land, Reise, Zeitraum), Sortierung (Datum, Bewertung, Entfernung zu mir) |
| **Stellplatz-Detail** | Fotogalerie, Karte, Bewertung, Ausstattung, Preis, Notizen, „Route hierher", Bearbeiten |
| **Erfassen (mobil)** | Großer Button „Hier bin ich": GPS-Position, Foto aus Kamera, Name, Bewertung – in unter 15 Sekunden erfasst; funktioniert offline |
| **Tagebuch** | Tageseinträge, km-Stand, Tankungen, Auswertung Ø Verbrauch & Kosten |
| **Einstellungen** | Fahrzeuge, Kartenlayer, Offline-Cache, Mitglieder einer Reise |
| **Öffentliche Ansicht** | Read-only Route + Stellplätze + Fotos unter `https://spots.kirkanos.net/s/<token>`, ohne Login |

---

## 7. API (Auszug)

```
GET    /api/auth/login            → Redirect zu Authelia (PKCE, state im Cookie)
GET    /api/auth/callback         → Session-Cookie setzen, Redirect in die App
POST   /api/auth/logout           → Session löschen + OIDC end_session
GET    /api/auth/me               → aktueller Nutzer

GET    /api/trips                 PUT /api/trips/:id        DELETE /api/trips/:id
GET    /api/trips/:id/waypoints   PUT /api/trips/:id/waypoints        (Bulk-Reorder)
POST   /api/trips/:id/route       → Route berechnen (Cache-aware)
POST   /api/trips/:id/route/optimize
GET    /api/trips/:id/export.gpx  | .kml
POST   /api/trips/:id/members     DELETE /api/trips/:id/members/:userId
POST   /api/trips/:id/share       DELETE /api/share/:token

GET    /api/spots?q=&bbox=&rating=&amenities=&tripId=&from=&to=&near=lat,lon&radius=
PUT    /api/spots/:id             (idempotent, Client-UUID)
DELETE /api/spots/:id
POST   /api/spots/:id/photos      (multipart, EXIF-Auswertung → Zeit + GPS)
GET    /api/photos/:id?size=thumb|medium|original

GET    /api/geocode?q=            → Nominatim-Proxy (serverseitig, mit Rate-Limit + Cache)
GET    /api/reverse?lat=&lon=
POST   /api/import                (GPX/KML/CSV → Spots)

GET    /api/public/:token         → alles für die öffentliche Ansicht, ohne Auth
```

Autorisierung durchgängig über einen `TripAccessGuard`: `owner` darf alles, `editor` darf
Inhalte ändern, `viewer` nur lesen. Private Notizen (`isPrivateNote`) sind nur für den Ersteller
sichtbar und werden im Share-Link nie ausgeliefert.

---

## 8. Fotos

Upload → `sharp`: Original (auf max. 4000 px begrenzt, EXIF-Orientierung angewendet),
`medium` 1600 px, `thumb` 400 px, jeweils als WebP + JPEG-Fallback.
Ablage: `/data/photos/<jahr>/<spotId>/<photoId>_<size>.webp`.
EXIF-GPS und Aufnahmezeit werden ausgelesen und schlagen beim Anlegen Position/Datum vor.
Ausgeliefert wird nur über die API (Zugriffsprüfung), nicht als statisches Verzeichnis.

---

## 9. Authelia-Konfiguration (Vorbereitung durch dich)

In der Authelia-`configuration.yml` ein **confidential client**:

```yaml
identity_providers:
  oidc:
    clients:
      - client_id: ourspots
        client_name: OurSpots
        client_secret: '$pbkdf2-sha512$...'      # digest, per `authelia crypto hash generate`
        public: false
        authorization_policy: two_factor          # oder one_factor
        redirect_uris:
          - https://spots.kirkanos.net/api/auth/callback
        scopes: [openid, profile, email, groups]
        grant_types: [authorization_code]
        response_types: [code]
        userinfo_signed_response_alg: none
        token_endpoint_auth_method: client_secret_post
        pkce_challenge_method: S256
```

Der Pfad `/s/*` und `/api/public/*` müssen im Proxy **ohne** Forward-Auth erreichbar bleiben,
damit der Teilen-Link für Leute ohne Account funktioniert.

---

## 10. docker-compose (Zielbild)

```yaml
services:
  db:    mariadb:11        volume db_data,  healthcheck
  api:   ./docker/api      volume photo_data:/data/photos, depends_on db
  web:   ./docker/web      nginx, statisches Build, /api → api:3000
```

Env (`.env.sample`): `DATABASE_URL`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`,
`APP_URL=https://spots.kirkanos.net`, `SESSION_SECRET`, `ORS_API_KEY`, `NOMINATIM_URL`, `PHOTO_DIR`, `TILE_URL`.

Updates: `docker compose pull && docker compose up -d` — Prisma-Migrationen laufen beim
API-Start automatisch (`prisma migrate deploy`).

---

## 11. Umsetzung in Schritten

1. **Gerüst** — Monorepo, docker-compose, MariaDB, Prisma-Schema, Health-Endpoint
2. **Auth** — OIDC/BFF gegen Authelia, Session, `/me`, geschützte Routen im Frontend
3. **Reisen + Stellplätze** — CRUD, Karte (Leaflet + Cluster), Listenansicht, Suche/Filter
4. **Mobile Erfassung** — GPS-Button, Kamera-Upload, Foto-Pipeline
5. **Routing** — Waypoints, ORS-HGV, Cache, Etappen, Optimierung, GPX/KML
6. **PWA/Offline** — Service Worker, Dexie, Outbox, Tile-Cache
7. **Tagebuch + Kosten** — Einträge, Tankungen, Auswertung
8. **Teilen + Import** — Share-Links, GPX/CSV-Import, Nominatim-Suche
9. **Feinschliff** — Dark Mode, Backup-Hinweise, README/DEPLOY.md

## 12. Offene Punkte für dich

- ~~Domain~~ → **spots.kirkanos.net** (gesetzt, siehe Abschnitt 9/10)
- ~~Nominatim~~ → **öffentliche Instanz** (gesetzt). Zugriff nur serverseitig über `/api/geocode`, mit eigenem User-Agent, Rate-Limit 1 req/s und Ergebnis-Cache in der DB, damit die Nutzungsbedingungen eingehalten werden.
- Soll ich Schritt 1–2 direkt bauen, sobald du das Konzept abgenickt hast?

---

## 13. Abweichungen vom Entwurf (während der Umsetzung entschieden)

1. **Suche per `LIKE` statt MariaDB-FULLTEXT.** Eine Volltextsuche findet nur ganze Wörter –
   „hafen“ würde „Yachthafen“ nicht treffen. Bei einigen tausend Stellplätzen kostet die
   Substring-Suche über Name, Adresse und Notizen ohnehin nur Millisekunden. Falls der Bestand
   einmal fünfstellig wird, ist der FULLTEXT-Index in einer eigenen Migration nachrüstbar.
2. **Koordinaten als `DOUBLE`,** siehe Abschnitt 3.
3. **`openid-client` in Version 5** statt der aktuellen 6: Version 6 ist reines ESM und passt
   nicht zum CommonJS-Build von NestJS. Version 5 ist stabil und wird weiter gepflegt.
4. **Das Frontend bindet `@ourspots/shared` als Quelltext ein,** nicht als gebautes Paket. Das
   CommonJS-Build verbirgt seine Named Exports vor dem Bundler; über den Quellpfad löst Vite sie
   statisch auf und übernimmt Änderungen im Dev-Betrieb sofort.
5. **Keine `class-validator`-Pipe.** Validiert wird ausschließlich mit den Zod-Schemas aus
   `@ourspots/shared`, damit Frontend und Backend nicht auseinanderlaufen können.

## 14. Stand der Umsetzung

| Schritt | Stand |
|---|---|
| 1 Gerüst (Monorepo, Compose, MariaDB, Prisma) | fertig |
| 2 Auth (OIDC/BFF gegen Authelia) | fertig |
| 3 Reisen, Stellplätze, Karte, Suche und Filter | fertig |
| 4 Mobile Erfassung, Foto-Pipeline | fertig (vorgezogen) |
| 5 Routing über OpenRouteService | fertig und gegen den echten Dienst geprüft |
| 6 PWA und Offline-Erfassung | fertig |
| 7 Tagebuch und Kosten | fertig |
| 8 Teilen-Links, Import/Export | fertig |
| 9 Feinschliff, lokale Entwicklungsumgebung | fertig |

## 15. Prisma 7

Seit dem Umstieg auf Prisma 7 gelten drei Dinge anders:

- **Der Client wird nach `apps/api/src/generated/prisma` erzeugt,** nicht mehr
  nach `node_modules`. Das Verzeichnis ist nicht versioniert und entsteht bei
  jedem Build neu; Importe zeigen relativ dorthin statt auf `@prisma/client`.
- **Die Verbindung läuft über einen Treiber-Adapter** (`@prisma/adapter-mariadb`)
  statt über die eingebaute Rust-Engine. Die Adresse kommt deshalb nicht mehr aus
  dem Schema, sondern beim Erzeugen des Clients aus der Konfiguration. Im Image
  liegt dadurch keine Query-Engine mehr.
- **Werkzeug-Einstellungen stehen in `apps/api/prisma.config.ts`:** Schemapfad,
  Migrationen und Datenbankadresse. Aufrufe aus dem Wurzelverzeichnis brauchen
  `--config apps/api/prisma.config.ts`; mit `--schema` allein bricht
  `migrate deploy` mit „datasource.url property is required" ab.

Die Adresse steht dort bewusst als `process.env.DATABASE_URL ?? ''` und nicht als
`env('DATABASE_URL')`: Letzteres wirft, sobald die Variable fehlt – und dann
liesse sich nicht einmal der Client erzeugen, obwohl dafür keine Verbindung nötig
ist. Genau das ist im Docker-Build der Fall.

## 16. Routing: Umzug auf api.heigit.org

OpenRouteService hat `api.openrouteservice.org` zugunsten von `api.heigit.org`
aufgegeben (angekündigt 28.04.2026, Abschaltung 24.08.2026). Der bestehende
Schlüssel gilt weiter, Anfragen und Antworten sind unverändert – nur die
Adressen nicht:

| Zweck | Neue Adresse |
|---|---|
| Routenberechnung | `https://api.heigit.org/openrouteservice/v2/directions/...` |
| Reihenfolgen-Optimierung | `https://api.heigit.org/vroom/v0` |

Beide liegen unter verschiedenen Basispfaden, deshalb gibt es zwei Einstellungen
(`ORS_BASE_URL` und `ORS_OPTIMIZATION_URL`) statt einer.

Zwei Dinge fielen erst beim Test gegen den echten Dienst auf:

1. **VROOM liefert ohne `options.g` keine Strecke,** nur Fahrzeiten. Der
   Vorher-Nachher-Vergleich hätte dann die gesamte Strecke als Ersparnis
   ausgewiesen. Die Anfrage setzt das Flag jetzt.
2. **Etappen brauchen eine Verkettung.** Ursprünglich musste jede Etappe
   mindestens zwei eigene Ziele haben, sonst wurde sie übersprungen – man hätte
   jeden Übernachtungsort doppelt eintragen müssen. Jetzt führt eine Etappe vom
   letzten Ziel der vorigen zum eigenen.

Geprüfte Werte an der Beispielreise (Fahrzeug 2,85 m hoch, 3,5 t, Profil
`driving-hgv`): Nürnberg–Bremen 510 km, Bremen–Greetsiel 152 km,
Greetsiel–Husum 403 km. Der zweite Aufruf ohne `force` kam vollständig aus dem
Cache.

Eine Eigenheit des HGV-Profils: Es wendet Lkw-Beschränkungen an. Bei 3,5 t
führt das mitunter zu Umwegen, die ein Wohnmobil nicht fahren müsste. Wer lieber
kürzer als sicher fährt, kann das Fahrzeug aus der Reise entfernen – dann
rechnet die App mit dem Pkw-Profil und weist das in der Oberfläche aus.
