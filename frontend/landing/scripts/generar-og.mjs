/**
 * Generador one-off de los activos sociales — DIRECCION.md §5.5 / §2.15.
 *
 * Produce dos ficheros que se COMMITEAN (igual que el grano):
 *   · `public/og.png`         1200×630, la tarjeta que se ve al compartir el enlace.
 *   · `public/favicon-32.png` el fallback rasterizado del favicon SVG.
 *
 * POR QUÉ CHROMIUM Y NO `sharp` NI `resvg`
 * La composición lleva texto real en las DOS fuentes variables del proyecto, y
 * ahí las tres vías no son equivalentes:
 *   · `sharp` rasteriza SVG con librsvg, que compone el texto por fontconfig:
 *     ignora `@font-face` y se llevaría el trabajo a DejaVu sin avisar. Fuente
 *     fallback en la tarjeta social = defecto de §5.5.
 *   · `resvg` sí carga fuentes por fichero, pero sólo TTF/OTF: habría que
 *     descomprimir los woff2 antes, y aun así no interpola ejes variables como
 *     el navegador (`wdth 110` del wordmark se perdería).
 *   · Chromium ya estaba descargado para la verificación del checklist §8
 *     (13/14/15/16/19) y renderiza esto EXACTAMENTE igual que el navegador del
 *     visitante: mismas fuentes variables, mismo `oklch`, mismo `overlay` del
 *     grano. La tarjeta social se ve como se ve la página porque la pinta el
 *     mismo motor.
 * Coste: `playwright-core` en devDependencies (no descarga navegadores en
 * `install`, a diferencia de `playwright`; el binario se trae a mano una vez
 * con `pnpm dlx playwright@1.62.1 install chromium`).
 *
 * LAS FUENTES VAN EMBEBIDAS EN BASE64, NO POR RUTA
 * La plantilla se carga con `setContent`, así que su origen es `about:blank`:
 * cualquier `url(/fonts/...)` moriría por CORS y Chromium caería a la fuente
 * de sistema en silencio — el fallo exacto que este script existe para evitar.
 * Con `data:` no hay petición que bloquear. Lo mismo con el tile del grano.
 * Además el script NO se fía: comprueba `document.fonts.check()` de cada cara
 * usada y aborta si alguna no está, y mide los desbordes de cada bloque de
 * texto para que nada salga cortado.
 *
 * Determinista: sin aleatoriedad. El grano viene del tile ya commiteado
 * (`pnpm grano`). Misma entrada → mismo PNG.
 *
 * Uso:  pnpm og
 */

import { chromium } from 'playwright-core';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLICO = join(RAIZ, 'public');

const ANCHO = 1200;
const ALTO = 630;
const TECHO_OG = 400 * 1024; // og.png está fuera del critical path (§7), pero no es una excusa.

/** Los tokens que toca esta composición, copiados de `src/styles/index.css`. */
const TOKENS = `
  --baize-950: oklch(0.155 0.018 158);
  --ink-50:  oklch(0.985 0.004 95);
  --ink-300: oklch(0.805 0.010 95);
  --paper-50:  oklch(0.988 0.006 88);
  --paper-300: oklch(0.900 0.016 88);
  --graphite-900: oklch(0.245 0.016 158);
  --graphite-700: oklch(0.405 0.018 158);
  --brass-400: oklch(0.820 0.100 82);
  --brass-500: oklch(0.760 0.120 82);
  --brass-800: oklch(0.520 0.090 82);
  --aniline-500: oklch(0.600 0.200 300);
  --lamp: color-mix(in oklab, var(--brass-400) 12%, transparent);
`;

const enBase64 = (ruta, mime) =>
  `data:${mime};base64,${readFileSync(join(PUBLICO, ruta)).toString('base64')}`;

const ARCHIVO = enBase64('fonts/archivo-var.woff2', 'font/woff2');
const LITERATA = enBase64('fonts/literata-var.woff2', 'font/woff2');
const GRANO = enBase64('textures/baize-128.webp', 'image/webp');

/**
 * El sello de la mesa (§5.2): anillo + arco de la mesa con la muesca del
 * asiento que preside. Mismo trazado que `public/favicon.svg`.
 */
const MARCA = `
<svg viewBox="0 0 24 24" width="52" height="52" aria-hidden="true">
  <g fill="none" stroke="var(--brass-500)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 3A9 9 0 0 1 12 21A9 9 0 0 1 12 3Z"/>
    <path d="M17.313 13.424A5.5 5.5 0 0 1 13.423 17.313L13.087 16.057A4.2 4.2 0 0 1 10.913 16.057L10.577 17.313A5.5 5.5 0 0 1 6.687 13.424"/>
  </g>
</svg>`;

