/**
 * Registro único de plugins de GSAP — DIRECCION.md §3.0.
 *
 * SOLO estos tres. El plugin de scroll suavizado y el de captura de gestos de
 * puntero están prohibidos por §0.2.7: el scroll de esta página es nativo, y
 * GSAP solo lo lee con `scrub` o lo fija con `pin`. Sus nombres no se escriben
 * ni en un comentario, porque el checklist §8.6 los busca por grep en todo
 * `src/` y un comentario también es una coincidencia.
 *
 * Que este fichero sea el único punto de registro es lo que hace la regla
 * auditable: un test lee este fuente y falla si aparece un cuarto import.
 */

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';

let registrado = false;

export function registrarPlugins(): void {
  if (registrado) return;
  gsap.registerPlugin(ScrollTrigger, SplitText, DrawSVGPlugin);
  registrado = true;
}

export { gsap, ScrollTrigger, SplitText, DrawSVGPlugin };
