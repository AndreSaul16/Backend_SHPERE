/**
 * S2 · El problema — DIRECCION.md §3.S2.
 *
 * La respuesta complaciente entra como tarjeta y, al seguir bajando, un trazo
 * de tinta oxblood la TACHA de izquierda a derecha con el dedo del visitante:
 * `scrub: 0.5` entre `top 70%` y `top 35%` del bloque. Cuando el trazo se
 * completa aparece la nota del margen, «¿Y si no?».
 *
 * POR QUÉ LA NOTA NO SALE CON EL SCRUB. Es la respuesta al tachón, no parte de
 * él: aparecer a medio tachar sería contestar antes de la pregunta. Por eso se
 * dispara cuando el progreso llega al final y se queda — `once` de verdad,
 * guardado con un cerrojo, porque `onUpdate` también corre al refrescar.
 */

import { gsap } from '../registro';
import { DURACION, EASE_SETTLE, REVELADO } from '../tokens';

export function coreografiarProblema(): void {
  const seccion = document.querySelector<HTMLElement>('#problema');
  if (!seccion) return;

  const bloque = seccion.querySelector<HTMLElement>('[data-bloque-chat]');
  const trazo = seccion.querySelector<SVGPathElement>('[data-tachon]');
  const nota = seccion.querySelector<HTMLElement>('[data-nota-margen]');
  if (!bloque || !trazo) return;

  gsap.from(bloque, {
    opacity: 0,
    y: REVELADO.desplazamientoCuerpo,
    duration: DURACION.panel,
    ease: EASE_SETTLE,
    scrollTrigger: { trigger: bloque, start: REVELADO.disparo, once: true },
  });

  let anotada = false;
  function anotar(): void {
    if (anotada || !nota) return;
    anotada = true;
    gsap.to(nota, {
      opacity: 1,
      x: 0,
      duration: DURACION.reveal,
      ease: EASE_SETTLE,
    });
  }

  if (nota) gsap.set(nota, { opacity: 0, x: 8 });

  gsap.from(trazo, {
    drawSVG: '0%',
    ease: 'none',
    scrollTrigger: {
      trigger: bloque,
      start: 'top 70%',
      end: 'top 35%',
      scrub: 0.5,
      onUpdate: (self) => {
        if (self.progress > 0.999) anotar();
      },
    },
  });
}
