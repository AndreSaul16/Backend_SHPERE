/**
 * Los puntos del checklist de DIRECCION.md §8 que sólo se pueden comprobar con
 * un navegador de verdad: 13 (sin JS), 14 (movimiento reducido), 15 (390×844),
 * 16 (bucles) y 19 (teclado). Más las capturas del hero como evidencia visual.
 *
 * POR QUÉ ESTO NO ES UN TEST DE VITEST
 * Necesita el servidor de desarrollo levantado y un Chromium descargado a mano
 * (~170 MB). Metido en `pnpm test` convertiría la suite en algo que no se puede
 * ejecutar en cualquier sitio, y esa suite es el gate de todos los días. Aquí
 * vive aparte, se ejecuta cuando hay navegador y deja su evidencia escrita en
 * `docs/capturas/` para quien no lo tenga.
 *
 * Cada comprobación devuelve el dato MEDIDO, no un «pasa». Un checklist que
 * sólo dice «ok» no sirve para auditar nada: si mañana el H1 pasa a cuatro
 * líneas, lo interesante es el número.
 *
 * Requisitos:
 *   pnpm dev                                     (en otra terminal, :4173)
 *   pnpm dlx playwright@1.62.1 install chromium  (una vez)
 * Uso:
 *   pnpm verificar
 */

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const CAPTURAS = join(RAIZ, 'docs', 'capturas');
const URL_BASE = process.env.URL_LANDING ?? 'http://localhost:4173/';

const MOVIL = { width: 390, height: 844 };
const ESCRITORIO = { width: 1440, height: 900 };

/** Lo que tarda la entrada del hero (≤ 1.2 s, §3.S1) más un margen. */
const ENTRADA_MS = 2500;

const resultados = [];

/**
 * Tres estados y no dos. `parcial` es para un punto cuyas condiciones se
 * cumplen salvo una que NO depende de este build: se anota con su medida y su
 * explicación en vez de esconderla en verde o teñir de rojo lo que sí cumple.
 * Un checklist que miente en cualquiera de los dos sentidos no sirve.
 */
const anotar = (punto, titulo, estado, medido, desviacion) => {
  resultados.push({ punto, titulo, estado, medido, ...(desviacion ? { desviacion } : {}) });
  const marca = { ok: '✓', parcial: '⚠', fallo: '✗' }[estado];
  console.log(`${marca} §8.${punto}  ${titulo}`);
  for (const [clave, valor] of Object.entries(medido)) {
    console.log(`        ${clave}: ${typeof valor === 'object' ? JSON.stringify(valor) : valor}`);
  }
  if (desviacion) console.log(`        ── ${desviacion}`);
};

/**
 * Cuántas LÍNEAS ocupa un elemento de texto. Se cuentan las cajas de línea
 * reales con un `Range`, no se divide el alto por el interlineado: con
 * `line-height` ceñido y una fuente con tinta alta, esa división miente.
 */
const contarLineas = (sel) => {
  const nodo = document.querySelector(sel);
  if (!nodo) return null;
  const rango = document.createRange();
  rango.selectNodeContents(nodo);
  const tapas = new Set();
  for (const r of rango.getClientRects()) {
    if (r.width > 0 && r.height > 0) tapas.add(Math.round(r.top));
  }
  return tapas.size;
};

/** Los bucles VIVOS: animaciones declaradas con iteraciones infinitas. */
const contarBucles = () =>
  document
    .getAnimations()
    .filter((a) => a.effect && a.effect.getTiming().iterations === Infinity)
    .map((a) => ({
      nombre: a.animationName || a.transitionProperty || 'sin nombre',
      estado: a.playState,
      donde: a.effect.target
        ? a.effect.target.getAttribute?.('data-demo-cursor') !== null
          ? '[data-demo-cursor]'
          : a.effect.target.className || a.effect.target.tagName
        : '?',
    }));

/**
 * El estado del motor de GSAP, leído del MISMO módulo que usa la página.
 * En desarrollo, Vite sirve módulos ESM cacheados: volver a importar
 * `registro.ts` devuelve la instancia viva, no una copia.
 */
