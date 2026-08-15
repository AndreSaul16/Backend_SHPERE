# ---- Stage 1: Build ----
#
# node:22 y no node:20: la landing (ver más abajo) instala con pnpm 11.7.0, que
# declara `engines.node >= 22.13`. Comprobado leyendo el paquete, no supuesto.
# El producto no pierde nada por el cambio — su Vite 7 pide
# `^20.19.0 || >=22.12.0`, así que 22 le vale igual — y la imagen que se
# despliega sigue siendo nginx:alpine: esto es sólo la etapa de compilación.
FROM node:22-alpine AS build

WORKDIR /app

# Install dependencies (cached layer)
COPY package*.json ./
RUN npm ci

# ── Dependencias de la landing, ANTES que su fuente ──────────────────────────
#
# La landing (frontend/landing) es un proyecto Vite aparte que se construye en
# esta misma imagen. Sus manifiestos se copian solos para que Docker reutilice
# la capa de instalación mientras no cambien las dependencias; si viniera
# después del `COPY . .`, cualquier retoque de una línea de la landing
# reinstalaría el árbol entero.
#
# corepack trae la versión de pnpm que fija `packageManager`, la misma que
# generó el lockfile. Sin esto, la imagen usaría la que le tocara.
#
# `pnpm-workspace.yaml` NO es opcional en este COPY: pnpm 11 ya no lee la clave
# "pnpm" de package.json y de ahí saca `allowBuilds: esbuild`. Sin él, esbuild
# se queda sin ejecutar su script de instalación, no coloca el binario de su
# plataforma y `vite build` muere en el arranque.
RUN corepack enable
COPY landing/package.json landing/pnpm-lock.yaml landing/pnpm-workspace.yaml ./landing/
WORKDIR /app/landing
RUN pnpm install --frozen-lockfile
WORKDIR /app

# Copy source and build
COPY . .

# Build with placeholder; nginx substitutes real URL at container start.
# VITE_FIREBASE_* must be present at BUILD time (Vite embeds them into the bundle).
# Railway service variables are runtime-only; we pass Firebase config explicitly here.
RUN VITE_API_URL=__VITE_API_URL__ \
    VITE_FIREBASE_API_KEY=AIzaSyBogAXbPBKAtdogyXPiBinv6e_d2PWX_Sg \
    VITE_FIREBASE_AUTH_DOMAIN=sphere-2a4cf.firebaseapp.com \
    VITE_FIREBASE_PROJECT_ID=sphere-2a4cf \
    VITE_FIREBASE_STORAGE_BUCKET=sphere-2a4cf.firebasestorage.app \
    VITE_FIREBASE_MESSAGING_SENDER_ID=1018425350443 \
    VITE_FIREBASE_APP_ID=1:1018425350443:web:9e32ead8592800594d8d6e \
    npm run build

# ── El build de la landing ───────────────────────────────────────────────────
#
# `pnpm build` es `tsc --noEmit && vite build`, y ese `vite build` sale con
# `base: '/landing/'` (frontend/landing/vite.config.ts): todo lo que escribe con
# hash va a `landing/assets/…`, que es lo que impide que pise el `assets/` del
# producto cuando los dos comparten la raíz de nginx.
#
# Va DESPUÉS del build del producto a propósito: si la landing rompiera, el log
# ya tiene el del producto entero y se lee de un vistazo cuál de los dos falló.
WORKDIR /app/landing
RUN pnpm build
WORKDIR /app

# ---- Stage 2: Production (nginx) ----
FROM nginx:alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# nginx:alpine procesa automáticamente /etc/nginx/templates/*.template con envsubst
# expandiendo variables de entorno (entre ellas $PORT inyectada por Railway).
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Copy built assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# La landing, en su propia carpeta bajo la misma raíz. La ruta física de aquí
# tiene que decir lo mismo que la `base` de su vite.config.ts y que el
# `try_files /landing/index.html` de nginx.conf: son tres sitios y una sola
# verdad, y lo comprueba frontend/landing/test/despliegue.test.ts.
COPY --from=build /app/landing/dist /usr/share/nginx/html/landing

# Permisos para que el entrypoint default pueda escribir confs procesados.
RUN chown -R nginx:nginx /usr/share/nginx/html

# Custom entrypoint with debug logging for Railway troubleshooting
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Railway handles healthcheck via healthcheckPath in railway.toml.
# No Docker HEALTHCHECK — it races with nginx startup and conflicts with Railway's own probe.
ENV PORT=3000

EXPOSE 3000

ENTRYPOINT ["/docker-entrypoint.sh"]