/**
 * El sello de acta (§5.4): activo pre-horneado, con el sangrado de tinta en las
 * irregularidades del propio trazado. Mismo que el `<symbol id="sello">` de
 * `index.html`; aquí se repite porque este script no lee el HTML de la página.
 */
const SELLO = `
<svg viewBox="0 0 96 96" width="128" height="128" aria-hidden="true" style="color: var(--aniline-500)">
  <defs><path id="renglon" fill="none" d="M48 14A34 34 0 1 1 47.99 14"/></defs>
  <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    <path stroke-width="3" d="M92.40 48.00A44.4 44.4 0 0 1 78.83 78.83A43.6 43.6 0 0 1 48.00 92.60A44.6 44.6 0 0 1 17.03 78.97A43.8 43.8 0 0 1 3.80 48.00A44.2 44.2 0 0 1 17.24 17.24A43.5 43.5 0 0 1 48.00 3.50A44.5 44.5 0 0 1 79.04 16.96A43.9 43.9 0 0 1 92.40 48.00Z"/>
    <circle stroke-width="1.2" cx="48" cy="48" r="31.5"/>
    <g transform="translate(48 48) scale(1.75) translate(-12 -12)" stroke-width="0.9">
      <path d="M17.313 13.424A5.5 5.5 0 0 1 13.423 17.313L13.087 16.057A4.2 4.2 0 0 1 10.913 16.057L10.577 17.313A5.5 5.5 0 0 1 6.687 13.424"/>
    </g>
  </g>
  <text transform="rotate(180 48 48)" fill="currentColor" font-family="Archivo" font-size="9.5" font-weight="600" letter-spacing="1.6">
    <textPath href="#renglon" startOffset="50%" text-anchor="middle">SPHERE · JUNTA · ACTA</textPath>
  </text>
</svg>`;

const CASILLA = `
<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" style="flex:none;margin-top:3px">
  <rect x="1.5" y="1.5" width="13" height="13" rx="2" fill="none" stroke="var(--graphite-700)" stroke-width="1.5"/>
  <path d="M4.2 8.4 6.9 11.1 11.9 5.4" fill="none" stroke="var(--brass-800)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const PLANTILLA_OG = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><style>
  @font-face { font-family: Archivo;  src: url(${ARCHIVO}) format("woff2-variations");  font-weight: 100 900; font-stretch: 62% 125%; }
  @font-face { font-family: Literata; src: url(${LITERATA}) format("woff2-variations"); font-weight: 100 900; }

  :root { ${TOKENS} }
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: ${ANCHO}px; height: ${ALTO}px; overflow: hidden; position: relative;
    background-color: var(--baize-950);
    background-image: url(${GRANO});
    background-repeat: repeat;
    background-blend-mode: overlay;
    -webkit-font-smoothing: antialiased;
  }
  /* La lámpara: mismo radial y mismo foco que \`body::before\` de la página. */
  body::before {
    content: ""; position: absolute; inset: 0;
    background: radial-gradient(120% 90% at 12% -8%, var(--lamp), transparent 60%);
  }

  .lienzo { position: relative; height: 100%; display: flex; align-items: stretch; }

  /* ─── Izquierda: el lockup arriba y el claim ───────────────────────────── */
  .columna {
    width: 660px; flex: none; padding: 64px 40px 64px 72px;
    display: flex; flex-direction: column; justify-content: space-between;
  }
  .lockup { display: flex; align-items: center; gap: 12px; }
  .wordmark {
    font-family: Archivo; font-weight: 600; font-stretch: 110%;
    font-size: 30px; letter-spacing: 0.14em; color: var(--ink-50);
  }
  .claim {
    font-family: Literata; font-weight: 600; font-size: 88px;
    line-height: 1.05; letter-spacing: -0.03em; color: var(--ink-50);
    font-variation-settings: "opsz" 72;
  }
  .pie {
    font-family: Archivo; font-weight: 500; font-size: 21px;
    letter-spacing: 0.02em; color: var(--ink-300);
  }

  /* ─── Derecha: la esquina de la hoja del acta, a sangre por dos lados ──── */
  /* La hoja se sale por la derecha y por abajo — de ella se ve una ESQUINA
     (§5.5). Lo que no se sale es su TEXTO: el ancho de contenido está atado a
     la variable --util, que termina 32px antes del borde del lienzo. */
  .hoja {
    --util: 428px;
    position: absolute; top: 80px; left: 700px; width: 540px; height: 550px;
    background: var(--paper-50);
    /* El bisel de 6px a 45° de la esquina superior izquierda (DESIGN.md §6),
       escalado a 12px porque aquí la hoja es el doble de grande. */
    clip-path: polygon(12px 0, 100% 0, 100% 100%, 0 100%, 0 12px);
    padding: 40px 0 0 40px; box-shadow: 0 24px 64px rgba(0,0,0,0.45);
  }
  .hoja__titulo {
    font-family: Literata; font-weight: 600; font-size: 30px; line-height: 1.2;
    letter-spacing: -0.015em; color: var(--graphite-900); max-width: var(--util);
  }
  .hoja__recuento {
    font-family: Archivo; font-weight: 600; font-size: 22px;
    font-variant-numeric: tabular-nums; letter-spacing: 0.02em;
    color: var(--graphite-700); margin-top: 20px; max-width: var(--util);
  }
  .hoja__filete { width: 108px; height: 2px; background: var(--brass-800); margin-top: 22px; }
  .hoja__pasos { margin-top: 22px; display: flex; flex-direction: column; gap: 12px; max-width: var(--util); }
  .hoja__paso {
    display: flex; gap: 10px; align-items: flex-start;
    font-family: Literata; font-size: 17px; line-height: 1.35; color: var(--graphite-900);
  }
  /* El sello se posiciona desde la IZQUIERDA de la hoja: anclarlo a la derecha
     lo empujaría con ella fuera del lienzo. Rota -8° porque un sello se estampa
     a mano; es el mismo activo pre-horneado de la página, no un filtro. */
  .hoja__sello { position: absolute; left: 250px; bottom: 128px; transform: rotate(-8deg); }
</style></head>
<body><div class="lienzo">
  <div class="columna">
    <div class="lockup" data-medir>${MARCA}<span class="wordmark">SPHERE</span></div>
    <h1 class="claim" data-medir>Deja de decidir solo.</h1>
    <p class="pie" data-medir>La junta directiva de IA</p>
  </div>
  <div class="hoja">
    <!-- 49&nbsp;€ va con espacio duro: sin él la línea rompe entre la cifra y el
         símbolo y el € se queda solo en un renglón. -->
    <div class="hoja__titulo" data-medir>Acta — Subida de precio a 49&nbsp;€</div>
    <div class="hoja__recuento" data-medir>SÍ 2 · COND 1 · NO 1</div>
    <div class="hoja__filete"></div>
    <div class="hoja__pasos">
      <div class="hoja__paso" data-medir>${CASILLA}<span>Anunciar el cambio con 60 días de aviso</span></div>
      <div class="hoja__paso" data-medir>${CASILLA}<span>Configurar el nuevo precio en Stripe</span></div>
      <div class="hoja__paso" data-medir>${CASILLA}<span>Modelar el impacto en MRR</span></div>
    </div>
    <div class="hoja__sello" data-medir>${SELLO}</div>
  </div>
</div></body></html>`;

