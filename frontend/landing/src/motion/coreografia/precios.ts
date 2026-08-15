/**
 * S9 · Precios — DIRECCION.md §3.S9.
 *
 * Las cifras de la tabla de costes ruedan una vez al entrar —un crédito, cinco,
 * tres— porque son el dato que el visitante ha bajado a buscar y el rodillo dice
 * «esto se ha contado». Las tarjetas de pack entran escalonadas y la central,
 * la popular, entra LA ÚLTIMA: su filete de latón se dibuja después, cuando ya
 * está en su sitio, que es lo que la señala sin gritarla.
 */

import { gsap, ScrollTrigger } from '../registro';
import { DURACION, EASE_SETTLE, EASE_TRAVEL, REVELADO } from '../tokens';
import { rodarDeclarado } from '../../piezas/odometro';

const ESCALONADO_PACKS = 0.06;

/**
 * Un disparo sobre la tabla entera y las cuatro cifras ruedan a la vez. No hay
 * tween que crear: el rodillo del odómetro es CSS, así que basta con un
 * disparador y una llamada.
 */
function rodarCostes(seccion: HTMLElement): void {
  const costes = [...seccion.querySelectorAll<HTMLElement>('[data-coste]')];
  const tabla = costes[0]?.closest('table');
  if (!tabla) return;

  ScrollTrigger.create({
    trigger: tabla,
    start: REVELADO.disparo,
    once: true,
    onEnter: () => {
      costes.forEach(rodarDeclarado);
    },
  });
}

export function coreografiarPrecios(): void {
  const seccion = document.querySelector<HTMLElement>('#precios');
  if (!seccion) return;

  rodarCostes(seccion);

  const packs = seccion.querySelector<HTMLElement>('[data-packs]');
  if (!packs) return;

  const tarjetas = [...packs.children] as HTMLElement[];
  const popular = packs.querySelector<HTMLElement>('[data-pack-popular]');
  const filete = packs.querySelector<SVGRectElement>('[data-filete-pack]');

  // La popular sale de la fila y se pone al final: entra la última.
  const orden = [...tarjetas.filter((tarjeta) => tarjeta !== popular)];
  if (popular) orden.push(popular);

  const linea = gsap.timeline({
    scrollTrigger: { trigger: packs, start: REVELADO.disparo, once: true },
  });

  linea.from(orden, {
    opacity: 0,
    y: REVELADO.desplazamientoCuerpo,
    duration: DURACION.panel,
    ease: EASE_SETTLE,
    stagger: ESCALONADO_PACKS,
  });

  if (filete) {
    linea.from(
      filete,
      { drawSVG: '0%', duration: DURACION.panel, ease: EASE_TRAVEL },
      `>-${String(DURACION.pop)}`,
    );
  }
}
