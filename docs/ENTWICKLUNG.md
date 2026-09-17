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
