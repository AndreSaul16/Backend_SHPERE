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

// Tarea 4.11 — paridad dev/prod.
//
// En producción manda `nginx.conf`, que reenvía `/api/v1/` a
// `http://localhost:8000` con `proxy_buffering off` (sin eso el SSE de la junta
// llega a bocados). En desarrollo no había proxy ninguno: la única forma de
// hablar con el backend era la URL absoluta de `VITE_API_URL`, así que una ruta
// RELATIVA —la que sirve en producción— daba 404 contra el propio Vite. Ese es
// el mismo agujero de D30/D31 (las cuatro rutas relativas de
// `ServiceCredentialsSettings`): funcionaban en producción y no en desarrollo,
// y sólo se veía a mano.
//
// Con este proxy las dos rutas funcionan en los dos sitios, y el SSE también:
// Vite no compone la respuesta (no hay `buffering` que apagar) y `ws:false`
// evita que intente actualizar la conexión.
const DESTINO_API = process.env.VITE_PROXY_TARGET || 'http://localhost:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Tarea 4.12 — el manifiesto es lo que hace medible el presupuesto de
    // arranque. `dist/index.html` sólo lleva la entrada y sus `modulepreload`;
    // el grafo real (qué chunk importa a cuál, y si es estática o
    // dinámicamente) sólo está aquí. Lo consume
    // `scripts/check-bundle-budget.mjs`, que corre en CI después del build.
    // Pesa unos pocos KB en `dist/` y no se sirve al navegador.
    manifest: true,
  },
  // IMPORTANTE PARA DOCKER/PODMAN
  server: {
    host: true, // Escuchar en todas las direcciones (0.0.0.0)
    strictPort: true,
    port: 3000, // Puerto fijo alineado con compose.yaml
    watch: {
      usePolling: true, // Necesario en Windows/WSL2 para que el hot-reload funcione bien
    },
    proxy: {
      '/api/v1': {
        target: DESTINO_API,
        changeOrigin: true,
        ws: false,
        // El stream de la junta puede pasar dos minutos abierto; el defecto de
        // `http-proxy` cortaría antes. Es el `proxy_read_timeout 120s` de nginx.
        timeout: 120_000,
        proxyTimeout: 120_000,
      },
    },
  },
  preview: {
    host: true,
    port: 3000,
    strictPort: true,
    allowedHosts: ['.railway.app'],
  },
})

