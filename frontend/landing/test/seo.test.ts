/**
 * DIRECCION.md §2.15 — metadatos, indexación y datos estructurados.
 *
 * El dominio de la landing vive en UNA constante (`LANDING_URL`), pero se
 * asoma en varios sitios: el `canonical`, el `og:url`, la `url` de los datos
 * estructurados, la ruta absoluta de `og:image` y —fuera del alcance del plugin
 * de Vite, porque son ficheros estáticos— `robots.txt` y `sitemap.xml`. Cuando
 * el dueño cambie el dominio tocará la constante y esos ficheros se quedarán
 * atrás sin que nada falle en tiempo de compilado. Este test es lo que se lo
 * dice.
 *
 * LA ASIMETRÍA QUE ESTE TEST FIJA, porque es la que se olvida
 * La landing dejó de tener servicio propio: se sirve desde el servicio del
 * frontend del producto, y es el punto de entrada del dominio. El DOCUMENTO
 * está en la RAÍZ (`/`) y sus ASSETS bajo `/landing/`, que es la `base` de
 * Vite. Así que `canonical` y `og:url` son la raíz, y `og:image` NO: cuelga de
 * la base, porque es un fichero de `public/` y su ruta la fija el build.
 * Escribir las dos cosas con la misma constante era el error fácil.
 *
 * `robots.txt` y `sitemap.xml` ya no viven aquí: declaran el DOMINIO entero
 * —cuya raíz es esta página, pero cuyas otras rutas son la aplicación—, así que
 * son del producto y están en `frontend/public/`. Este test los sigue mirando
 * desde aquí porque el número que tienen que decir sale de esta constante.
 *
 * La sustitución se prueba EJECUTANDO el plugin de verdad sobre `index.html`,
 * no buscando cadenas: lo que importa no es que el marcador esté declarado,
 * sino que el HTML servido salga con la URL puesta.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

import configuracion from '../vite.config';
import { BASE_LANDING, LANDING_URL, URL_OG_IMAGE } from '../src/config';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (...ruta: string[]) => readFileSync(join(RAIZ, ...ruta), 'utf8');

/** `frontend/public/`: lo que nginx sirve desde la raíz del dominio. */
const leerDelProducto = (...ruta: string[]) =>
  readFileSync(join(RAIZ, '..', 'public', ...ruta), 'utf8');

const INDEX = leer('index.html');
const ROBOTS = leerDelProducto('robots.txt');
const SITEMAP = leerDelProducto('sitemap.xml');

/** El `index.html` tal y como lo recibe el navegador, marcadores ya resueltos. */
function htmlServido(): string {
  const plugins = (configuracion.plugins ?? []).flat(2) as Plugin[];
  const plugin = plugins.find((p) => p && p.name === 'sphere-destinos-cta');
  expect(plugin, 'el plugin que sustituye los destinos ha desaparecido').toBeDefined();

  const transformar = plugin!.transformIndexHtml;
  const manejador = typeof transformar === 'function' ? transformar : transformar!.handler;
  return manejador.call(null as never, INDEX, null as never) as string;
}

const SERVIDO = htmlServido();

describe('§2.15 — los metadatos que se sirven', () => {
  it('no queda ni un marcador sin sustituir en el HTML servido', () => {
    expect(SERVIDO.match(/%[A-Z_]+%/g)).toBeNull();
  });

  it('el documento se declara en la RAÍZ del dominio, que es donde lo sirve nginx', () => {
    // Si LANDING_URL creciera una subruta, el canonical apuntaría a una URL
    // que nginx no sirve y Google indexaría un 404 como página buena.
    expect(new URL(LANDING_URL).pathname).toBe('/');
  });

  it('declara el canonical con el dominio de la landing', () => {
    expect(SERVIDO).toContain(`<link rel="canonical" href="${LANDING_URL}/">`);
  });

  it('og:image es ABSOLUTA: los rastreadores sociales no resuelven rutas relativas', () => {
    const og = /<meta property="og:image" content="([^"]+)">/.exec(SERVIDO)?.[1];
    expect(og).toBe(URL_OG_IMAGE);
    expect(og).toMatch(/^https:\/\//);
  });

  it('og:image cuelga de la base, no de la raíz: es un activo del build', () => {
    // El documento está en `/` y la tarjeta en `/landing/og.png`. Escribirla
    // en la raíz daría un 404 silencioso: la vista previa del enlace sale sin
    // imagen y no falla nada en ningún sitio.
    expect(new URL(URL_OG_IMAGE).pathname).toBe(`${BASE_LANDING}og.png`);
  });

  it('og:url apunta a la propia landing, no a la aplicación', () => {
    expect(SERVIDO).toContain(`<meta property="og:url" content="${LANDING_URL}/">`);
  });

  it('theme-color es el fondo real del documento (baize-950)', () => {
    expect(INDEX).toContain('<meta name="theme-color" content="#060F09">');
    // El mismo hexadecimal que el favicon, que tampoco puede leer variables CSS.
    expect(leer('public', 'favicon.svg').toUpperCase()).toContain('#060F09');
  });
});

describe('§2.15 — indexación', () => {
  // Los dos ficheros viven en `frontend/public/` y los sirve nginx desde la
  // raíz. Están fuera de esta carpeta y aun así se comprueban desde aquí: el
  // dominio que declaran sale de `LANDING_URL`, y nada más en el repositorio
  // ata las tres cosas.
  it('robots.txt permite el rastreo y apunta al sitemap con el dominio vigente', () => {
    expect(ROBOTS).toMatch(/^User-agent: \*$/m);
    expect(ROBOTS).toMatch(/^Allow: \/$/m);
    expect(ROBOTS).toContain(`Sitemap: ${LANDING_URL}/sitemap.xml`);
  });

  it('el sitemap declara UNA url, la raíz del dominio', () => {
    const urls = SITEMAP.match(/<loc>([^<]+)<\/loc>/g) ?? [];
    expect(urls).toEqual([`<loc>${LANDING_URL}/</loc>`]);
  });

  it('ninguno de los dos declara la subruta de los assets', () => {
    // `/landing/` es una carpeta de ficheros con hash y una redirección 301,
    // no una página. Anunciarla sería pedir que se indexe un 301.
    expect(ROBOTS).not.toContain(BASE_LANDING);
    expect(SITEMAP).not.toContain(`<loc>${LANDING_URL}${BASE_LANDING}`);
  });
});

describe('§6 — los datos estructurados no inventan nada', () => {
  const bloque = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(SERVIDO)?.[1];

  const analizar = (): Record<string, unknown> =>
    JSON.parse(bloque ?? '') as Record<string, unknown>;

  it('el JSON-LD es JSON válido', () => {
    expect(bloque, 'no hay bloque de datos estructurados').toBeDefined();
    expect(analizar).not.toThrow();
  });

  it('describe la aplicación con la oferta verificada del apéndice', () => {
    const datos = analizar();
    expect(datos['@type']).toBe('SoftwareApplication');
    expect(datos.name).toBe('SPHERE');
    expect(datos.url).toBe(`${LANDING_URL}/`);

    const oferta = datos.offers as Record<string, unknown>;
    // 30 créditos gratis al mes, sin tarjeta: config.py:145-151 y auth.py:245-251.
    expect(oferta.price).toBe('0');
    expect(oferta.priceCurrency).toBe('EUR');
    expect(String(oferta.description)).toContain('30 créditos');
  });

  it('cero prueba social inventada: no existen reseñas, así que no se declaran', () => {
    expect(bloque).not.toMatch(/aggregateRating|reviewCount|ratingValue|review/i);
  });
});
