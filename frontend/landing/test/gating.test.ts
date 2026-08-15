// @vitest-environment happy-dom

/**
 * El gating de `prefers-reduced-motion` — DIRECCION.md §3.0 y checklist §8.14.
 *
 * «Con reduce: NINGÚN tween se crea. No se crean y luego se paran: no se
 * crean.» Eso es una afirmación sobre GSAP, así que se comprueba sobre GSAP:
 * con espías en `to`, `from`, `fromTo`, `set` y `timeline`, se arranca el
 * motion entero con un `matchMedia` que dice «reduce» y se exige cero llamadas.
 *
 * Y lo que no puede faltar en la misma rama: el botón «Reproducir» de la demo
 * TIENE que verse (§8.14) y la sesión tiene que poder despacharse entera por
 * corte sin perder una sola información — que es lo que separa el movimiento
 * reducido de la ausencia de contenido (§7.6).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gsap } from 'gsap';
import { arrancarMotion, pideMovimientoReducido } from '../src/motion/arranque';
import { crearEscena } from '../src/demo/escena';
import { SESION_DE_MUESTRA } from '../src/demo/sesionDeMuestra';

const DEMO = `
  <nav class="canto" data-canto>
    <div class="canto__pista">
      <a class="canto__segmento" data-canto-segmento href="#hero"><span class="canto__etiqueta">Convocatoria</span></a>
    </div>
    <span class="canto__cursor" data-canto-cursor></span>
  </nav>
  <section id="hero">
    <div class="sesion-muestra" data-demo>
      <div aria-hidden="true">
        <p data-demo-fase>Síntesis</p>
        <ul data-demo-palco>
          <li class="demo-asiento" data-asiento="oberon">
            <svg class="aguja aguja--certeza-alta" viewBox="0 0 40 24" data-demo-aguja>
              <path class="aguja__arco" d="M4 22A16 16 0 0 1 36 22"></path>
              <path class="aguja__certeza" d="M4 22A16 16 0 0 1 36 22" stroke-dasharray="50.265" stroke-dashoffset="13.069"></path>
              <line class="aguja__punta" x1="20" y1="22" x2="5.5" y2="22" transform="rotate(133.20 20 22)"></line>
            </svg>
            <span data-demo-voto>SÍ · 74</span>
            <span data-demo-filamento hidden></span>
          </li>
          <li class="demo-asiento" data-asiento="nexus">
            <svg class="aguja" viewBox="0 0 40 24" data-demo-aguja>
              <path class="aguja__arco" d="M4 22A16 16 0 0 1 36 22"></path>
              <path class="aguja__certeza" d="M4 22A16 16 0 0 1 36 22" stroke-dasharray="50.265" stroke-dashoffset="17.090"></path>
              <line class="aguja__punta" x1="20" y1="22" x2="5.5" y2="22" transform="rotate(118.80 20 22)"></line>
            </svg>
            <span data-demo-voto>CONDICIONAL · 66</span>
            <span data-demo-filamento hidden></span>
          </li>
          <li class="demo-asiento" data-asiento="ledger">
            <svg class="aguja aguja--certeza-alta" viewBox="0 0 40 24" data-demo-aguja>
              <path class="aguja__arco" d="M4 22A16 16 0 0 1 36 22"></path>
              <path class="aguja__certeza" d="M4 22A16 16 0 0 1 36 22" stroke-dasharray="50.265" stroke-dashoffset="6.032"></path>
              <line class="aguja__punta" x1="20" y1="22" x2="5.5" y2="22" transform="rotate(158.40 20 22)"></line>
            </svg>
            <span data-demo-voto>SÍ · 88</span>
            <span data-demo-filamento hidden></span>
          </li>
          <li class="demo-asiento" data-asiento="vortex">
            <svg class="aguja aguja--certeza-alta" viewBox="0 0 40 24" data-demo-aguja>
              <path class="aguja__arco" d="M4 22A16 16 0 0 1 36 22"></path>
              <path class="aguja__certeza" d="M4 22A16 16 0 0 1 36 22" stroke-dasharray="50.265" stroke-dashoffset="14.577"></path>
              <line class="aguja__punta" x1="20" y1="22" x2="5.5" y2="22" transform="rotate(127.80 20 22)"></line>
            </svg>
            <span data-demo-voto>NO · 71</span>
            <span data-demo-filamento hidden></span>
          </li>
        </ul>
        <p data-demo-recuento>
          <span class="odometro" data-cifra="si"><span class="odometro__digito"><span class="odometro__rodillo">2</span></span></span>
          <span class="odometro" data-cifra="condicional"><span class="odometro__digito"><span class="odometro__rodillo">1</span></span></span>
          <span class="odometro" data-cifra="no"><span class="odometro__digito"><span class="odometro__rodillo">1</span></span></span>
        </p>
        <ol data-demo-turnos>
          <li class="identidad identidad--cmo"><p class="identidad__nombre">Vortex · CMO</p><p class="identidad__cuerpo">Es justo.</p></li>
        </ol>
        <div data-demo-acta>
          <p data-demo-acta-titulo>Acta — Subida de precio a 49 €</p>
          <span class="pluma" data-demo-pluma></span>
          <p data-demo-acta-recuento>SÍ 2 · CONDICIONAL 1 · NO 1 — Recomendación: aprobar, escalonado</p>
          <svg class="sello" data-demo-sello></svg>
        </div>
        <span class="cursor-demo" data-demo-cursor hidden></span>
      </div>
      <button type="button" data-demo-reproducir hidden>Reproducir de nuevo</button>
    </div>
  </section>
`;

function fingirPreferencia(reduce: boolean): void {
  window.matchMedia = (consulta: string) =>
    ({
      matches: reduce,
      media: consulta,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    });
}

/** La raíz de la demo del fixture. Si falta, el test miente y debe romperse. */
function raizDeLaDemo(): HTMLElement {
  const raiz = document.querySelector<HTMLElement>('[data-demo]');
  if (!raiz) throw new Error('el fixture no monta [data-demo]');
  return raiz;
}

