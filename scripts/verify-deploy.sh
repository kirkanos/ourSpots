#!/usr/bin/env bash
#
# Prueft nach einem Deploy, ob der Stack wirklich laeuft.
#
# Die systemd-Unit startet die Container im Hintergrund, und "systemctl start"
# kehrt zurueck, sobald der Startbefehl abgesetzt ist -- nicht, wenn die
# Anwendung antwortet. Ohne diesen Schritt meldet die Pipeline Erfolg, waehrend
# die App nicht hochkommt.
#
# Laeuft auf dem Server in /services/<SERVICE>/, neben docker-compose.yml und
# .env. Von Hand:
#
#   cd /services/ourspots && ./verify-deploy.sh
set -euo pipefail

cd "$(dirname "$0")"

ENV_FILE=${ENV_FILE:-.env}
[[ -r $ENV_FILE ]] || { echo "Keine lesbare $ENV_FILE in $PWD" >&2; exit 1; }

# Wie in backup.sh ausgelesen statt eingelesen: Werte mit Leerzeichen oder
# Klammern wuerden die Shell beim Sourcen aus dem Tritt bringen.
env_value() {
  sed -n "s/^$1=//p" "$ENV_FILE" | head -n1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"
}

SERVICE=$(env_value SERVICE)
[[ -n $SERVICE ]] || { echo "SERVICE fehlt in $ENV_FILE" >&2; exit 1; }

# Grosszuegig bemessen: Der API-Container wartet erst auf die Datenbank, laesst
# dann die Prisma-Migrationen laufen und hat selbst 60 Sekunden start_period.
TIMEOUT=${VERIFY_TIMEOUT:-240}
INTERVAL=5

zustand() {
  docker compose ps --all --format '{{.Service}} {{.State}} {{.Health}}' 2>/dev/null
}

bericht() {
  echo "--- Zustand der Container ---" >&2
  zustand >&2 || true
  echo "--- Letzte Zeilen der Protokolle ---" >&2
  docker compose logs --tail 40 2>&1 | tail -60 >&2 || true
}

echo "== Warte auf gesunde Container (bis zu ${TIMEOUT}s)"
ende=$((SECONDS + TIMEOUT))
while :; do
  ausgabe=$(zustand)

  # Container ohne eigenen Healthcheck melden ein leeres Feld; fuer die zaehlt
  # allein, dass sie laufen.
  offen=$(awk '$2 != "running" || ($3 != "" && $3 != "healthy") { print $1 }' <<< "$ausgabe")

  if [[ -z $ausgabe ]]; then
    offen="(keine Container gefunden)"
  fi

  if [[ -z $offen ]]; then
    echo "   alle Container laufen und sind gesund"
    break
  fi

  if (( SECONDS >= ende )); then
    echo "Zeitueberschreitung. Noch nicht bereit: $(tr '\n' ' ' <<< "$offen")" >&2
    bericht
    exit 1
  fi

  sleep "$INTERVAL"
done

echo "== Frage die Anwendung"
# Aus dem Container heraus, weil die API nach aussen keinen Port veroeffentlicht
# und von aussen die Forward-Auth davorsteht. Node statt curl, weil im Image
# kein curl liegt -- derselbe Weg, den auch der Healthcheck des Containers geht.
antwort=$(docker compose exec -T "$SERVICE-api" node -e "
  fetch('http://127.0.0.1:3000/api/health')
    .then((r) => r.json())
    .then((d) => { console.log(JSON.stringify(d)); process.exit(d.status === 'ok' ? 0 : 1); })
    .catch((e) => { console.log('nicht erreichbar: ' + e); process.exit(1); });
") || {
  echo "Die Anwendung meldet sich nicht gesund: ${antwort:-keine Antwort}" >&2
  bericht
  exit 1
}

echo "   $antwort"
echo "== Deploy bestaetigt"