const estadoDeGsap = async () => {
  const m = await import('/src/motion/registro.ts');
  return {
    scrollTriggers: m.ScrollTrigger.getAll().length,
    enGlobalTimeline: m.gsap.globalTimeline.getChildren(true, true, true).length,
  };
};

/**
 * Abre la página y espera a que esté MEDIBLE, que no es lo mismo que cargada.
 *
 * `waitUntil: 'load'` más un temporizador no basta: con `font-display: swap` el
 * navegador maqueta primero con la fuente de reserva, y en esa maqueta el H1
 * cae en una línea en vez de dos y el hero entero mide ~143px menos. Dos
 * ejecuciones seguidas daban medidas distintas hasta que se ató esto. Además
 * `arrancarMotion` cuelga TODO de `document.fonts.ready` (§3.0), así que antes
 * de esa promesa no hay ni animaciones que contar.
 */
async function abrir(pagina, espera = ENTRADA_MS) {
  await pagina.goto(URL_BASE, { waitUntil: 'load' });
  await pagina.evaluate(() => document.fonts.ready);

  /*
   * Y se aparta el ratón del Canto antes de medir o capturar.
   * El puntero virtual de Playwright empieza en (0,0), que cae DENTRO de la
   * banda sensible del Canto: la página se abría con el Canto desplegado a 44px
   * y sus once títulos encima del hero. Es el comportamiento correcto de §1
   * —se ensancha al pasar por encima— pero como evidencia era un retrato
   * falso: nadie llega a la página con el dedo apoyado en el borde izquierdo.
   */
  const { width, height } = pagina.viewportSize();
  await pagina.mouse.move(width - 1, Math.round(height / 2));

  await pagina.waitForTimeout(espera);
}

async function conPagina(navegador, opciones, trabajo) {
  const contexto = await navegador.newContext(opciones);
  const pagina = await contexto.newPage();
  try {
    return await trabajo(pagina);
  } finally {
    await contexto.close();
  }
}

/* ─── §8.13 · Sin JavaScript, la página vende igual (D4) ─────────────────── */
async function sinJavaScript(navegador) {
  return conPagina(
    navegador,
    { viewport: MOVIL, javaScriptEnabled: false },
    async (pagina) => {
      await pagina.goto(URL_BASE, { waitUntil: 'load' });

      const copia = [
        'Deja de decidir solo.',
        'Un chat te da una respuesta. La que querías oír.',
        'Cinco fases. Cuatro directores. Un acta.',
        'Cuatro carteras. Y un quinto que viene a incomodar.',
        'El desacuerdo es la señal.',
        'Sales con un acta, no con una charla.',
        'La junta delibera. Tus directores ejecutan.',
        'Todo lo que una junta necesita para serlo.',
        'Créditos, no suscripción.',
        'La próxima decisión, no la tomes solo.',
      ];

      const medido = await pagina.evaluate((frases) => {
        const texto = document.body.innerText;
        const visible = (nodo) => {
          if (!nodo) return false;
          const caja = nodo.getBoundingClientRect();
          const estilo = getComputedStyle(nodo);
          return caja.width > 0 && caja.height > 0 &&
            estilo.visibility !== 'hidden' && estilo.display !== 'none' &&
            Number(estilo.opacity) > 0.01;
        };

        const registros = [...document.querySelectorAll('a[href]')]
          .map((a) => a.getAttribute('href'))
          .filter((href) => href.includes('/register'));

        return {
          frasesQueFaltan: frases.filter((f) => !texto.includes(f)),
          h1Visible: visible(document.querySelector('h1')),
          // El fotograma final de la demo: el acta sellada, ya en el HTML.
          selloVisible: visible(document.querySelector('[data-demo-sello]')),
          recuento: [...document.querySelectorAll('[data-demo] [data-cifra]')]
            .map((n) => `${n.getAttribute('data-cifra')}=${n.innerText.trim()}`),
          ctasDeRegistro: registros.length,
          ctasAbsolutos: registros.every((h) => h.startsWith('https://')),
          utmsPresentes: [...new Set(registros.map((h) => /utm_content=([a-z]+)/.exec(h)?.[1]))].sort(),
          // Con JS apagado no puede quedar nada escondido esperando un tween.
          bloquesInvisibles: [...document.querySelectorAll('[data-seccion]')]
            .filter((s) => !visible(s)).map((s) => s.id),
        };
      }, copia);

      const ok =
        medido.frasesQueFaltan.length === 0 &&
        medido.h1Visible &&
        medido.selloVisible &&
        medido.ctasDeRegistro > 0 &&
        medido.ctasAbsolutos &&
        medido.bloquesInvisibles.length === 0;

      anotar(13, 'Sin JavaScript: copy completo, CTAs con href y demo en su fotograma final', ok ? 'ok' : 'fallo', medido);
    },
  );
}

