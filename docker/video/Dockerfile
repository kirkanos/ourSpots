# syntax=docker/dockerfile:1
#
# Der Rendercontainer fuer Reisevideos.
#
# Bewusst Debian statt Alpine: Chromium wird fuer glibc gebaut und ausgeliefert,
# und Playwright laedt genau diesen Build herunter. Unter musl laeuft er nicht.
FROM node:24-bookworm-slim

WORKDIR /app
# Nicht nach /root, sonst kaeme der spaetere Nutzer nicht mehr an den Browser.
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# ffmpeg macht aus den Einzelbildern das MP4. Die Schriftpakete sind kein
# Luxus: Ohne sie zeichnet Chromium jeden Umlaut als leeres Kaestchen -- und
# die Ortsnamen einer Reise durch Deutschland bestehen zu einem guten Teil
# daraus.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ffmpeg \
      fonts-dejavu-core \
      fonts-liberation \
      fonts-noto-core \
      tini \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Mit Lockdatei und npm ci: Der Renderer soll dieselbe Playwright-Fassung
# bekommen wie die, gegen die der Browser unten geladen wird. Eine abweichende
# Fassung laedt oder erwartet eine andere Browser-Revision.
COPY docker/video/package.json docker/video/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# --with-deps holt die Systembibliotheken, die Chromium braucht; das geht nur
# als root und deshalb vor dem Nutzerwechsel.
RUN npx playwright install --with-deps chromium \
 && rm -rf /root/.npm

COPY docker/video/server.mjs ./

# Dieselbe Nutzerkennung wie im API-Container (node, 1000): Beide greifen auf
# dasselbe Volume mit den fertigen Videos zu, der Renderer schreibend, die API
# lesend.
RUN mkdir -p /data/videos && chown -R node:node /data /app

USER node
EXPOSE 3100
# tini sorgt dafuer, dass SIGTERM beim Node-Prozess ankommt und der Container
# sauber stoppt statt nach zehn Sekunden getoetet zu werden.
ENTRYPOINT ["/usr/bin/tini", "--", "node", "server.mjs"]
