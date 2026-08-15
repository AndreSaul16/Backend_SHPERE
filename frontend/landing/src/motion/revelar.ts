/**
 * El reveal estándar de sección — DIRECCION.md §3.0.
 *
 * Se repite; NO se reinventa por sección. Tres papeles, marcados en el HTML con
 * `data-revelar`:
 *   titular  eyebrow + h2, SplitText por LÍNEAS enmascaradas, yPercent 110→0
 *   cuerpo   opacity 0→1 + y 12→0
 *   pieza    listas y tarjetas, stagger 0.04 con tope de 8
 *
 * Todo con `once: true`: una landing que re-anima al subir parece un gif.
 *
 * D4 — nada de esto esconde contenido. Los estados iniciales los pone
 * `gsap.from()` en el mismo frame en que se crea el tween; el CSS y el HTML
 * nunca llevan `opacity: 0` sobre un bloque de contenido, así que sin
 * JavaScript la página se lee entera.
 */

import { gsap, SplitText } from './registro';
import { DURACION, EASE_SETTLE, REVELADO } from './tokens';

/**
 * Anima el titular por líneas enmascaradas y devuelve el texto a ser texto.
 *
 * Sin `autoSplit`: el motivo real de que SplitText parta mal las líneas es que
 * la fuente todavía no ha cargado, y de eso ya se ocupa el gating de
 * `document.fonts.ready` en `arranque.ts`. Añadir re-splits por resize traería
 * el coste de un listener por titular a cambio de nada, y `once: true` hace que
 * el tween ya no exista cuando el usuario gire el teléfono.
 */
function revelarTitular(elemento: HTMLElement): void {
  const partido = SplitText.create(elemento, {
    type: 'lines',
    mask: 'lines',
    linesClass: 'linea-partida',
    /*
     * `aria: 'none'` y no el «auto» que trae SplitText de fábrica.
     *
     * Con «auto», SplitText cuelga un `aria-label` del elemento partido y marca
     * las líneas como `aria-hidden`. En un `<h2>` eso es válido, pero los
     * rótulos de sección son `<p>` — rol `paragraph`, que PROHÍBE que se le
     * ponga nombre accesible— y axe lo cuenta como ARIA inválido: seis
     * infracciones a la vez mientras los reveals están en vuelo.
     *
     * Con 'none' no se escribe ninguna de las dos cosas y el texto se lee de su
     * propio contenido, que es lo que hay dentro de las líneas. Aquí no se
     * pierde nada porque el corte es POR LÍNEAS: cada trozo son palabras
     * enteras. (En un corte por caracteres sí haría falta el label, o el lector
     * deletrearía la palabra.)
     */
    aria: 'none',
  });

  gsap.from(partido.lines, {
    yPercent: REVELADO.desplazamientoLinea,
    duration: DURACION.escena,
    ease: EASE_SETTLE,
    stagger: REVELADO.staggerTitular,
    scrollTrigger: { trigger: elemento, start: REVELADO.disparo, once: true },
    onComplete: () => {
      // §0.2.8: SplitText anima entradas UNA vez; después el texto es texto.
      partido.revert();
    },
  });
}

function revelarCuerpo(elemento: HTMLElement): void {
  gsap.from(elemento, {
    opacity: 0,
    y: REVELADO.desplazamientoCuerpo,
    duration: DURACION.panel,
    ease: EASE_SETTLE,
    scrollTrigger: { trigger: elemento, start: REVELADO.disparo, once: true },
  });
}

/**
 * Listas y tarjetas. Las 8 primeras entran escalonadas; el resto entra junto
 * con la octava — una lista larga no es un desfile (DESIGN.md §7.5).
 */
export function revelarPieza(contenedor: HTMLElement): void {
  const hijos = Array.from(contenedor.children) as HTMLElement[];
  if (hijos.length === 0) return;

  const escalonados = hijos.slice(0, REVELADO.topeStagger);
  const resto = hijos.slice(REVELADO.topeStagger);
  const disparador = {
    trigger: contenedor,
    start: REVELADO.disparo,
    once: true,
  } as const;

  gsap.from(escalonados, {
    opacity: 0,
    y: REVELADO.desplazamientoCuerpo,
    duration: DURACION.panel,
    ease: EASE_SETTLE,
    stagger: REVELADO.staggerLista,
    scrollTrigger: disparador,
  });

  if (resto.length > 0) {
    gsap.from(resto, {
      opacity: 0,
      y: REVELADO.desplazamientoCuerpo,
      duration: DURACION.panel,
      ease: EASE_SETTLE,
      delay: REVELADO.staggerLista * (REVELADO.topeStagger - 1),
      scrollTrigger: disparador,
    });
  }
}

/** Monta el reveal estándar sobre una sección ya marcada con `data-revelar`. */
export function revelarSeccion(seccion: HTMLElement): void {
  seccion.querySelectorAll<HTMLElement>('[data-revelar="titular"]').forEach(revelarTitular);
  seccion.querySelectorAll<HTMLElement>('[data-revelar="cuerpo"]').forEach(revelarCuerpo);
  seccion.querySelectorAll<HTMLElement>('[data-revelar="pieza"]').forEach(revelarPieza);
}