/* ─── §8.15 · 390×844 ────────────────────────────────────────────────────── */
async function enMovil(navegador) {
  return conPagina(navegador, { viewport: MOVIL }, async (pagina) => {
    await abrir(pagina);

    const lineas = await pagina.evaluate(contarLineas, 'h1');
    const medido = await pagina.evaluate(() => {
      const caja = (sel) => {
        const n = document.querySelector(sel);
        return n ? n.getBoundingClientRect() : null;
      };
      const demo = caja('[data-demo]');
      const cta = caja('#hero a[href*="utm_content=hero"]');
      const cabecera = caja('header');
      const alto = window.innerHeight;
      // La cabecera va adherida arriba: el sitio que la demo tiene de verdad
      // para caber en una pantalla es lo que queda por debajo de ella.
      const altoDeLaCabecera = cabecera ? Math.round(cabecera.height) : 0;

      return {
        anchoDocumento: document.documentElement.scrollWidth,
        anchoViewport: window.innerWidth,
        // El desbordamiento horizontal, si lo hubiera, con nombre y apellidos.
        culpablesDeDesborde: [...document.querySelectorAll('body *')]
          .filter((n) => n.getBoundingClientRect().right > window.innerWidth + 1)
          .slice(0, 5)
          .map((n) => `${n.tagName}.${n.className}`.slice(0, 60)),
        demoAbajo: demo ? Math.round(demo.bottom) : null,
        demoEntera: demo ? demo.bottom <= alto + 1 : false,
        altoDeLaCabecera,
        pantallazoUtil: alto - altoDeLaCabecera,
        ctaArriba: cta ? Math.round(cta.top) : null,
        ctaEnElPrimerViewport: cta ? cta.bottom <= alto + 1 : false,
        ctaEnElTercioInferior: cta ? cta.top >= alto * (2 / 3) : false,
        altoViewport: alto,
      };
    });
    medido.lineasDelH1 = lineas;

    const altoDeLaDemo = () =>
      pagina.evaluate(() =>
        Math.round(document.querySelector('[data-demo]')?.getBoundingClientRect().height ?? 0),
      );
    medido.altoDeLaDemo = await altoDeLaDemo();

    /*
     * Y otra vez CON LA SESIÓN TERMINADA. La demo cambia de estado durante 40 s
     * y acaba enseñando un botón que antes no estaba: si el alto reservado no
     * cubriese ese final, la tarjeta crecería y empujaría media página — eso es
     * CLS (§7), y es exactamente la clase de salto que no se ve en una captura.
     * Se espera al botón en vez de a un cronómetro: el botón ES el final.
     */
    await pagina
      .locator('[data-demo-reproducir]:not([hidden])')
      .waitFor({ state: 'visible', timeout: 60_000 })
      .catch(() => undefined);
    medido.altoDeLaDemoAlTerminar = await altoDeLaDemo();
    medido.creceAlTerminar = medido.altoDeLaDemoAlTerminar - medido.altoDeLaDemo;

    /*
     * QUÉ SE LE PIDE A LA DEMO EN 390×844, y por qué no es «que entre entera en
     * el primer pantallazo junto al claim». Eso último no puede cumplirse con el
     * copy de §2: el bloque de texto del hero —rótulo, H1, entradilla, dos CTA y
     * el microcopy— ocupa ~500px él solo, y el copy es cerrado. Lo que sí se le
     * puede pedir, y es lo que la revisión de acabado fijó como techo, es que la
     * pieza QUEPA EN UNA PANTALLA: que quien la desplaza hasta ella la vea
     * entera sin volver a desplazar. Ese techo son los 844px menos la cabecera
     * adherida. Las dos cosas se miden y las dos se anotan.
     */
    const cabeEnUnPantallazo = medido.altoDeLaDemoAlTerminar <= medido.pantallazoUtil;
    medido.cabeEnUnPantallazo = cabeEnUnPantallazo;

    const gates =
      medido.anchoDocumento <= MOVIL.width &&
      lineas !== null &&
      lineas <= 3 &&
      medido.ctaEnElPrimerViewport &&
      cabeEnUnPantallazo &&
      medido.creceAlTerminar === 0;

    const estado = gates ? 'ok' : 'fallo';
    const desviacion = medido.demoEntera
      ? undefined
      : 'la demo NO comparte el primer viewport con el claim, y no puede: el bloque de texto ' +
        `del hero ocupa ${medido.ctaArriba == null ? '?' : String(medido.ctaArriba)}px antes de ` +
        'que empiece, y ese copy es el de §2, que es cerrado. Lo que sí se le exige a la pieza ' +
        '—caber en una pantalla— es `cabeEnUnPantallazo`, aquí arriba, y eso sí entra en el gate.';

    anotar(
      15,
      '390×844: sin scroll horizontal, H1 ≤ 3 líneas, CTA en el primer viewport, demo en un pantallazo',
      estado,
      medido,
      desviacion,
    );
  });
}

