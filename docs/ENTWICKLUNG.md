# Lokal entwickeln

Die lokale Umgebung kommt ohne Authelia und ohne OpenRouteService aus: Angemeldet
wird über eine Abkürzung, und was einen Schlüssel braucht, sagt das verständlich.

## Einmalig einrichten

```bash
cp .env.development.example .env.development
npm install
npm run dev:db          # MariaDB im Container, Port 3307
npm run db:migrate      # Schema anlegen
npm run db:seed         # Beispieldaten
```

## Starten

```bash
npm run dev             # API auf :3000, Web auf :5173
```

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

Die IDs sind fest, ein erneuter Seed liefert also dieselben Links. Zurücksetzen:

```bash
npm run db:seed         # nur Daten neu
npm run dev:reset       # Datenbank komplett neu aufbauen
```

## Nützliche Befehle

| Zweck | Befehl |
|---|---|
| Alles typprüfen | `npm run typecheck` |
| Datenbank ansehen | `npm run db:studio` |
| Schema ändern | `apps/api/prisma/schema.prisma` bearbeiten, dann `npm run db:migrate -w @womo/api -- --name <beschreibung>` |
| Datenbank stoppen | `npm run dev:db:stop` |
| Produktionsaufbau testen | `docker compose up -d --build` (eigener Stack, eigene Datenbank) |

## Was lokal anders ist

| Thema | Lokal | Im Betrieb |
|---|---|---|
| Anmeldung | Knopf „Lokal anmelden" | Authelia per OIDC |
| Routenberechnung | ohne `ORS_API_KEY` deaktiviert, mit Hinweis in der Oberfläche | OpenRouteService |
| Service Worker | abgeschaltet, damit Änderungen sofort sichtbar sind | aktiv (PWA, Offline-Cache) |
| Datenbank | Container auf Port 3307, Projekt `womoplaner-dev` | Container im Projekt `womoplaner` |
| Fotos | `apps/api/data/photos` | Volume `photo_data` |

Weil der Service Worker lokal aus ist, lässt sich die Offline-Erfassung im
Dev-Betrieb nur eingeschränkt prüfen: Die Warteschlange funktioniert (Netz in den
Entwicklerwerkzeugen auf „Offline" stellen), der Kachel-Cache dagegen erst im
gebauten Stand. Dafür `docker compose up -d --build` benutzen.

## Routenberechnung lokal ausprobieren

Einen kostenlosen Schlüssel auf https://openrouteservice.org/dev/#/signup holen
und in `.env.development` bei `ORS_API_KEY` eintragen, dann `npm run dev:api`
neu starten. Ohne Schlüssel bleibt der Rest der App vollständig benutzbar.
