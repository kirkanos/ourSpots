import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'WoMoPlaner',
        short_name: 'WoMo',
        description: 'Wohnmobil-Reisen planen und Stellplätze sammeln',
        lang: 'de',
        start_url: '/karte',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f6f3ec',
        theme_color: '#1f6f5c',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Die Anmeldung läuft über Weiterleitungen zu Authelia – diese Pfade
        // dürfen niemals aus dem Cache beantwortet werden.
        navigateFallbackDenylist: [/^\/api\//, /^\/s\//],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            // Kartenkacheln: unveränderlich, dürfen lange liegen bleiben.
            urlPattern: ({ url }) => /tile\.openstreetmap\.org|tile\.opentopomap\.org/.test(url.hostname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'karten-kacheln',
              expiration: { maxEntries: 8000, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Fotos bekommen bei jeder Änderung eine neue ID.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/photos/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'fotos',
              expiration: { maxEntries: 1000, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Daten: erst das Netz, bei Funkloch die letzte Antwort.
            urlPattern: ({ url, request }) =>
              url.pathname.startsWith('/api/') && request.method === 'GET',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-daten',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 14 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
      devOptions: {
        // Im Dev-Betrieb würde ein Service Worker das Neuladen stören.
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      // Direkt auf die Quelle statt auf das CommonJS-Build des Pakets: so kann
      // Rollup die Named Exports statisch auflösen und der Dev-Server lädt
      // Änderungen an den gemeinsamen Schemas sofort neu.
      '@womo/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Im Dev-Betrieb laeuft die API separat; der Proxy sorgt dafuer, dass das
    // Session-Cookie trotzdem same-origin bleibt.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Leaflet und React ändern sich selten – eigener Chunk, damit ein
        // App-Update nicht das ganze Bundle neu laden lässt.
        manualChunks: {
          leaflet: ['leaflet', 'react-leaflet', 'leaflet.markercluster'],
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
