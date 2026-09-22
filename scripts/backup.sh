#!/usr/bin/env bash
#
# Sichert Datenbank, Fotos und Konfiguration nach Nextcloud.
#
# Laeuft auf dem Server in /services/<SERVICE>/, wo docker-compose.yml und .env
# liegen. Gestartet wird das Skript vom Timer aus <SERVICE>-backup.timer; von
# Hand geht es genauso:
#
#   cd /services/ourspots && ./backup.sh
#
# Das Archiv enthaelt alles, was eine Wiederherstellung braucht:
#
#   datenbank.sql   vollstaendiger Dump
#   fotos.tar       Inhalt des Volumes photo_data
#   env             die Konfiguration des Servers
#
# Es wird unverschluesselt hochgeladen. In der Nextcloud liegen damit das
# Datenbankpasswort, der Session-Schluessel, das OIDC-Secret und die als privat
# markierten Notizen im Klartext -- der Ordner dort gehoert entsprechend
# geschuetzt und nicht geteilt.
set -euo pipefail

cd "$(dirname "$0")"

ENV_FILE=${ENV_FILE:-.env}
[[ -r $ENV_FILE ]] || { echo "Keine lesbare $ENV_FILE in $PWD" >&2; exit 1; }

# Die .env wird bewusst nicht eingelesen, sondern ausgelesen: Werte wie
# NOMINATIM_USER_AGENT enthalten Klammern, an denen die Shell beim Sourcen
# abbricht.
env_value() {
  sed -n "s/^$1=//p" "$ENV_FILE" | head -n1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"
}

require() {
  local name=$1 value
  value=$(env_value "$name")
  [[ -n $value ]] || { echo "$name fehlt in $ENV_FILE" >&2; exit 1; }
  printf '%s' "$value"
}

SERVICE=$(require SERVICE)
MYSQL_DATABASE=$(require MYSQL_DATABASE)
MYSQL_ROOT_PASSWORD=$(require MYSQL_ROOT_PASSWORD)
NEXTCLOUD_URL=$(require NEXTCLOUD_URL)
NEXTCLOUD_USER=$(require NEXTCLOUD_USER)
NEXTCLOUD_PASSWORD=$(require NEXTCLOUD_PASSWORD)
NEXTCLOUD_PATH=$(env_value NEXTCLOUD_PATH); NEXTCLOUD_PATH=${NEXTCLOUD_PATH:-Backups/$SERVICE}
KEEP_DAYS=$(env_value BACKUP_KEEP_DAYS); KEEP_DAYS=${KEEP_DAYS:-30}

# Fuehrende und abschliessende Schraegstriche vereinheitlichen.
NEXTCLOUD_URL=${NEXTCLOUD_URL%/}
NEXTCLOUD_PATH=${NEXTCLOUD_PATH#/}
NEXTCLOUD_PATH=${NEXTCLOUD_PATH%/}

DAV="$NEXTCLOUD_URL/remote.php/dav/files/$NEXTCLOUD_USER"
STAMP=$(date +%Y-%m-%d-%H%M)
ARCHIVE_NAME="$SERVICE-$STAMP.tar.gz"

# Das Archiv kann gross werden; /var/tmp ueberlebt auch einen Neustart und ist
# auf den meisten Systemen grosszuegiger bemessen als /tmp.
umask 077
WORK=$(mktemp -d "${BACKUP_WORK_DIR:-/var/tmp}/$SERVICE-backup-XXXXXX")
trap 'rm -rf "$WORK"' EXIT

# Ohne --output: curl ordnet mehrere --output den URLs der Reihe nach zu, ein
# spaeteres hebt ein frueheres also nicht auf. Die Aufrufe, deren Antwort nicht
# interessiert, haengen es sich selbst an -- sonst landet die HTML-Seite, die
# Nextcloud auf PUT und DELETE zurueckgibt, im Journal.
curl_dav() {
  curl --fail --silent --show-error --user "$NEXTCLOUD_USER:$NEXTCLOUD_PASSWORD" "$@"
}

echo "== Datenbank sichern"
# Das Passwort geht ueber die Umgebung statt ueber die Kommandozeile, sonst
# steht es in der Prozessliste des Containers.
docker compose exec -T -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" ourspots-db \
  mariadb-dump \
    --user=root \
    --single-transaction \
    --quick \
    --routines \
    --events \
    --default-character-set=utf8mb4 \
    "$MYSQL_DATABASE" > "$WORK/datenbank.sql"

# Ein abgebrochener Dump ist die gefaehrlichste Art von Backup: Er sieht aus
# wie eine Sicherung, bis man ihn braucht. mariadb-dump setzt diese Zeile erst
# ans Ende, wenn er durchgelaufen ist.
tail -n 5 "$WORK/datenbank.sql" | grep -q -- '-- Dump completed' || {
  echo "Der Datenbank-Dump ist unvollstaendig, es wird nichts hochgeladen." >&2
  exit 1
}
echo "   $(wc -l < "$WORK/datenbank.sql") Zeilen"

echo "== Fotos sichern"
docker compose exec -T ourspots-api tar -cf - -C /data/photos . > "$WORK/fotos.tar"
echo "   $(du -h "$WORK/fotos.tar" | cut -f1)"

echo "== Konfiguration sichern"
cp "$ENV_FILE" "$WORK/env"

echo "== Archiv packen"
tar -czf "$WORK/$ARCHIVE_NAME" -C "$WORK" datenbank.sql fotos.tar env
echo "   $ARCHIVE_NAME, $(du -h "$WORK/$ARCHIVE_NAME" | cut -f1)"

echo "== Zielordner sicherstellen"
# MKCOL legt immer nur eine Ebene an, deshalb Segment fuer Segment. Ein bereits
# vorhandener Ordner antwortet mit 405 -- das ist kein Fehler.
path=""
while IFS= read -r segment; do
  [[ -n $segment ]] || continue
  path="$path/$segment"
  curl --silent --show-error --output /dev/null \
    --user "$NEXTCLOUD_USER:$NEXTCLOUD_PASSWORD" \
    -X MKCOL "$DAV$path" || true
done <<< "${NEXTCLOUD_PATH//\//$'\n'}"

echo "== Hochladen"
curl_dav --output /dev/null --upload-file "$WORK/$ARCHIVE_NAME" \
  "$DAV/$NEXTCLOUD_PATH/$ARCHIVE_NAME"
echo "   $NEXTCLOUD_PATH/$ARCHIVE_NAME"

echo "== Aeltere Sicherungen aufraeumen (aelter als $KEEP_DAYS Tage)"
cutoff=$(date -d "$KEEP_DAYS days ago" +%Y-%m-%d)
listing=$(curl_dav -X PROPFIND -H 'Depth: 1' "$DAV/$NEXTCLOUD_PATH/" || true)

# Das Datum steckt im Dateinamen, deshalb genuegt ein Zeichenkettenvergleich --
# kein Parsen der WebDAV-Antwort noetig.
printf '%s' "$listing" \
  | grep -o "$SERVICE-[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}-[0-9]\{4\}\.tar\.gz" \
  | sort -u \
  | while IFS= read -r old; do
      datum=${old#"$SERVICE-"}
      datum=${datum:0:10}
      if [[ $datum < $cutoff ]]; then
        curl_dav --output /dev/null -X DELETE "$DAV/$NEXTCLOUD_PATH/$old" \
          && echo "   entfernt: $old"
      fi
    done

echo "== Fertig"