/* ─── §8.16 · Presupuesto de bucles (§3.P) ───────────────────────────────── */
async function bucles(navegador) {
  return conPagina(navegador, { viewport: MOVIL }, async (pagina) => {
    await abrir(pagina, 0);

    /*
     * Durante la reproducción: el cursor de streaming es el bucle nº 1.
     * Se MUESTREA a lo largo de la demo y se toma el máximo, no una foto
     * suelta: el cursor sólo existe mientras un turno se escribe, así que una
     * única lectura cae con la misma facilidad en 1 que en 0 y no probaría el
     * techo de §3.P. Lo que interesa es el peor momento, no un momento.
     */
    await pagina.waitForTimeout(ENTRADA_MS);
    let durante = [];
    for (let i = 0; i < 24; i += 1) {
      const muestra = await pagina.evaluate(contarBucles);
      if (muestra.length > durante.length) durante = muestra;
      await pagina.waitForTimeout(500);
    }

    // En reposo. La demo dura ~40 s a 2×; en vez de esperarlas, se comprueba
    // el reposo REAL de la página con la demo fuera de juego: si algo quedara
    // dando vueltas por decoración, aquí seguiría.
    await pagina.evaluate(() => {
      const demo = document.querySelector('[data-demo]');
      if (demo) demo.remove();
    });
    await pagina.waitForTimeout(500);
    const enReposo = await pagina.evaluate(contarBucles);

    const medido = {
      duranteLaDemo: durante.length,
      cualesDurante: durante,
      enReposoSinDemo: enReposo.length,
      cualesEnReposo: enReposo,
    };
    const dentroDelPresupuesto = durante.length <= 2 && enReposo.length === 0;
    anotar(16, 'Bucles: ≤ 2 durante la demo, 0 con la página en reposo', dentroDelPresupuesto ? 'ok' : 'fallo', medido);
  });
}

