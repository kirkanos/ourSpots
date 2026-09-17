#!/bin/sh
set -e

# Migrationen laufen beim Start, damit ein Update nur aus "pull" und "up -d"
# besteht. migrate deploy wendet ausschliesslich bereits erzeugte Migrationen
# an und veraendert das Schema nie eigenmaechtig.
#
# Seit Prisma 7 steht die Datenbankadresse in prisma.config.ts statt im Schema,
# deshalb --config statt --schema.
echo "Datenbank-Migrationen werden angewendet …"
npx --no-install prisma migrate deploy --config apps/api/prisma.config.ts

exec node apps/api/dist/main.js
