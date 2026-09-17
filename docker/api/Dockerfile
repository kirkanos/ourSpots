# syntax=docker/dockerfile:1

# --- Build -----------------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Prisma leitet die passende Query-Engine aus der vorhandenen OpenSSL-Version
# ab. Ohne das Paket raet es falsch, und der Client passt spaeter nicht zur
# Laufzeitumgebung.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

# Nur die beiden Workspaces installieren, die fuer die API gebraucht werden.
RUN npm ci --workspace @ourspots/shared --workspace @ourspots/api --include-workspace-root

COPY packages/shared packages/shared
COPY apps/api apps/api

RUN npm run build --workspace @ourspots/shared \
 && npx prisma generate --schema apps/api/prisma/schema.prisma \
 && npm run build --workspace @ourspots/api

# Dev-Abhaengigkeiten entfernen und den Prisma-Client neu erzeugen, weil das
# Aufraeumen ihn mitnimmt.
RUN npm prune --omit=dev --workspace @ourspots/shared --workspace @ourspots/api --include-workspace-root \
 && npx --no-install prisma generate --schema apps/api/prisma/schema.prisma

# --- Laufzeit ---------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# tini sorgt dafuer, dass SIGTERM beim Node-Prozess ankommt und der Container
# sauber stoppt statt nach zehn Sekunden getoetet zu werden.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/package.json ./package.json
COPY --chown=node:node --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --chown=node:node --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --chown=node:node --from=build /app/apps/api/dist ./apps/api/dist
COPY --chown=node:node --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --chown=node:node --from=build /app/apps/api/prisma ./apps/api/prisma
COPY docker/api/entrypoint.sh /usr/local/bin/entrypoint.sh

# Der Prisma-CLI prueft beim Start seine Engine-Dateien und braucht dafuer
# Schreibrechte im Projektverzeichnis.
RUN chmod +x /usr/local/bin/entrypoint.sh \
 && mkdir -p /data/photos \
 && chown -R node:node /data /app

USER node
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