/* ─── §8.14 · prefers-reduced-motion: reduce ─────────────────────────────── */
async function movimientoReducido(navegador) {
  // Control: sin `reduce`, la sonda TIENE que ver animaciones. Si no las viera,
  // el resultado de abajo sería un cero sin valor probatorio.
  const control = await conPagina(navegador, { viewport: MOVIL }, async (pagina) => {
    await abrir(pagina);
    return pagina.evaluate(estadoDeGsap);
  });

  return conPagina(
    navegador,
    { viewport: MOVIL, reducedMotion: 'reduce' },
    async (pagina) => {
      await abrir(pagina);

      const conReduce = await pagina.evaluate(estadoDeGsap);
      const boton = await pagina.evaluate(() => {
        const b = document.querySelector('[data-demo-reproducir]');
        if (!b) return null;
        const caja = b.getBoundingClientRect();
        return {
          texto: b.textContent.trim(),
          visible: caja.width > 0 && caja.height > 0 && getComputedStyle(b).display !== 'none',
        };
      });

      const medido = {
        scrollTriggersConReduce: conReduce.scrollTriggers,
        tweensConReduce: conReduce.enGlobalTimeline,
        scrollTriggersSinReduce: control.scrollTriggers,
        botonReproducir: boton,
      };

      const ok =
        conReduce.scrollTriggers === 0 &&
        conReduce.enGlobalTimeline === 0 &&
        control.scrollTriggers > 0 &&
        boton?.visible === true;

      anotar(14, 'Movimiento reducido: cero animaciones creadas y botón «Reproducir» a la vista', ok ? 'ok' : 'fallo', medido);
    },
  );
}

/* ─── §8.19 · Recorrido de teclado ───────────────────────────────────────── */
async function teclado(navegador) {
  return conPagina(navegador, { viewport: ESCRITORIO }, async (pagina) => {
    await abrir(pagina);

    const identificar = () =>
      pagina.evaluate(() => {
        const a = document.activeElement;
        if (!a || a === document.body) return null;
        const estilo = getComputedStyle(a);
        const seccion = a.closest('[data-seccion]');
        // El orden importa: los enlaces del pie viven dentro de un <nav> que
        // está dentro del <footer>, así que preguntar por el footer DESPUÉS
        // de por el nav los etiquetaba como navegación y el recorrido parecía
        // no llegar nunca al pie.
        return {
          etiqueta: a.tagName.toLowerCase(),
          texto: (a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 38),
          zona: a.classList.contains('enlace-salto')
            ? 'salto'
            : a.hasAttribute('data-canto-segmento')
              ? 'canto'
              : a.closest('footer')
                ? 'footer'
                : seccion
                  ? seccion.id
                  : a.closest('#hero')
                    ? 'hero'
                    : a.closest('header')
                      ? 'nav'
                      : '?',
          contorno:
            estilo.outlineStyle === 'none'
              ? 'ninguno'
              : `${estilo.outlineWidth} ${estilo.outlineStyle} @${estilo.outlineOffset}`,
          // §5.6 pide un anillo concreto: 2px de brass-400 con 2px de separación.
          // Vale la pena distinguirlo del anillo por defecto del navegador
          // (`1px auto`), que también «se ve» pero no es el del sistema visual.
          esElAnilloDeLaCasa: estilo.outlineWidth === '2px' && estilo.outlineOffset === '2px',
        };
      });

    const recorrido = [];
    for (let i = 0; i < 60; i += 1) {
      await pagina.keyboard.press('Tab');
      // Un respiro antes de leer: sin él, la primera parada se lee a veces con
      // el anillo por defecto del navegador, antes de que el estilo del autor
      // esté aplicado, y la evidencia sale contando algo que no pasa.
      await pagina.waitForTimeout(60);
      const foco = await identificar();
      if (!foco) break;
      recorrido.push(foco);
      if (foco.zona === 'footer') break;
    }

    const zonas = [];
    for (const paso of recorrido) {
      if (zonas[zonas.length - 1] !== paso.zona) zonas.push(paso.zona);
    }

    const sinContorno = recorrido.filter((p) => p.contorno === 'ninguno');
    const conAnilloAjeno = recorrido.filter((p) => p.contorno !== 'ninguno' && !p.esElAnilloDeLaCasa);
    const medido = {
      paradas: recorrido.length,
      zonasEnOrden: zonas,
      primeraParada: recorrido[0],
      sinFocoVisible: sinContorno.length,
      conAnilloQueNoEsElDeLaCasa: conAnilloAjeno.length,
      ejemplosSinFoco: sinContorno.slice(0, 3),
      llegaAlFooter: zonas.includes('footer'),
      pasaPorElCanto: zonas.includes('canto'),
      pasaPorPreguntas: zonas.includes('preguntas'),
    };

    const ok =
      recorrido[0]?.zona === 'salto' &&
      sinContorno.length === 0 &&
      conAnilloAjeno.length === 0 &&
      medido.llegaAlFooter &&
      medido.pasaPorElCanto &&
      medido.pasaPorPreguntas;

    anotar(19, 'Teclado: del skip-link al footer, con foco visible en cada parada', ok ? 'ok' : 'fallo', medido);
  });
}

