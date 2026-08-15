/**
 * El Sello — DESIGN.md §8.3 / DIRECCION.md §5.4, D7.
 *
 * Un tampón de anilina que ATERRIZA sobre la cabecera del acta cuando el debate
 * se convierte en constancia. Es el único momento celebratorio de la página y
 * sucede exactamente una vez por superficie: la demo del hero y S6. Si todo
 * golpea, nada golpea (D7) — por eso `back.out(2.2)` no aparece en ningún otro
 * sitio del proyecto.
 *
 * El activo es un SVG pre-horneado: la sangría de tinta vive en las
 * irregularidades del trazado, nunca en un filtro de runtime. Lo que se anima
 * es el aterrizaje, y son tres propiedades de la lista permitida.
 *
 * El sello del cierre (S11) NO pasa por aquí: allí es firma en reposo y no
 * anima nada.
 */

import { gsap } from '../motion/registro';
import { DURACION, EASE_IMPACTO } from '../motion/tokens';

/**
 * Lo retira de la vista antes de que caiga. Se escribe en estilo EN LÍNEA desde
 * JavaScript y no en la hoja de estilos: D4 exige que el HTML servido no
 * esconda nada, así que sin JavaScript el sello ya está puesto.
 */
export function levantarSello(sello: Element): void {
  if (sello instanceof HTMLElement || sello instanceof SVGElement) {
    sello.style.opacity = '0';
  }
}

/** El aterrizaje. Una vez, y sólo cuando el acta queda cerrada. */
export function aterrizarSello(sello: Element): void {
  gsap.fromTo(
    sello,
    { opacity: 0, scale: 1.18, rotation: -1.5 },
    {
      opacity: 1,
      scale: 1,
      rotation: 0,
      duration: DURACION.pop,
      ease: EASE_IMPACTO,
      transformOrigin: '50% 50%',
      overwrite: 'auto',
      clearProps: 'opacity',
    },
  );
}

/** Sello ya asentado, sin aterrizaje: `prefers-reduced-motion` (§8.3). */
export function fijarSello(sello: Element): void {
  if (sello instanceof HTMLElement || sello instanceof SVGElement) {
    sello.style.removeProperty('opacity');
  }
}