function espiarGsap() {
  return {
    to: vi.spyOn(gsap, 'to'),
    from: vi.spyOn(gsap, 'from'),
    fromTo: vi.spyOn(gsap, 'fromTo'),
    set: vi.spyOn(gsap, 'set'),
    timeline: vi.spyOn(gsap, 'timeline'),
  };
}

beforeEach(() => {
  document.body.innerHTML = DEMO;
});

afterEach(() => {
  // Los tweens que este fichero llega a crear NO deben renderizarse: happy-dom
  // no implementa las matrices de transformación de SVG y GSAP revienta al
  // leerlas. Lo que aquí se comprueba es que se creen o no se creen, no cómo
  // se pintan — de eso se ocupa el humo sobre un navegador de verdad.
  gsap.globalTimeline.clear();
  vi.restoreAllMocks();
});

describe('con prefers-reduced-motion: reduce', () => {
  it('arrancar el motion no crea ni un tween de GSAP', () => {
    fingirPreferencia(true);
    const espias = espiarGsap();

    arrancarMotion();

    expect(pideMovimientoReducido()).toBe(true);
    expect(espias.to).not.toHaveBeenCalled();
    expect(espias.from).not.toHaveBeenCalled();
    expect(espias.fromTo).not.toHaveBeenCalled();
    expect(espias.set).not.toHaveBeenCalled();
    expect(espias.timeline).not.toHaveBeenCalled();
  });

  it('el botón de la demo se revela como «Reproducir» y es enfocable', () => {
    fingirPreferencia(true);
    arrancarMotion();

    const boton = document.querySelector<HTMLButtonElement>('[data-demo-reproducir]');
    expect(boton?.hidden).toBe(false);
    expect(boton?.textContent).toBe('Reproducir');
    expect(boton?.disabled).toBe(false);
  });

  it('la sesión entera se despacha por corte sin crear ni un tween', () => {
    const espias = espiarGsap();
    const raiz = raizDeLaDemo();

    const escena = crearEscena(raiz, 'corte');
    escena.reiniciar();
    for (const evento of SESION_DE_MUESTRA) escena.aplicar(evento);
    escena.terminar();

    expect(espias.to).not.toHaveBeenCalled();
    expect(espias.from).not.toHaveBeenCalled();
    expect(espias.fromTo).not.toHaveBeenCalled();
    expect(espias.set).not.toHaveBeenCalled();
    expect(espias.timeline).not.toHaveBeenCalled();
  });

  it('y aun así la información llega entera: §7.6 quita el tiempo, no el dato', () => {
    const raiz = raizDeLaDemo();
    const escena = crearEscena(raiz, 'corte');
    escena.reiniciar();
    for (const evento of SESION_DE_MUESTRA) escena.aplicar(evento);
    escena.terminar();

    expect(document.querySelector('[data-demo-acta-titulo]')?.textContent).toBe(
      'Acta — Subida de precio a 49 €',
    );
    expect(document.querySelector('[data-demo-acta-recuento]')?.textContent).toBe(
      'SÍ 2 · CONDICIONAL 1 · NO 1 — Recomendación: aprobar, escalonado',
    );
    expect(document.querySelector('[data-asiento="vortex"] [data-demo-voto]')?.textContent).toBe(
      'NO · 71',
    );
    expect(document.querySelector('[data-demo-fase]')?.textContent).toBe('Síntesis');

    // El cursor de streaming —el bucle nº 1 de §3.P— está muerto al terminar.
    expect(document.querySelector<HTMLElement>('[data-demo-cursor]')?.hidden).toBe(true);
  });

  it('la aguja del NO cruza el 70 y gana su clase sin un tween de color', () => {
    const raiz = raizDeLaDemo();
    const escena = crearEscena(raiz, 'corte');
    escena.reiniciar();

    const aguja = document.querySelector('[data-asiento="vortex"] [data-demo-aguja]');
    expect(aguja?.classList.contains('aguja--certeza-alta')).toBe(false);

    escena.aplicar({ t: 0, tipo: 'voto', quien: 'vortex', sentido: 'NO', confianza: 71 });
    expect(aguja?.classList.contains('aguja--certeza-alta')).toBe(true);
  });
});

describe('sin prefers-reduced-motion', () => {
  it('la escena animada SÍ usa GSAP — el espía de arriba no es un espía ciego', () => {
    const espias = espiarGsap();
    const raiz = raizDeLaDemo();

    const escena = crearEscena(raiz, 'animado');
    escena.aplicar({ t: 0, tipo: 'voto', quien: 'vortex', sentido: 'NO', confianza: 71 });

    expect(espias.to).toHaveBeenCalled();
  });

  it('`pideMovimientoReducido` refleja lo que dice el sistema', () => {
    fingirPreferencia(false);
    expect(pideMovimientoReducido()).toBe(false);
  });
});