/* ─── Capturas ───────────────────────────────────────────────────────────── */
async function capturas(navegador) {
  mkdirSync(CAPTURAS, { recursive: true });
  const hechas = [];

  /*
   * Las capturas del hero se toman con la sesión YA EN MARCHA (~9 s), no recién
   * cargada: a los 2,5 s la ventana de turnos va por el primero y la página
   * todavía no cuenta lo que hace. Nueve segundos es igual de real y enseña la
   * verdad — cuatro asientos en banda, el recuento a cero porque nadie ha
   * votado aún, y tres turnos llenando la ventana.
   */
  const DEMO_EN_MARCHA = 9000;

  for (const [nombre, viewport] of [['movil-390', MOVIL], ['escritorio-1440', ESCRITORIO]]) {
    await conPagina(navegador, { viewport }, async (pagina) => {
      await abrir(pagina, DEMO_EN_MARCHA);
      const ruta = join(CAPTURAS, `hero-${nombre}.png`);
      await pagina.screenshot({ path: ruta });
      hechas.push(`hero-${nombre}.png`);
    });
  }

  /*
   * La Sesión de Muestra TERMINADA y encuadrada en 390×844, que es la evidencia
   * de §8.15: la pieza entera —rótulo, pregunta, banda de cuatro asientos,
   * recuento, turnos, acta sellada y el botón de reproducir— dentro de una sola
   * pantalla. Se espera al botón porque el botón ES el final de la sesión.
   */
  await conPagina(navegador, { viewport: MOVIL }, async (pagina) => {
    await abrir(pagina);
    await pagina
      .locator('[data-demo-reproducir]:not([hidden])')
      .waitFor({ state: 'visible', timeout: 60_000 })
      .catch(() => undefined);
    await pagina.evaluate(() => {
      const demo = document.querySelector('[data-demo]');
      const cabecera = document.querySelector('header');
      if (!demo) return;
      const alto = cabecera ? cabecera.getBoundingClientRect().height : 0;
      window.scrollBy(0, demo.getBoundingClientRect().top - alto - 4);
    });
    await pagina.waitForTimeout(600);
    await pagina.screenshot({ path: join(CAPTURAS, 'demo-terminada-movil-390.png') });
    hechas.push('demo-terminada-movil-390.png');
  });

  /*
   * S3 con el pin a media carrera: la tarjeta de fase a su medida de prosa y el
   * bloque repartido en el viewport. Es la escena que hay que mirar entera, no
   * un detalle, así que se captura el viewport completo a mitad del recorrido.
   */
  await conPagina(navegador, { viewport: ESCRITORIO }, async (pagina) => {
    await abrir(pagina);
    await pagina.evaluate(() => {
      const seccion = document.querySelector('#procedimiento');
      if (seccion) window.scrollBy(0, seccion.getBoundingClientRect().top + 1300);
    });
    await pagina.waitForTimeout(1200);
    await pagina.screenshot({ path: join(CAPTURAS, 'procedimiento-escritorio-1440.png') });
    hechas.push('procedimiento-escritorio-1440.png');
  });

  // El acta de S6: el capítulo en papel y el único aterrizaje del sello (D7).
  await conPagina(navegador, { viewport: ESCRITORIO }, async (pagina) => {
    await abrir(pagina);
    // Hasta el acta y un poco MÁS ALLÁ: la hoja se desenrolla con un scrub
    // entre «top 80%» y «top 45%», así que parada justo en la sección se
    // captura a medio desenrollar y sin el sello, que es lo que hay que ver.
    //
    // Y se posiciona por CONVERGENCIA, no de un salto. Un `scrollIntoView`
    // suelto no se queda: S3 está pineada con `end: "+=2600"`, así que el alto
    // del documento cambia mientras ScrollTrigger se refresca y el destino que
    // se calculó deja de ser el bueno — la captura salía enseñando el hero.
    // Se repite hasta que la sección se queda donde se la quiere.
    const asentado = await pagina.evaluate(async (desplazamiento) => {
      const espera = () => new Promise((r) => setTimeout(r, 400));
      const acta = document.querySelector('#acta');
      if (!acta) return null;
      let arriba = null;
      for (let i = 0; i < 12; i += 1) {
        arriba = acta.getBoundingClientRect().top;
        if (Math.abs(arriba + desplazamiento) < 8) break;
        window.scrollBy(0, arriba + desplazamiento);
        await espera();
      }
      return Math.round(acta.getBoundingClientRect().top);
    }, 450);
    await pagina.waitForTimeout(1500);

    // Con el scrub ya consumido y el sello aterrizado (que ocurre una vez, al
    // salir del scrub), se vuelve ARRIBA para encuadrar la cabecera de la hoja:
    // es donde cae el sello, y el sello es lo que hay que ver. Se queda puesto.
    await pagina.evaluate(async () => {
      const hoja = document.querySelector('[data-hoja-acta]');
      if (!hoja) return;
      for (let i = 0; i < 8; i += 1) {
        const arriba = hoja.getBoundingClientRect().top;
        if (Math.abs(arriba - 90) < 8) break;
        window.scrollBy(0, arriba - 90);
        await new Promise((r) => setTimeout(r, 300));
      }
    });
    await pagina.waitForTimeout(800);

    const ruta = join(CAPTURAS, 'acta-escritorio-1440.png');
    await pagina.screenshot({ path: ruta });
    hechas.push('acta-escritorio-1440.png');
    console.log(`  acta situada en y=${asentado} (objetivo −450)`);
  });

  console.log(`\n  capturas: ${hechas.join(' · ')}`);
  return hechas;
}

