import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import path from "path"

// D42 — aquí vivían cuatro `define` de metadatos de build
// (`__GIT_COMMIT_SHA__`, `__BUILD_TIMESTAMP__`, `__VERSION__`,
// `__RAILWAY_SERVICE_NAME__`) y sus cuatro `declare const` en `vite-env.d.ts`.
// Los consumía la StatusPage, que se revirtió: `grep` sobre `src` da CERO usos.
// `__BUILD_TIMESTAMP__` además cambiaba en cada arranque del servidor de
// desarrollo, así que era una constante inyectada que invalidaba caché sin que
// nadie la leyera. Config zombi: se borra.

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // IMPORTANTE PARA DOCKER/PODMAN
  server: {
    host: true, // Escuchar en todas las direcciones (0.0.0.0)
    strictPort: true,
    port: 3000, // Puerto fijo alineado con compose.yaml
    watch: {
      usePolling: true, // Necesario en Windows/WSL2 para que el hot-reload funcione bien
    },
  },
  preview: {
    host: true,
    port: 3000,
    strictPort: true,
    allowedHosts: ['.railway.app'],
  },
})

