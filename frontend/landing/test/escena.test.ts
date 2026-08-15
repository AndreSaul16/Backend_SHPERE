// @vitest-environment happy-dom

/**
 * La escena de la Sesión de Muestra contra el marcado REAL — DIRECCION.md
 * §3.S1.2 y §8.6.
 *
 * POR QUÉ ESTE FICHERO NO SE INVENTA SU FIXTURE. El fallo que cierra este test
 * era exactamente una deriva entre `index.html` y `src/demo/escena.ts`: el HTML
 * escribe `data-cifra` —el mismo nombre que la pieza usa en S5— y la escena
 * buscaba `data-demo-cifra`. `querySelectorAll` no se queja de un nombre que no
 * existe: devuelve una lista vacía. Así que el mapa de cifras estaba vacío, ni
 * `reiniciar` las ponía a cero ni el evento `recuento` las hacía rodar, y la
 * fila del recuento enseñaba el «SÍ 2 · CONDICIONAL 1 · NO 1» del fotograma
 * final desde el primer segundo: la demo destripaba su propio desenlace durante
 * APERTURA y RÉPLICAS.
 *
 * Un fixture escrito a mano habría podido derivar igual que derivó el código.
 * Por eso aquí se monta el bloque `[data-demo]` tal cual sale de `index.html`,
 * extraído con `DOMParser` —que no ejecuta scripts— en vez de copiado.
 *
 * LO QUE SE CONTRATA, en una frase: el recuento arranca a 0·0·0 sin rodillo, no
 * lo mueve ningún voto, y sólo rueda cuando llega el evento `recuento`.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { crearEscena } from '../src/demo/escena';
import { SESION_DE_MUESTRA } from '../src/demo/sesionDeMuestra';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = readFileSync(join(RAIZ, 'index.html'), 'utf8');

/** El bloque de la demo tal y como lo sirve la página, sin ejecutar nada. */
const MARCADO_DE_LA_DEMO = (() => {
  const documento = new DOMParser().parseFromString(INDEX, 'text/html');
  const demo = documento.querySelector('[data-demo]');
  if (!demo) throw new Error('index.html ya no monta [data-demo]: el test miente');
  return demo.outerHTML;
})();

const CLAVES = ['si', 'condicional', 'no'] as const;

function raizDeLaDemo(): HTMLElement {
  const raiz = document.querySelector<HTMLElement>('[data-demo]');
  if (!raiz) throw new Error('el fixture no monta [data-demo]');
  return raiz;
}

/** Lo que el visitante lee en la fila del recuento, cifra a cifra. */
function recuento(): string[] {
  return CLAVES.map((clave) => {
    const odometro = document.querySelector(`[data-demo] [data-cifra="${clave}"]`);
    if (!odometro) throw new Error(`falta el odómetro «${clave}» en la demo`);
    return [...odometro.querySelectorAll('.odometro__rodillo')]
      .map((rodillo) => rodillo.textContent ?? '')
      .join('');
  });
}

/** Un odómetro rueda cuando monta su filete de latón; fijarlo no lo monta. */
function hanRodado(): boolean {
  return CLAVES.some(
    (clave) =>
      document.querySelector(`[data-demo] [data-cifra="${clave}"] .odometro__subrayado`) !== null,
  );
}

const EVENTO_DE_RECUENTO = SESION_DE_MUESTRA.find((evento) => evento.tipo === 'recuento');

/**
 * happy-dom trae `transform.baseVal` pero no su `consolidate()`, y GSAP lo
 * llama en cuanto toca un SVG que ya declara un `transform` —las agujas del
 * Palco lo declaran, porque el fotograma final se escribe con atributos—. Es un
 * hueco del entorno de test, no del producto: el navegador lo implementa, y por
 * eso `test/gating.test.ts` documenta la misma carencia al limpiar la timeline.
 *
 * El sustituto devuelve la identidad a propósito y basta: este fichero no
 * afirma NADA sobre transformaciones. La geometría de la aguja —giro y recorte
 * del arco— la contrata `test/piezas.test.ts` sobre los atributos, sin GSAP de
 * por medio. Aquí sólo hace falta que `reiniciar()` pueda llegar hasta el final
 * en modo animado para poder mirar el recuento después.
 */
function prestarMatricesSvgAlEntorno(): void {
  for (const dibujo of document.querySelectorAll('[data-demo] svg *')) {
    const baseVal = (dibujo as unknown as { transform?: { baseVal?: Record<string, unknown> } })
      .transform?.baseVal;
    if (baseVal && typeof baseVal['consolidate'] !== 'function') {
      baseVal['consolidate'] = () => ({ matrix: new DOMMatrix() });
    }
  }
}

