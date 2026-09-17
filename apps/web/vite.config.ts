import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
  },
});
