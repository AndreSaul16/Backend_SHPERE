/**
 * ÚNICA fuente del destino de los CTA (DIRECCION.md §2.14).
 * El dueño cambia el dominio AQUÍ y en ningún otro sitio: el checklist §8.11
 * exige que la ruta de registro no aparezca fuera de este fichero.
 *
 * Los `href` reales se inyectan en `index.html` en tiempo de servidor/compilado
 * por el plugin de `vite.config.ts`, que consume estas funciones. Así los CTA
 * navegan sin una línea de JavaScript en el navegador (D4) y siguen teniendo
 * una sola fuente de verdad.
 */

export const APP_URL = 'https://frontendsphere-production.up.railway.app';

/**
 * Dónde vive ESTA landing. No es `APP_URL`: son dos servicios distintos de
 * Railway y la aplicación ya existía antes que la página.
 *
 * De aquí salen el `canonical`, el `og:url`, la ruta absoluta de `og:image`
 * (las redes no resuelven rutas relativas) y el `sitemap.xml`. Cuando el dueño
 * enganche el dominio definitivo, esta constante es lo único que cambia en el
 * código — y después toca `pnpm og` sólo si el dominio sale dibujado en la
 * tarjeta, que hoy no sale. `test/seo.test.ts` comprueba que robots.txt y
 * sitemap.xml no se queden atrás.
 */
export const LANDING_URL = 'https://landingsphere-production.up.railway.app';

/** `utm_content` por posición. Nada más lleva UTM (DIRECCION.md §2.14). */
export const POSICIONES_CTA = ['nav', 'hero', 'precios', 'cierre'] as const;

export type PosicionCTA = (typeof POSICIONES_CTA)[number];

export const CTA_REGISTRO = (content: PosicionCTA): string =>
  `${APP_URL}/register?utm_source=landing&utm_medium=web&utm_campaign=lanzamiento&utm_content=${content}`;

/** Login SIN utm: quien entra ya es usuario (DIRECCION.md §2.14). */
export const URL_LOGIN = `${APP_URL}/login`;
