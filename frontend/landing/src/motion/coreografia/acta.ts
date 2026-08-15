/**
 * S6 · El acta — DIRECCION.md §3.S6 y D7.
 *
 * La hoja se DESENROLLA con un scrub corto (`clip-path: inset` de abajo a
 * arriba, entre `top 80%` y `top 45%`): el capítulo de papel llega como llega
 * un documento, no como una tarjeta que aparece. Cuando la hoja termina de
 * fijarse se marcan las casillas de próximos pasos, una a una, y aterriza el
 * sello.
 *
 * EL SELLO ES EL ÚNICO MOMENTO IMPACT DE LA PÁGINA (D7), compartido con su
 * gemelo de la demo, que es el mismo efecto. Se levanta desde JavaScript —el
 * HTML servido lo trae puesto, porque sin motor el acta ya está cerrada— y cae
 * una sola vez. Si el visitante llega con la sección ya pasada, el cerrojo lo
 * coloca sin ceremonia: llegar tarde no es motivo para quedarse sin sello.
 */

import { gsap } from '../registro';
import { DURACION, EASE_SETTLE } from '../tokens';
import { aterrizarSello, levantarSello } from '../../piezas/sello';

export function coreografiarActa(): void {
  const hoja = document.querySelector<HTMLElement>('[data-hoja-acta]');
  if (!hoja) return;

  const casillas = [...hoja.querySelectorAll<SVGPathElement>('[data-casilla]')];
  const sello = document.querySelector('[data-sello]');

  if (sello) levantarSello(sello);
  if (casillas.length > 0) gsap.set(casillas, { drawSVG: '0%' });

  let cerrada = false;
  function cerrar(): void {
    if (cerrada) return;
    cerrada = true;

    if (casillas.length > 0) {
      gsap.to(casillas, {
        drawSVG: '100%',
        duration: DURACION.pop,
        ease: EASE_SETTLE,
        stagger: 0.12,
      });
    }
    if (sello) aterrizarSello(sello);
  }

  gsap.fromTo(
    hoja,
    { clipPath: 'inset(0% 0% 100% 0%)' },
    {
      clipPath: 'inset(0% 0% 0% 0%)',
      ease: 'none',
      scrollTrigger: {
        trigger: hoja,
        start: 'top 80%',
        end: 'top 45%',
        scrub: true,
        onUpdate: (self) => {
          if (self.progress > 0.999) cerrar();
        },
      },
    },
  );
}
