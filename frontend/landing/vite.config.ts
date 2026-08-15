import { defineConfig, type Plugin } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';
import {
  APP_URL,
  BASE_LANDING,
  CTA_REGISTRO,
  LANDING_URL,
  URL_LOGIN,
  URL_OG_IMAGE,
} from './src/config';

/**
 * Inyecta los destinos de los CTA en `index.html` desde `src/config.ts`.
 *
 * POR QUÉ EXISTE ESTE PLUGIN
 * D4 exige que los CTA naveguen sin JavaScript, así que el `href` tiene que
 * venir ya escrito en el HTML servido. El checklist §8.11 exige que la ruta de
 * registro no aparezca fuera de `config.ts`. Las dos cosas a la vez sólo se
 * cumplen sustituyendo en tiempo de servidor/compilado: el HTML lleva marcadores
 * (`%CTA_HERO%`), el navegador recibe la URL completa y la fuente de verdad
 * sigue siendo una sola. `transformIndexHtml` corre también en `vite dev`, así
 * que lo que se ve en desarrollo es lo que se despliega.
 */
function destinosDeCTA(): Plugin {
  const sustituciones = new Map<string, string>([
    ['%CTA_NAV%', CTA_REGISTRO('nav')],
    ['%CTA_HERO%', CTA_REGISTRO('hero')],
    ['%CTA_PRECIOS%', CTA_REGISTRO('precios')],
    ['%CTA_CIERRE%', CTA_REGISTRO('cierre')],
    ['%URL_LOGIN%', URL_LOGIN],
    ['%URL_APP%', APP_URL],
    // El canonical y el og:url: la raíz del dominio, que es donde nginx sirve
    // este documento.
    ['%URL_LANDING%', LANDING_URL],
    // La tarjeta social va aparte porque NO cuelga de la raíz: es un activo de
    // `public/` y por tanto vive bajo `base` (/landing/og.png).
    ['%URL_OG_IMAGE%', URL_OG_IMAGE],
  ]);

  // El patrón se DERIVA del mapa. Escrito a mano, añadir un marcador arriba y
  // olvidarlo aquí lo dejaba sin sustituir: el HTML servido enseñaría
  // «%URL_LANDING%» tal cual en un `href`, y ningún test lo veía.
  const patron = new RegExp([...sustituciones.keys()].join('|'), 'g');

  return {
    name: 'sphere-destinos-cta',
    transformIndexHtml: {
      order: 'pre',
      handler: (html: string) =>
        html.replace(patron, (marcador) => sustituciones.get(marcador) ?? marcador),
    },
  };
}

// Vite 7 + Tailwind CSS v4 mediante el plugin oficial (sin postcss.config).
export default defineConfig({
  /**
   * La landing se despliega DENTRO del servicio del frontend del producto, que
   * comparte con él la raíz de nginx. `base` es lo que separa los dos builds:
   * todo lo que Vite escribe con hash va a `/landing/assets/…` en vez de a
   * `/assets/…`, que es del producto y colisionaría fichero a fichero.
   *
   * Vite aplica esta base a las URLs de `index.html` y del CSS que apuntan a
   * `public/` (las fuentes, el grano, los favicons). Por eso `index.html` las
   * sigue escribiendo desde la raíz (`/fonts/…`): escribirlas ya con `/landing/`
   * las rompería en `pnpm dev`, donde el servidor vuelve a anteponer la base.
   *
   * En producción el DOCUMENTO se sirve en `/`, no en `/landing/`; nginx lo
   * nombra por su ruta física. En desarrollo no hay nginx, así que `pnpm dev`
   * sirve la página en `http://localhost:4173/landing/` y la raíz redirige
   * allí. Es la única diferencia dev/prod, y está aquí escrita.
   */
  base: BASE_LANDING,
  plugins: [tailwindcss(), destinosDeCTA()],
  server: { port: 4173 },
  build: {
    target: 'es2022',
    cssTarget: 'chrome111',
    assetsInlineLimit: 0,
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
