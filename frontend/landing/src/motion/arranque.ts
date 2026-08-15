/**
 * Arranque del motion — DIRECCION.md §3.0 y §3.P.
 *
 * Dos condiciones, las dos innegociables:
 *
 * 1. GATING. Con `prefers-reduced-motion: reduce` no se crea NI UN tween. No se
 *    crean y luego se paran: no se crean. Como el CSS no esconde nada (D4), la
 *    página queda completa y legible; sólo desaparece el tiempo. Lo que SÍ se
 *    monta en esa rama es lo que no es movimiento: el índice táctil del Canto
 *    y el botón «Reproducir» de la demo, que §8.14 exige que se vea y que
 *    despacha los estados por corte.
 * 2. FUENTES. Todo espera a `document.fonts.ready`. SplitText midiendo líneas
 *    sobre la fuente de reserva las parte donde no van, y al llegar Literata el
 *    texto salta.
 *
 * El orden de montaje importa una sola vez: `parallaxDelHero` refresca
 * ScrollTrigger al final, y para entonces todos los disparadores de la página
 * tienen que existir — si no, los de más abajo se miden contra un documento
 * cuyo alto todavía no conocen. Por eso el refresco se hace aquí, después de
 * montarlo todo, y no dentro de cada sección.
 */

import { montarSesionDeMuestra, montarSesionDeMuestraReducida } from '../demo/montaje';
import { montarCanto, montarCantoTactil } from './canto';
import { coreografiarActa } from './coreografia/acta';
import { coreografiarDespues } from './coreografia/despues';
import { coreografiarMesa } from './coreografia/mesa';
import { coreografiarPrecios } from './coreografia/precios';
import { coreografiarProblema } from './coreografia/problema';
import { coreografiarProcedimiento } from './coreografia/procedimiento';
import { coreografiarVoto } from './coreografia/voto';
import { entradaDelHero, parallaxDelHero } from './hero';
import { registrarPlugins, ScrollTrigger } from './registro';
import { revelarSeccion } from './revelar';

export function pideMovimientoReducido(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function arrancarMotion(): void {
  if (pideMovimientoReducido()) {
    montarCantoTactil();
    montarSesionDeMuestraReducida();
    return;
  }

  void document.fonts.ready.then(() => {
    registrarPlugins();

    const entradaLista = entradaDelHero();
    parallaxDelHero();
    montarCanto();
    montarSesionDeMuestra(entradaLista);

    document.querySelectorAll<HTMLElement>('[data-seccion]').forEach((seccion) => {
      revelarSeccion(seccion);
    });

    coreografiarProblema();
    coreografiarProcedimiento();
    coreografiarMesa();
    coreografiarVoto();
    coreografiarActa();
    coreografiarDespues();
    coreografiarPrecios();

    // El pin y los scrubs no conocen el alto real hasta que está todo montado.
    ScrollTrigger.refresh();
  });
}
