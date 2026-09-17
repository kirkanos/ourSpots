#!/usr/bin/env bash
#
# Startet die komplette lokale Umgebung mit einem Befehl:
#
#   ./scripts/dev.sh          alles hochfahren (und beim ersten Mal einrichten)
#   ./scripts/dev.sh --reset  Datenbank verwerfen und neu aufbauen
#   ./scripts/dev.sh --seed   Beispieldaten neu einspielen
#
# Jeder Schritt prueft vorher, ob er noetig ist – ein zweiter Aufruf springt
# also direkt zum Start der Server.

set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.dev.yml"
ENV_FILE=".env.development"

RESET=false
FORCE_SEED=false
for arg in "$@"; do
  case "$arg" in
    --reset) RESET=true ;;
    --seed)  FORCE_SEED=true ;;
    -h|--help)
      sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *)
      echo "Unbekannte Option: $arg (--reset, --seed oder --help)" >&2
      exit 1 ;;
  esac
done

step() { printf '\n\033[1;32m▸ %s\033[0m\n' "$1"; }
info() { printf '  %s\n' "$1"; }

# --- 1. Konfiguration -------------------------------------------------------

if [ ! -f "$ENV_FILE" ]; then
  step "Konfiguration anlegen"
  cp .env.development.example "$ENV_FILE"
  info "$ENV_FILE aus der Vorlage erstellt."
fi

# --- 2. Abhaengigkeiten -----------------------------------------------------

# package-lock.json neuer als node_modules heisst: es kam etwas dazu.
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  step "Abhängigkeiten installieren"
  npm install --no-audit --no-fund
  touch node_modules
fi

# --- 3. Datenbank -----------------------------------------------------------

if [ "$RESET" = true ]; then
  step "Datenbank verwerfen"
  $COMPOSE down -v
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker läuft nicht – bitte Docker Desktop starten." >&2
  exit 1
fi

step "Datenbank starten"
$COMPOSE up -d

printf '  Warte auf die Datenbank '
for _ in $(seq 1 60); do
  if [ "$($COMPOSE ps --format '{{.Health}}' db 2>/dev/null)" = "healthy" ]; then
    printf ' bereit.\n'
    break
  fi
  printf '.'
  sleep 1
done

if [ "$($COMPOSE ps --format '{{.Health}}' db 2>/dev/null)" != "healthy" ]; then
  printf '\n'
  echo "Die Datenbank wurde nicht bereit. Logs: $COMPOSE logs db" >&2
  exit 1
fi

# --- 4. Prisma-Client, Schema und Beispieldaten -----------------------------

# Auf einem frisch geklonten Repo gibt es den generierten Client noch nicht –
# ohne ihn scheitern Seed und API.
if [ ! -d node_modules/.prisma/client ]; then
  step "Prisma-Client erzeugen"
  npm run db:generate -w @womo/api
fi

# Die API bindet @womo/shared als gebautes Paket ein (das Frontend nutzt die
# Quelle direkt). Auf einem frischen Klon gibt es dist/ noch nicht, und ohne das
# findet die API das Modul nicht.
step "Gemeinsames Paket bauen"
npm run build -w @womo/shared

step "Schema aktualisieren"
# Bewusst "migrate deploy" statt "migrate dev": deploy wendet nur vorhandene
# Migrationen an und fragt nie nach – ein Startskript darf nicht auf eine
# Eingabe warten. Schemaänderungen laufen weiterhin über "npm run db:migrate".
npm run db:apply

# Seeden nur, wenn noch niemand da ist – sonst wären eigene Daten nach jedem
# Start wieder weg.
USER_COUNT=$($COMPOSE exec -T db mariadb -uwomoplaner -pwomoplaner womoplaner \
  -N -B -e 'SELECT COUNT(*) FROM User' 2>/dev/null | tr -d '[:space:]' || echo 0)

if [ "$FORCE_SEED" = true ] || [ "${USER_COUNT:-0}" = "0" ]; then
  step "Beispieldaten einspielen"
  npm run db:seed
else
  info "Datenbank enthält bereits Daten – Beispieldaten übersprungen (--seed erzwingt sie)."
fi

# --- 5. Server --------------------------------------------------------------

step "API und Oberfläche starten"
cat <<'HINWEIS'
  Oberfläche:  http://localhost:5173
  API:         http://localhost:3000/api/health

  Anmelden mit „Lokal anmelden (Entwicklung)".
  Beenden mit Strg+C – die Datenbank läuft weiter (Stoppen: npm run dev:db:stop).

HINWEIS

exec npm run dev:servers
