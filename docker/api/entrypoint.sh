#!/bin/sh
set -e

# Migrationen laufen beim Start, damit ein Update nur aus "pull" und "up -d"
# besteht. migrate deploy wendet ausschliesslich bereits erzeugte Migrationen
# an und veraendert das Schema nie eigenmaechtig.
echo "Datenbank-Migrationen werden angewendet …"
npx --no-install prisma migrate deploy --schema apps/api/prisma/schema.prisma

exec node apps/api/dist/main.js
