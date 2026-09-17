# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build
WORKDIR /app

ARG VITE_TILE_URL
ARG VITE_TILE_ATTRIBUTION
ENV VITE_TILE_URL=${VITE_TILE_URL}
ENV VITE_TILE_ATTRIBUTION=${VITE_TILE_ATTRIBUTION}

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

RUN npm ci --workspace @womo/shared --workspace @womo/web --include-workspace-root

COPY packages/shared packages/shared
COPY apps/web apps/web

RUN npm run build --workspace @womo/web

FROM nginx:1.27-alpine AS runtime
COPY docker/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
