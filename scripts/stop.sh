#!/usr/bin/env bash
#
# Fährt alles herunter, was zu diesem Projekt gehört.
#
#   ./scripts/stop.sh           Entwicklungsserver und Datenbank stoppen
#   ./scripts/stop.sh --all     zusätzlich den vollständigen Stack (docker compose)
#   ./scripts/stop.sh --purge   alles stoppen UND die Daten löschen
#
# Container werden nur gestoppt, nicht gelöscht – die Daten bleiben erhalten,
# bis jemand ausdrücklich --purge sagt.

set -uo pipefail
cd "$(dirname "$0")/.."

REPO_ROOT="$(pwd -P)"
DEV_COMPOSE="docker compose -f docker-compose.dev.yml"

ALL=false
PURGE=false
for arg in "$@"; do
  case "$arg" in
    --all)   ALL=true ;;
    --purge) ALL=true; PURGE=true ;;
    -h|--help)
      cat <<'HILFE'
Fährt alles herunter, was zu diesem Projekt gehört.

  npm run stop               Entwicklungsserver und lokale Datenbank stoppen
  npm run stop -- --all      zusätzlich den vollständigen Stack (docker compose)
  npm run stop -- --purge    alles stoppen UND alle Daten löschen

Ohne --purge bleiben alle Daten erhalten.
HILFE
      exit 0 ;;
    *)
      echo "Unbekannte Option: $arg (--all, --purge oder --help)" >&2
      exit 1 ;;
  esac
done

step() { printf '\n\033[1;32m▸ %s\033[0m\n' "$1"; }
info() { printf '  %s\n' "$1"; }

# --- 1. Entwicklungsserver --------------------------------------------------

step "Entwicklungsserver beenden"

stopped=0
for port in 3000 5173; do
  for pid in $(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null); do
    # Nur beenden, was aus diesem Verzeichnis heraus gestartet wurde: auf dem
    # Rechner können andere Projekte dieselben Ports benutzen.
    cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)
    case "$cwd" in
      "$REPO_ROOT"|"$REPO_ROOT"/*)
        kill "$pid" 2>/dev/null && stopped=$((stopped + 1))
        info "Port $port: Prozess $pid beendet."
        ;;
      *)
        info "Port $port wird von einem fremden Prozess benutzt ($pid) – unangetastet."
        ;;
    esac
  done
done

# Der Aufseher über die drei Prozesse hängt manchmal noch nach.
pkill -f "concurrently -n shared,api,web" 2>/dev/null && stopped=$((stopped + 1))

[ "$stopped" -eq 0 ] && info "Es lief nichts."

# --- 2. Lokale Datenbank ----------------------------------------------------

if docker info >/dev/null 2>&1; then
  step "Lokale Datenbank stoppen"
  if [ "$PURGE" = true ]; then
    $DEV_COMPOSE down -v
    info "Datenbank und Daten gelöscht."
  else
    $DEV_COMPOSE down
    info "Daten bleiben erhalten (Volume ourspots-dev_dev_db_data)."
  fi

  # --- 3. Vollständiger Stack ----------------------------------------------

  if [ "$ALL" = true ]; then
    step "Vollständigen Stack stoppen"
    if [ "$PURGE" = true ]; then
      docker compose -f docker-compose.local.yml down -v
      info "Container, Datenbank und Fotos gelöscht."
    else
      docker compose -f docker-compose.local.yml down
      info "Daten und Fotos bleiben erhalten."
    fi
  elif docker compose -f docker-compose.local.yml ps --status running -q 2>/dev/null | grep -q .; then
    step "Hinweis"
    info "Der vollständige Stack (docker-compose.local.yml) läuft noch."
    info "Auch beenden: npm run stop -- --all"
  fi
else
  step "Docker läuft nicht"
  info "Container konnten nicht gestoppt werden – vermutlich sind sie ohnehin aus."
fi

printf '\n\033[1;32m▸ Fertig\033[0m\n'
