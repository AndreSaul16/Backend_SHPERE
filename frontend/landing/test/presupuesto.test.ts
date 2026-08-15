/**
 * El presupuesto de motion — DIRECCION.md §3.P y checklist §8.16.
 *
 * «≤ 2 bucles durante la demo; **0** con la demo terminada y la página en
 * reposo.» Ese número se mide en la pestaña Animations de un navegador, pero se
 * DEFIENDE aquí: un bucle en esta página sólo puede entrar por un
 * `animation-iteration-count: infinite` en la hoja de estilos o por un
 * temporizador en el fuente, y las dos cosas se cuentan por grep.
 *
 * Hoy el recuento es: **1 bucle** mientras la sesión de muestra se reproduce —el
 * cursor de streaming, que muere al terminar— y **0** en reposo. El cursor del
 * Canto no cuenta: es una animación de una sola iteración ligada al progreso
 * del scroll (`animation-timeline`), que es justo la técnica que §7.7 bendice.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSS = readFileSync(join(RAIZ, 'src', 'styles', 'index.css'), 'utf8');

/**
 * Se cuenta CÓDIGO, no prosa. Los ficheros de este proyecto explican por qué no
 * montan temporizadores nombrándolos, y un grep ingenuo confundiría la promesa
 * con el delito: `odometro.ts` empieza diciendo «ni `setTimeout`, ni
 * `setInterval`» y sería el primero en dar positivo.
 */
function sinComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '');
}

function fuentesDe(directorio: string): { ruta: string; texto: string }[] {
  return readdirSync(directorio).flatMap((entrada) => {
    const completa = join(directorio, entrada);
    if (statSync(completa).isDirectory()) return fuentesDe(completa);
    if (!completa.endsWith('.ts')) return [];
    return [
      {
        ruta: relative(RAIZ, completa),
        texto: sinComentarios(readFileSync(completa, 'utf8')),
      },
    ];
  });
}

const FUENTES = fuentesDe(join(RAIZ, 'src'));

function ficherosCon(patron: RegExp): string[] {
  return FUENTES.filter((fuente) => new RegExp(patron.source).test(fuente.texto)).map(
    (fuente) => fuente.ruta,
  );
}

function apariciones(texto: string, patron: RegExp): number {
  return (texto.match(new RegExp(patron.source, 'g')) ?? []).length;
}

describe('bucles de CSS', () => {
  it('sólo hay UNA animación infinita en toda la hoja de estilos', () => {
    expect(apariciones(CSS, /infinite/)).toBe(1);
  });

  it('y esa animación es el cursor de streaming de la demo', () => {
    const bloque = /\.cursor-demo\s*\{[^}]*animation:[^;]*infinite/;
    expect(bloque.test(CSS)).toBe(true);
  });

  it('el resto de animaciones declaradas corren una sola vez o van con el scroll', () => {
    // `canto-avance` no lleva iteraciones: la pone `animation-timeline: scroll()`.
    expect(CSS).toContain('animation-timeline: scroll(root block)');
    expect(/odometro-rodar var\(--duration-pop\) var\(--ease-settle\) 1/.test(CSS)).toBe(true);
    expect(/odometro-subrayar var\(--duration-reveal\) var\(--ease-settle\) 1/.test(CSS)).toBe(true);
  });

  it('ningún `will-change` escrito a mano: lo pone GSAP y nadie más (§3.P)', () => {
    expect(apariciones(CSS, /will-change/)).toBe(0);
  });
});

describe('relojes en el fuente', () => {
  it('cero `setInterval`: nada se repite solo', () => {
    expect(ficherosCon(/setInterval/)).toEqual([]);
  });

  it('un solo `requestAnimationFrame`, y es el despachador central de la demo', () => {
    expect(ficherosCon(/requestAnimationFrame/)).toEqual(['src/demo/motor.ts']);
  });

  it('un solo `setTimeout`, y mide un GESTO —la pulsación larga del Canto—', () => {
    const ficheros = ficherosCon(/setTimeout/);
    expect(ficheros).toEqual(['src/motion/canto.ts']);

    const canto = FUENTES.find((fuente) => fuente.ruta === 'src/motion/canto.ts');
    expect(apariciones(canto?.texto ?? '', /setTimeout/)).toBe(1);
  });

  it('las piezas de firma no montan ningún reloj (§8.12, §8.8)', () => {
    const piezas = FUENTES.filter((fuente) => fuente.ruta.startsWith('src/piezas/'));
    expect(piezas.length).toBeGreaterThan(0);
    for (const pieza of piezas) {
      expect(pieza.texto, `${pieza.ruta} no debe montar temporizadores`).not.toMatch(
        /setTimeout|setInterval|requestAnimationFrame/,
      );
    }
  });
});

describe('el cursor de streaming muere al terminar', () => {
  it('la escena lo esconde en `terminar`, que es lo que devuelve la página a 0 bucles', () => {
    const escena = FUENTES.find((fuente) => fuente.ruta === 'src/demo/escena.ts');
    expect(escena?.texto).toMatch(/function terminar\(\)[\s\S]*?cursor\.hidden = true/);
  });
});
