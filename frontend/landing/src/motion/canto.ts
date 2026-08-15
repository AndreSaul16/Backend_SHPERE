/**
 * El Canto — DIRECCION.md §1 (con su enmienda del build 2) y §3.C / DESIGN.md §8.4.
 *
 * El filamento de 3px del borde izquierdo es la navegación de la página: un
 * segmento por sección, cada uno un `<a href="#id">` real. Por eso funciona sin
 * una línea de JavaScript y por eso el teclado lo recorre.
 *
 * Este módulo añade tres cosas que no pueden ser HTML, y sólo tres:
 *
 *   1. El cursor de latón, SOLO si el navegador no sabe `animation-timeline`.
 *      Donde sí lo sabe (la firma y el caso mayoritario), el cursor corre en
 *      CSS fuera del hilo principal y aquí no se monta nada.
 *   2. El `aria-current` del segmento vivo.
 *   3. La etiqueta flotante de la pulsación larga, que es la lectura táctil del
 *      índice: en un teléfono no hay `hover` con el que abrir el Canto, así que
 *      mantener el dedo sobre un segmento revela su título y lo lleva consigo
 *      hasta soltar.
 *
 * LO 1 Y LO 2 SON MOVIMIENTO; LO 3 ES NAVEGACIÓN. Por eso se montan por
 * separado: con `prefers-reduced-motion` la página no monta ni un tween, pero
 * el Canto sigue siendo el índice de la página y su etiqueta sigue existiendo.
 *
 * El salto al pulsar un segmento NO lo hace JavaScript: lo hace el ancla nativa
 * con `scroll-behavior: smooth`, que ya degrada a corte con
 * `prefers-reduced-motion` sin que nadie tenga que comprobarlo.
 */

import { gsap, ScrollTrigger } from './registro';

/**
 * Cuánto hay que mantener el dedo para que aparezca la etiqueta. 420 ms es el
 * umbral clásico de pulsación larga: por debajo se dispara con un toque normal
 * y por encima el usuario cree que no funciona.
 *
 * Es el único temporizador del proyecto y mide un GESTO, no una animación. La
 * regla de «cero temporizadores» que gobierna al odómetro (§8.12) existe para
 * que ningún contador se mueva solo; aquí lo que se mide es cuánto lleva un
 * dedo apoyado, y eso no se puede medir con otra cosa.
 */
const RETARDO_DE_PULSACION_MS = 420;

/** Aire entre el filamento y la etiqueta flotante. */
const SEPARACION_DE_ETIQUETA = 12;

export function montarCanto(): void {
  const canto = document.querySelector<HTMLElement>('[data-canto]');
  if (!canto) return;

  montarCursor(canto);
  montarSegmentoVivo(canto);
  montarPulsacionLarga(canto);
}

/** Sólo lo que no es movimiento: el Canto sigue siendo el índice de la página. */
export function montarCantoTactil(): void {
  const canto = document.querySelector<HTMLElement>('[data-canto]');
  if (!canto) return;

  montarPulsacionLarga(canto);
}

function montarCursor(canto: HTMLElement): void {
  const cursor = canto.querySelector<HTMLElement>('[data-canto-cursor]');
  if (!cursor) return;

  // La firma es el CSS. Este bloque es la red de seguridad, no el camino feliz.
  if (CSS.supports('animation-timeline', 'scroll()')) return;

  const fijar = gsap.quickSetter(cursor, 'scaleY') as (valor: number) => void;
  fijar(0);

  ScrollTrigger.create({
    trigger: document.documentElement,
    start: 'top top',
    end: 'bottom bottom',
    scrub: true,
    onUpdate: (self) => {
      fijar(self.progress);
    },
  });
}

function montarSegmentoVivo(canto: HTMLElement): void {
  const segmentos = canto.querySelectorAll<HTMLAnchorElement>('[data-canto-segmento]');

  segmentos.forEach((segmento) => {
    const ancla = segmento.getAttribute('href');
    if (!ancla?.startsWith('#')) return;

    const seccion = document.getElementById(ancla.slice(1));
    if (!seccion) return;

    ScrollTrigger.create({
      trigger: seccion,
      start: 'top 50%',
      end: 'bottom 50%',
      onToggle: (self) => {
        segmento.setAttribute('aria-current', self.isActive ? 'true' : 'false');
      },
    });
  });
}

/**
 * La etiqueta flotante de la pulsación larga. Se monta y se desmonta con el
 * gesto: fuera del gesto no hay ni un nodo de más en la página.
 */
function montarPulsacionLarga(canto: HTMLElement): void {
  let etiqueta: HTMLElement | null = null;
  let temporizador: number | null = null;
  let ultimaY = 0;
  let hayQueTragarseElClic = false;

  function colocar(y: number): void {
    if (!etiqueta) return;
    const x = canto.getBoundingClientRect().right + SEPARACION_DE_ETIQUETA;
    // Un `transform` y nada más: la etiqueta sigue al dedo en el compositor.
    etiqueta.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translateY(-50%)`;
  }

  function mostrar(segmento: HTMLAnchorElement): void {
    const titulo = segmento.querySelector('.canto__etiqueta')?.textContent?.trim();
    if (!titulo) return;

    etiqueta = document.createElement('div');
    etiqueta.className = 'canto__flotante';
    etiqueta.setAttribute('aria-hidden', 'true');
    etiqueta.textContent = titulo;
    document.body.append(etiqueta);
    colocar(ultimaY);

    // Con la etiqueta a la vista el dedo ya no está pulsando un enlace: está
    // leyendo el índice. Soltar no debe saltar a ninguna parte.
    hayQueTragarseElClic = true;
  }

  function soltar(): void {
    if (temporizador !== null) {
      window.clearTimeout(temporizador);
      temporizador = null;
    }
    etiqueta?.remove();
    etiqueta = null;
  }

  canto.addEventListener('pointerdown', (evento) => {
    const segmento = (evento.target as Element | null)?.closest<HTMLAnchorElement>(
      '[data-canto-segmento]',
    );
    if (!segmento) return;

    ultimaY = evento.clientY;
    hayQueTragarseElClic = false;
    temporizador = window.setTimeout(() => {
      temporizador = null;
      mostrar(segmento);
    }, RETARDO_DE_PULSACION_MS);
  });

  canto.addEventListener('pointermove', (evento) => {
    ultimaY = evento.clientY;
    if (etiqueta) colocar(ultimaY);
  });

  canto.addEventListener('pointerup', soltar);
  canto.addEventListener('pointercancel', soltar);
  canto.addEventListener('pointerleave', soltar);

  canto.addEventListener(
    'click',
    (evento) => {
      if (!hayQueTragarseElClic) return;
      hayQueTragarseElClic = false;
      evento.preventDefault();
    },
    true,
  );
}
