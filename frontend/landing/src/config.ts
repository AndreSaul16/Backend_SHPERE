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
 * La subruta desde la que se sirven los ASSETS de la landing, y la `base` de
 * Vite (la consume `vite.config.ts`).
 *
 * NO puede ser `/`: la landing y el producto comparten servicio de Railway y
 * por tanto raíz de nginx. Vite escribe los ficheros con hash en `assets/`, así
 * que con `base: '/'` los de la landing pisarían los del producto en
 * `/assets/…`. Con `/landing/` cada uno tiene su carpeta y no hay colisión
 * posible: la del producto es `/assets/`, la de la landing `/landing/assets/`.
 *
 * OJO a la asimetría, que es deliberada: el DOCUMENTO se sirve en la raíz del
 * dominio (ver `LANDING_URL`) y sus assets cuelgan de `/landing/`. Funciona
 * porque `base` sólo afecta a las URLs que Vite escribe, y las escribe
 * absolutas.
 */
export const BASE_LANDING = '/landing/';

/**
 * Dónde vive ESTA landing: la RAÍZ del dominio del producto.
 *
 * La página dejó de tener servicio propio. Se sirve desde el mismo servicio de
 * Railway que el frontend, y el dueño decide que sea el punto de entrada del
 * dominio: quien escribe la dirección a secas ve la landing, y el producto
 * sigue respondiendo en sus rutas (`/login`, `/register`, `/chat/…`).
 *
 * De aquí salen el `canonical`, el `og:url` y la `url` de los datos
 * estructurados. Cuando el dueño enganche el dominio definitivo, esta constante
 * y `APP_URL` son lo único que cambia — y después toca `pnpm og` sólo si el
 * dominio sale dibujado en la tarjeta, que hoy no sale.
 *
 * `robots.txt` y `sitemap.xml` ya no son de la landing: declaran el dominio
 * entero, así que viven en `frontend/public/` y los sirve nginx desde la raíz.
 * `test/seo.test.ts` comprueba desde aquí que no se queden atrás.
 */
export const LANDING_URL = APP_URL;

/**
 * `og:image` absoluta: ni LinkedIn ni WhatsApp ni Slack resuelven rutas
 * relativas al rastrear, y la tarjeta saldría sin imagen.
 *
 * Apunta a `/landing/og.png` y no a `/og.png` porque el fichero es un activo de
 * la landing y sale de su `public/`, o sea que su ruta física la fija `base`.
 * El documento está en la raíz; su imagen social, no.
 */
export const URL_OG_IMAGE = `${APP_URL}${BASE_LANDING}og.png`;

/** `utm_content` por posición. Nada más lleva UTM (DIRECCION.md §2.14). */
export const POSICIONES_CTA = ['nav', 'hero', 'precios', 'cierre'] as const;

export type PosicionCTA = (typeof POSICIONES_CTA)[number];

export const CTA_REGISTRO = (content: PosicionCTA): string =>
  `${APP_URL}/register?utm_source=landing&utm_medium=web&utm_campaign=lanzamiento&utm_content=${content}`;

/** Login SIN utm: quien entra ya es usuario (DIRECCION.md §2.14). */
export const URL_LOGIN = `${APP_URL}/login`;
