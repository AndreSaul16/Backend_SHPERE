import { defineConfig, type Plugin } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';
import { APP_URL, CTA_REGISTRO, LANDING_URL, URL_LOGIN } from './src/config';

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
    // El dominio propio de la landing: canonical, og:url y og:image absoluta.
    ['%URL_LANDING%', LANDING_URL],
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