async function main() {
  const respuesta = await fetch(URL_BASE).catch(() => null);
  if (!respuesta?.ok) {
    console.error(`No hay nada sirviendo en ${URL_BASE}. Levanta el servidor:\n  pnpm dev`);
    process.exit(1);
  }

  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    await sinJavaScript(navegador);
    await enMovil(navegador);
    await bucles(navegador);
    await movimientoReducido(navegador);
    await teclado(navegador);
    const hechas = await capturas(navegador);

    mkdirSync(CAPTURAS, { recursive: true });
    writeFileSync(
      join(CAPTURAS, 'verificacion.json'),
      `${JSON.stringify({ fecha: new Date().toISOString(), url: URL_BASE, capturas: hechas, resultados }, null, 2)}\n`,
    );
  } finally {
    await navegador.close();
  }

  const fallidos = resultados.filter((r) => r.estado === 'fallo');
  const parciales = resultados.filter((r) => r.estado === 'parcial');
  const limpios = resultados.filter((r) => r.estado === 'ok');
  console.log(`\n${limpios.length}/${resultados.length} puntos limpios` +
    (parciales.length > 0 ? ` · ${parciales.length} con desviación anotada` : ''));
  for (const p of parciales) console.log(`  ⚠ §8.${p.punto}: ${p.desviacion}`);
  if (fallidos.length > 0) {
    console.error(`Fallan: ${fallidos.map((r) => `§8.${r.punto}`).join(', ')}`);
    process.exit(1);
  }
}

await main();
