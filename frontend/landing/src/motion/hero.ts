/**
 * Hero — DIRECCION.md §3.S1 puntos 1 y 3.
 *
 * 1. Timeline ÚNICA de entrada (no depende del scroll), ≤ 1.2 s:
 *    marca (anillo drawSVG + arco), wordmark letra a letra enmascarado,
 *    eyebrow, H1 por líneas enmascaradas, entradilla y CTAs.
 * 2. Micro-parallax con scrub: la demo −24 px, el bloque de texto −8 px.
 *    Nada más. Profundidad sí, mareo no.
 *
 * El motor de la Sesión de Muestra no vive aquí: vive en `src/demo/`. Lo único
 * que este módulo le debe es una promesa — la entrada devuelve cuándo ha
 * terminado, porque §3.S1.2 hace que la demo arranque cuando acaba la entrada
 * **y** el hero está en el viewport, lo que llegue más tarde.
 */

import { gsap, SplitText } from './registro';
import { DURACION, EASE_SETTLE, EASE_TRAVEL } from './tokens';

/**
 * §3.0 (LCP): el H1 se pinta con HTML y CSS, y si el JavaScript llega tarde el
 * usuario ya está leyendo el claim. Animarlo entonces significaría ESCONDER un
 * texto que ya se veía para volver a enseñarlo — peor que no animar nada.
 * Pasado este umbral desde el inicio de la navegación, la entrada simplemente
 * no ocurre para él; el resto del motion (scroll) sí se monta, porque vive
 * por debajo del pliegue y nadie lo ha visto todavía.
 */
const UMBRAL_ENTRADA_MS = 1200;

/** Devuelve el texto a ser texto en cuanto la entrada termina (§0.2.8). */
function partirYRevertir(
  elemento: HTMLElement,
  tipo: 'lines' | 'chars',
): { unidades: Element[]; revertir: () => void } {
  const partido = SplitText.create(elemento, { type: tipo, mask: tipo });
  const unidades = tipo === 'lines' ? partido.lines : partido.chars;
  return { unidades, revertir: () => partido.revert() };
}

export function entradaDelHero(): Promise<void> {
  if (performance.now() > UMBRAL_ENTRADA_MS) return Promise.resolve();

  const hero = document.querySelector<HTMLElement>('#hero');
  if (!hero) return Promise.resolve();

  const anillo = document.querySelector<SVGElement>('[data-marca-anillo]');
  const arco = document.querySelector<SVGElement>('[data-marca-arco]');
  const wordmark = document.querySelector<HTMLElement>('[data-marca-wordmark]');
  const rotulo = hero.querySelector<HTMLElement>('[data-hero="rotulo"]');
  const titular = hero.querySelector<HTMLElement>('[data-hero="titular"]');
  const entradilla = hero.querySelector<HTMLElement>('[data-hero="entradilla"]');
  const acciones = hero.querySelectorAll<HTMLElement>('[data-hero="cta"]');
  const microcopy = hero.querySelector<HTMLElement>('[data-hero="microcopy"]');

  const linea = gsap.timeline({ defaults: { ease: EASE_SETTLE } });

  // El sello de la mesa se dibuja: el anillo primero, el arco después.
  if (anillo) {
    linea.from(anillo, {
      drawSVG: '0%',
      duration: DURACION.panel,
      ease: EASE_TRAVEL,
    }, 0);
  }
  if (arco) {
    linea.from(arco, { scale: 0.8, opacity: 0, transformOrigin: 'center', duration: DURACION.pop }, 0.24);
  }

  // El wordmark es una placa grabada: las letras suben tras su máscara.
  if (wordmark) {
    const { unidades, revertir } = partirYRevertir(wordmark, 'chars');
    linea.from(unidades, {
      yPercent: 110,
      duration: DURACION.panel,
      stagger: 0.024,
      onComplete: revertir,
    }, 0.28);
  }

  if (rotulo) {
    linea.from(rotulo, { opacity: 0, y: 8, duration: DURACION.reveal }, 0.42);
  }

  if (titular) {
    const { unidades, revertir } = partirYRevertir(titular, 'lines');
    linea.from(unidades, {
      yPercent: 110,
      duration: DURACION.escena,
      stagger: 0.08,
      onComplete: revertir,
    }, 0.5);
  }

  if (entradilla) {
    linea.from(entradilla, { opacity: 0, y: 12, duration: DURACION.panel }, 0.72);
  }

  if (acciones.length > 0) {
    linea.from(acciones, { opacity: 0, y: 8, duration: DURACION.reveal, stagger: 0.06 }, 0.85);
  }

  // El coste y las condiciones llegan con los CTA, no después: quien lee el
  // botón lee la letra pequeña en el mismo movimiento (P4).
  if (microcopy) {
    linea.from(microcopy, { opacity: 0, y: 8, duration: DURACION.reveal }, 0.97);
  }

  // La timeline es «thenable» y resuelve al completarse, pero resuelve consigo
  // misma: se envuelve para que quien espera la entrada reciba un final, no un
  // mando a distancia de la coreografía del hero.
  return new Promise<void>((resolver) => {
    void linea.then(() => {
      resolver();
    });
  });
}

export function parallaxDelHero(): void {
  const hero = document.querySelector<HTMLElement>('#hero');
  if (!hero) return;

  const demo = hero.querySelector<HTMLElement>('[data-hero="demo"]');
  const texto = hero.querySelector<HTMLElement>('[data-hero="texto"]');

  const scrub = {
    trigger: hero,
    start: 'top top',
    end: 'bottom top',
    scrub: true,
  } as const;

  if (demo) gsap.to(demo, { y: -24, ease: 'none', scrollTrigger: scrub });
  if (texto) gsap.to(texto, { y: -8, ease: 'none', scrollTrigger: scrub });
}
