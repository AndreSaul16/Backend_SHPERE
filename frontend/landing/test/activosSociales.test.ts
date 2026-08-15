/**
 * Los activos sociales de DIRECCION.md §5.5 / §2.15 y el sello que comparten.
 *
 * POR QUÉ ESTE TEST EXISTE
 * `og.png` se genera a mano (`pnpm og`) y se commitea, así que nadie vuelve a
 * mirarlo: es exactamente el tipo de activo que se pudre en silencio. Y el
 * sello está escrito DOS veces —el `<symbol>` de `index.html` y la plantilla de
 * `scripts/generar-og.mjs`— porque el script compone una página aparte y no
 * puede leer el HTML sin arrastrar todo el documento. Duplicación consciente,
 * pero duplicación: si una copia se corrige y la otra no, la tarjeta social y
 * la página enseñan sellos distintos y nadie se entera hasta que alguien
 * comparte el enlace.
 *
 * Los dos fallos que motivaron las guardas (los dos, mudos):
 *   · Con la leyenda a r=40, el anillo exterior (r≈44, grosor 3) la partía por
 *     la mitad a todos los tamaños.
 *   · Con `startOffset="25%"` sobre un renglón que arranca justo ahí, media
 *     leyenda caía antes del inicio del trazado y SVG descarta esos glifos sin
 *     decir nada: el sello ponía «HERE · JUNTA · ACTA».
 * La geometría se comprueba aquí; que se VEA lo comprueba `pnpm og`, que mide
 * la leyenda en el navegador antes de escribir el PNG.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

const INDEX = readFileSync(join(RAIZ, 'index.html'), 'utf8');
const GENERADOR = readFileSync(join(RAIZ, 'scripts', 'generar-og.mjs'), 'utf8');

/** Ancho y alto de un PNG, leídos de su cabecera IHDR (offsets 16 y 20). */
function medidasPNG(ruta: string): { ancho: number; alto: number } {
  const bytes = readFileSync(join(RAIZ, 'public', ruta));
  expect(bytes.subarray(1, 4).toString('ascii'), `${ruta} no es un PNG`).toBe('PNG');
  return { ancho: bytes.readUInt32BE(16), alto: bytes.readUInt32BE(20) };
}

describe('§5.5 — los activos sociales están y miden lo que dicen los metadatos', () => {
  it('og.png es de 1200×630', () => {
    expect(medidasPNG('og.png')).toEqual({ ancho: 1200, alto: 630 });
  });

  it('favicon-32.png es de 32×32', () => {
    expect(medidasPNG('favicon-32.png')).toEqual({ ancho: 32, alto: 32 });
  });

  it('index.html declara las medidas que el fichero tiene de verdad', () => {
    const { ancho, alto } = medidasPNG('og.png');
    expect(INDEX).toContain(`<meta property="og:image:width" content="${ancho}">`);
    expect(INDEX).toContain(`<meta property="og:image:height" content="${alto}">`);
  });
});

describe('§5.4 — el sello: una sola geometría en sus dos copias', () => {
  /** El renglón, el círculo interior y el desplazamiento de la leyenda. */
  const geometria = (fuente: string) => ({
    renglon: /id="(?:sello-)?renglon" fill="none" d="([^"]+)"/.exec(fuente)?.[1],
    interior: /<circle stroke-width="1\.2" cx="48" cy="48" r="([\d.]+)"/.exec(fuente)?.[1],
    giro: /<text transform="(rotate\([^)]+\))"/.exec(fuente)?.[1],
    desplazamiento: /<textPath[^>]*startOffset="([^"]+)"/.exec(fuente)?.[1],
    leyenda: /<textPath[^>]*>([^<]+)<\/textPath>/.exec(fuente)?.[1],
  });

  const enLaPagina = geometria(INDEX);
  const enElGenerador = geometria(GENERADOR);

  it('index.html y scripts/generar-og.mjs dibujan el mismo sello', () => {
    expect(enElGenerador).toEqual(enLaPagina);
  });

  it('la leyenda es la de §5.4', () => {
    expect(enLaPagina.leyenda).toBe('SPHERE · JUNTA · ACTA');
  });

  it('el renglón cabe dentro del anillo exterior y no lo toca', () => {
    // El anillo exterior está a r≈44 con grosor 3 → su borde interior, en 42.5.
    // Las letras crecen HACIA FUERA desde la línea base, así que el renglón más
    // el alto de mayúscula (~0.72em de 9.5) tiene que quedarse por debajo.
    const radio = Number(/A([\d.]+) /.exec(enLaPagina.renglon ?? '')?.[1]);
    expect(radio, 'el renglón ya no es un arco circular reconocible').toBeGreaterThan(0);
    expect(radio + 9.5 * 0.72).toBeLessThan(42.5);
    expect(radio, 'el renglón se ha metido dentro del círculo interior').toBeGreaterThan(
      Number(enLaPagina.interior),
    );
  });

  it('la leyenda se centra donde cabe entera, y el texto se gira para subirla', () => {
    // Centrada al 50% del renglón ocupa 16%→84% y no pierde un solo glifo. El
    // giro de 180° la lleva del arco inferior al superior, ya derecha.
    expect(enLaPagina.desplazamiento).toBe('50%');
    expect(enLaPagina.giro).toBe('rotate(180 48 48)');
  });

  it('el renglón arranca ARRIBA: empezando abajo, su centro se va fuera del viewBox', () => {
    // Con large-arc == sweep == 1 y los dos extremos casi pegados, el centro se
    // resuelve al lado contrario del arranque. Arrancando en (48,82) sale en
    // (48,116) y la leyenda se dibuja fuera del sello, invisible.
    expect(enLaPagina.renglon).toMatch(/^M48 14A/);
  });
});