beforeEach(() => {
  document.body.innerHTML = MARCADO_DE_LA_DEMO;
  prestarMatricesSvgAlEntorno();
});

describe('el marcado servido es el fotograma final', () => {
  it('index.html trae el recuento cerrado: 2 · 1 · 1', () => {
    expect(recuento()).toEqual(['2', '1', '1']);
  });

  it('la línea de tiempo cierra en ese mismo recuento, y una sola vez', () => {
    const recuentos = SESION_DE_MUESTRA.filter((evento) => evento.tipo === 'recuento');
    expect(recuentos).toHaveLength(1);
    expect(EVENTO_DE_RECUENTO).toMatchObject({ tipo: 'recuento', si: 2, condicional: 1, no: 1 });
  });
});

describe('el motor termina donde el HTML empieza', () => {
  it('los cuatro votos del Palco vuelven al texto exacto que sirve la página', () => {
    // El HTML servido ES el fotograma final (D4): lo que se lee sin JavaScript
    // tiene que ser lo mismo a lo que llega el motor. Se anota ANTES de tocar
    // nada y se compara DESPUÉS de despachar la sesión entera.
    const servido = [...document.querySelectorAll('[data-demo] [data-demo-voto]')].map(
      (voto) => voto.textContent,
    );
    expect(servido).toEqual(['SÍ · 74', 'COND · 66', 'SÍ · 88', 'NO · 71']);

    const escena = crearEscena(raizDeLaDemo(), 'corte');
    escena.reiniciar();
    for (const evento of SESION_DE_MUESTRA) escena.aplicar(evento);
    escena.terminar();

    expect(
      [...document.querySelectorAll('[data-demo] [data-demo-voto]')].map((voto) => voto.textContent),
    ).toEqual(servido);
  });

  it('«CONDICIONAL» se abrevia en el Palco y en ningún otro sitio', () => {
    // §5.5 abrevia igual, y por lo mismo: en 390px un asiento mide 73px y la
    // palabra entera se va a 92. Donde hay renglón, la palabra va entera.
    const acta = document.querySelector('[data-demo-acta-recuento]')?.textContent ?? '';
    expect(acta).toContain('CONDICIONAL 1');
    expect(INDEX).toContain('CONDICIONAL</span>');
  });
});

describe('rebobinar deja el recuento a cero', () => {
  it.each(['animado', 'corte'] as const)('en modo %s, y sin rodillo', (modo) => {
    const escena = crearEscena(raizDeLaDemo(), modo);

    escena.reiniciar();

    expect(recuento()).toEqual(['0', '0', '0']);
    // Rebobinar no es un dato que cambie: es el telón bajando. Si las cifras
    // rodasen hacia atrás anunciarían un cambio que no ha ocurrido.
    expect(hanRodado()).toBe(false);
  });
});

describe('las cifras sólo se mueven con el evento `recuento`', () => {
  it('ni los cuatro votos ni ninguna fase anterior las tocan', () => {
    const escena = crearEscena(raizDeLaDemo(), 'corte');
    escena.reiniciar();

    const antesDelRecuento = SESION_DE_MUESTRA.slice(
      0,
      SESION_DE_MUESTRA.findIndex((evento) => evento.tipo === 'recuento'),
    );
    // Que en ese tramo haya votos es lo que hace honesta la comprobación: la
    // mesa ya ha votado 3–1 y el marcador sigue tapado hasta que se proclama.
    expect(antesDelRecuento.filter((evento) => evento.tipo === 'voto')).toHaveLength(4);

    for (const evento of antesDelRecuento) escena.aplicar(evento);

    expect(recuento()).toEqual(['0', '0', '0']);
  });

  it('al despacharlo, la fila proclama 2 · 1 · 1', () => {
    const escena = crearEscena(raizDeLaDemo(), 'corte');
    escena.reiniciar();
    if (!EVENTO_DE_RECUENTO) throw new Error('la sesión perdió su evento de recuento');

    escena.aplicar(EVENTO_DE_RECUENTO);

    expect(recuento()).toEqual(['2', '1', '1']);
  });

  it('y en modo animado ese evento SÍ rueda: es el único que lo hace', () => {
    const escena = crearEscena(raizDeLaDemo(), 'animado');
    escena.reiniciar();
    if (!EVENTO_DE_RECUENTO) throw new Error('la sesión perdió su evento de recuento');
    expect(hanRodado()).toBe(false);

    escena.aplicar(EVENTO_DE_RECUENTO);

    expect(recuento()).toEqual(['2', '1', '1']);
    expect(hanRodado()).toBe(true);
  });
});
