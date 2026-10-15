# Lokal entwickeln

Die lokale Umgebung kommt ohne Authelia und ohne OpenRouteService aus: Angemeldet
wird über eine Abkürzung, und was einen Schlüssel braucht, sagt das verständlich.

## Starten

```bash
npm run dev
```

Das genügt – auch beim allerersten Mal. Das Skript dahinter (`scripts/dev.sh`)
erledigt der Reihe nach alles, was nötig ist, und überspringt, was schon erledigt
ist:

1. `.env.development` aus der Vorlage anlegen, falls sie fehlt
2. Abhängigkeiten installieren, falls `package-lock.json` neuer ist als `node_modules`
3. MariaDB im Container starten und warten, bis sie bereit ist
4. Prisma-Client erzeugen
5. Gemeinsames Paket `@ourspots/shared` bauen
6. Migrationen anwenden
7. Beispieldaten einspielen – aber nur, wenn die Datenbank leer ist
8. API (:3000) und Oberfläche (:5173) starten

| Variante | Wirkung |
|---|---|
| `npm run dev` | wie oben; vorhandene Daten bleiben |
| `npm run dev -- --seed` | Beispieldaten neu einspielen (überschreibt vorhandene) |
| `npm run dev -- --reset` | Datenbank verwerfen und komplett neu aufbauen |

Beenden mit Strg+C – das stoppt die Server. Die Datenbank läuft im Container
weiter, damit der nächste Start schneller ist.

## Stoppen

```bash
npm run stop
```

| Variante | Wirkung |
|---|---|
| `npm run stop` | Entwicklungsserver und lokale Datenbank; Daten bleiben |
| `npm run stop -- --all` | zusätzlich den vollständigen Stack aus `docker-compose.yml` |
| `npm run stop -- --purge` | alles stoppen und alle Daten löschen |

Das Skript beendet nur Prozesse, die aus diesem Verzeichnis heraus gestartet
wurden – ein fremdes Projekt auf Port 5173 bleibt unangetastet.

Im Browser http://localhost:5173 öffnen und **„Lokal anmelden (Entwicklung)"**
wählen. Dieser Knopf erscheint nur, wenn `DEV_LOGIN=true` gesetzt ist; die
Konfigurationsprüfung lässt diese Kombination mit `NODE_ENV=production` gar nicht
erst zu, und der Endpunkt prüft die Bedingung bei jedem Aufruf noch einmal selbst.

## Beispieldaten

Der Seed legt an:

| Was | Inhalt |
|---|---|
| Nutzer | „Lokaler Testnutzer" (das bist du) und „Mitreisende Person" zum Testen geteilter Reisen |
| Fahrzeug | Kastenwagen mit Maßen, damit die Routenberechnung ein HGV-Profil nutzt |
| Reisen | „Nordsee im Frühjahr" (laufend, mit Etappen, Tagebuch, Tankungen, Ausgaben) und „Toskana im Herbst" (abgeschlossen) |
| Stellplätze | 10 Stück in DE, NL, IT und FR mit Bewertungen, Preisen und Ausstattung |

Die IDs sind fest, ein erneuter Seed liefert also dieselben Links.

## Nützliche Befehle

| Zweck | Befehl |
|---|---|
| Alles typprüfen | `npm run typecheck` |
| Datenbank ansehen | `npm run db:studio` |
| Schema ändern | `apps/api/prisma/schema.prisma` bearbeiten, dann `npm run db:migrate -w @ourspots/api -- --name <beschreibung>` |
| Prisma-Client neu erzeugen | `npm run db:generate -w @ourspots/api` (landet in `apps/api/src/generated/prisma`, nicht in `node_modules`) |
| Alles stoppen | `npm run stop` |
| Nur die Server (ohne Einrichtung) | `npm run dev:servers` |
| Produktionsaufbau testen | `docker compose up -d --build` (eigener Stack, eigene Datenbank) |

## Was lokal anders ist

| Thema | Lokal | Im Betrieb |
|---|---|---|
| Anmeldung | Knopf „Lokal anmelden" | Authelia per OIDC |
| Routenberechnung | ohne `ORS_API_KEY` deaktiviert, mit Hinweis in der Oberfläche | OpenRouteService |
| Service Worker | abgeschaltet, damit Änderungen sofort sichtbar sind | aktiv (PWA, Offline-Cache) |
| Datenbank | Container auf Port 3307, Projekt `ourspots-dev` | Container im Projekt `ourspots` |
| Fotos | `apps/api/data/photos` | Volume `photo_data` |

Weil der Service Worker lokal aus ist, lässt sich die Offline-Erfassung im
Dev-Betrieb nur eingeschränkt prüfen: Die Warteschlange funktioniert (Netz in den
Entwicklerwerkzeugen auf „Offline" stellen), der Kachel-Cache dagegen erst im
gebauten Stand. Dafür `docker compose up -d --build` benutzen.

## Routenberechnung lokal ausprobieren

Einen kostenlosen Schlüssel auf https://openrouteservice.org/dev/#/signup holen
und in `.env.development` bei `ORS_API_KEY` eintragen, dann `npm run dev:api`
neu starten. Ohne Schlüssel bleibt der Rest der App vollständig benutzbar.

## Reisevideo lokal rendern

Die Vorschau im Reiter „Video" läuft ohne weiteres Zutun. Das Erzeugen der
fertigen Datei braucht den Renderer aus `docker/video` – ein eigener Dienst, der
Chromium steuert und ffmpeg füttert.

Am einfachsten über den vollständigen Stack, da ist alles verdrahtet:

```bash
docker compose -f docker-compose.local.yml up -d --build   # http://localhost:8085
```

Gegen die Entwicklungsserver geht es auch, dann aber von Hand. ffmpeg muss
dafür auf dem Rechner liegen (`brew install ffmpeg`):

```bash
cd docker/video
npm install
npx playwright install chromium

WEB_URL=http://localhost:5173 \
VIDEO_DIR="$PWD/../../apps/api/data/videos" \
node server.mjs
```

Das `VIDEO_DIR` ist nicht beliebig: Die API liest die fertige Datei aus ihrem
eigenen `VIDEO_DIR`, und das steht in `.env.development` relativ zu `apps/api`.
Zeigen beide nicht auf dasselbe Verzeichnis, rendert der Lauf durch, aber der
Download antwortet mit 404.

Dann in `.env.development` noch

```
VIDEO_RENDERER_URL=http://127.0.0.1:3100
```

setzen und die API neu starten. Ohne diesen Wert blendet die Oberfläche das
Erzeugen aus – ein Knopf, der nur einen Fehler auslöst, wäre schlimmer als
keiner.

**Wie lange das dauert.** Jedes Bild ist ein eigener Screenshot, und die Karte
muss dafür fertig geladen sein. Gemessen wurden 1,5 s je Bild nativ und bis zu
3,9 s im Container bei 1080p, 6,6 s bei 4K. **Eine Minute Video bei 25 Bildern
je Sekunde dauert damit ein bis drei Stunden.** Zum Ausprobieren unbedingt in
der Oberfläche „Sekunden je 100 km" herunterdrehen und die Bildrate auf 12
stellen – dann ist ein Testlauf in wenigen Minuten durch.