const PLANTILLA_FAVICON = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  :root { ${TOKENS} }
  * { margin: 0; padding: 0; }
  body { width: 32px; height: 32px; overflow: hidden; }
  svg { display: block; }
</style></head><body>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32">
  <rect width="24" height="24" rx="2" fill="#060F09"/>
  <g fill="none" stroke="#D7A94F" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 3A9 9 0 0 1 12 21A9 9 0 0 1 12 3Z"/>
    <path d="M17.313 13.424A5.5 5.5 0 0 1 13.423 17.313L13.087 16.057A4.2 4.2 0 0 1 10.913 16.057L10.577 17.313A5.5 5.5 0 0 1 6.687 13.424"/>
  </g>
</svg>
</body></html>`;

/**
 * Las caras que la composición USA. Si alguna no está cargada, Chromium habría
 * pintado con la fuente de sistema y el activo saldría mal sin decir nada.
 */
const CARAS = ['600 88px Literata', '600 30px Archivo', '500 21px Archivo', '600 30px Literata'];

async function main() {
  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  const pagina = await navegador.newPage({
    viewport: { width: ANCHO, height: ALTO },
    deviceScaleFactor: 1,
  });

  await pagina.setContent(PLANTILLA_OG, { waitUntil: 'load' });
  await pagina.evaluate(() => document.fonts.ready);

  const sinCargar = await pagina.evaluate(
    (caras) => caras.filter((cara) => !document.fonts.check(cara)),
    CARAS,
  );
  if (sinCargar.length > 0) {
    console.error(`Fuente fallback en el activo social: ${sinCargar.join(', ')}`);
    process.exit(1);
  }

  /**
   * Nada de lo que se mide puede salir CORTADO. Se comprueban dos cosas
   * distintas, porque son dos defectos distintos:
   *
   *   1. Los rectángulos reales de las líneas de texto (vía `Range`, no la caja
   *      del elemento) caen dentro del lienzo. Es lo único que dice de verdad
   *      si una letra se está comiendo el borde: el lienzo SÍ recorta a
   *      1200×630, y la hoja se sale por dos lados a propósito.
   *   2. Ninguna palabra es más ancha que su caja (`scrollWidth`), que es como
   *      se rompe una composición cuando alguien toca el copy o el cuerpo.
   *
   * NO se compara `scrollHeight` con `clientHeight`: con `line-height` ceñido
   * (1.05 en el claim) el alto de tinta de la fuente desborda la caja de línea
   * por diseño tipográfico. Nadie lo recorta y medirlo sólo da falsos positivos.
   */
  const desbordes = await pagina.evaluate(() => {
    const fuera = [];
    const LIENZO = { ancho: window.innerWidth, alto: window.innerHeight };

    for (const nodo of document.querySelectorAll('[data-medir]')) {
      const nombre = nodo.className || nodo.tagName;

      const rango = document.createRange();
      rango.selectNodeContents(nodo);
      for (const r of rango.getClientRects()) {
        if (r.width === 0 || r.height === 0) continue;
        if (r.left < 0 || r.top < 0 || r.right > LIENZO.ancho || r.bottom > LIENZO.alto) {
          fuera.push(
            `${nombre}: una línea se sale del lienzo ` +
              `(x ${Math.round(r.left)}→${Math.round(r.right)} · y ${Math.round(r.top)}→${Math.round(r.bottom)})`,
          );
        }
      }

      if (nodo.scrollWidth > nodo.clientWidth + 1) {
        fuera.push(
          `${nombre}: una palabra es más ancha que su caja ` +
            `(${nodo.scrollWidth} > ${nodo.clientWidth})`,
        );
      }
    }

    /**
     * La leyenda circular del sello cabe ENTERA en su renglón.
     * SVG descarta sin avisar los glifos que se salen del trazado: así es como
     * el sello llegó a poner «HERE · JUNTA · ACTA» con el texto centrado al 25%
     * de un renglón que empezaba justo ahí. Se mide, no se mira.
     */
    const renglon = document.querySelector('#renglon');
    const leyenda = document.querySelector('textPath');
    if (!renglon || !leyenda) {
      fuera.push('sello: no hay leyenda que medir');
    } else {
      /* Y además se ve: un renglón cuyo centro cae fuera del viewBox dibuja la
         leyenda en otro sitio y el sello sale mudo, sin error de nadie. */
      const tinta = leyenda.parentElement.getBoundingClientRect();
      const caja = leyenda.closest('svg').getBoundingClientRect();
      if (tinta.width < 40 || tinta.height < 40) {
        fuera.push(`sello: la leyenda no se está dibujando (${Math.round(tinta.width)}×${Math.round(tinta.height)})`);
      }
      if (tinta.left < caja.left - 1 || tinta.right > caja.right + 1 ||
          tinta.top < caja.top - 1 || tinta.bottom > caja.bottom + 1) {
        fuera.push('sello: la leyenda se dibuja fuera de la caja del sello');
      }
    }
    if (renglon && leyenda) {
      const largoTexto = leyenda.getComputedTextLength();
      const largoRenglon = renglon.getTotalLength();
      const centro = (parseFloat(leyenda.getAttribute('startOffset')) / 100) * largoRenglon;
      const inicio = centro - largoTexto / 2;
      const fin = centro + largoTexto / 2;
      if (inicio < 0 || fin > largoRenglon) {
        fuera.push(
          `sello: la leyenda no cabe en su renglón y perdería letras ` +
            `(ocupa ${inicio.toFixed(1)}→${fin.toFixed(1)} de 0→${largoRenglon.toFixed(1)})`,
        );
      }
    }

    return fuera;
  });
  if (desbordes.length > 0) {
    console.error(`Texto cortado en og.png:\n  ${desbordes.join('\n  ')}`);
    process.exit(1);
  }

  await pagina.screenshot({ path: join(PUBLICO, 'og.png'), type: 'png' });

  await pagina.setViewportSize({ width: 32, height: 32 });
  await pagina.setContent(PLANTILLA_FAVICON, { waitUntil: 'load' });
  await pagina.screenshot({ path: join(PUBLICO, 'favicon-32.png'), type: 'png' });

  await navegador.close();

  const og = statSync(join(PUBLICO, 'og.png')).size;
  const favicon = statSync(join(PUBLICO, 'favicon-32.png')).size;
  console.log(`og.png — ${og} B (techo ${TECHO_OG} B) · favicon-32.png — ${favicon} B`);
  if (og > TECHO_OG) {
    console.error('og.png supera el techo. Simplifica la composición.');
    process.exit(1);
  }
}

await main();
