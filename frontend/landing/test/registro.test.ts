/**
 * El registro de plugins de GSAP — DIRECCION.md §3.0 y §0.2.7.
 *
 * Se lee el FUENTE, no el módulo. Importarlo solo probaría que no revienta;
 * lo que hay que defender es que nadie añada un cuarto plugin, y eso se ve en
 * los imports. El scroll de esta página es nativo: GSAP lee con `scrub` o fija
 * con `pin`, jamás lo secuestra.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const FUENTE = readFileSync(join(RAIZ, 'src', 'motion', 'registro.ts'), 'utf8');

const PERMITIDOS = ['gsap/ScrollTrigger', 'gsap/SplitText', 'gsap/DrawSVGPlugin'];

function importes(fuente: string): string[] {
  return [...fuente.matchAll(/from\s+'([^']+)'/g)].map((coincidencia) => coincidencia[1] ?? '');
}

describe('src/motion/registro.ts', () => {
  it('importa exactamente gsap y sus tres plugins permitidos', () => {
    expect(importes(FUENTE).sort()).toEqual(['gsap', ...PERMITIDOS].sort());
  });

  it('no importa ningún plugin prohibido', () => {
    for (const prohibido of ['ScrollSmoother', 'Observer', 'Draggable', 'InertiaPlugin', 'CustomEase']) {
      expect(FUENTE, `${prohibido} está prohibido en la landing`).not.toContain(prohibido);
    }
  });

  it('registra los tres plugins en una sola llamada', () => {
    expect(FUENTE).toContain('gsap.registerPlugin(ScrollTrigger, SplitText, DrawSVGPlugin)');
    expect((FUENTE.match(/registerPlugin\(/g) ?? []).length).toBe(1);
  });

  it('es el único fichero que registra plugins', () => {
    const otros = ['arranque.ts', 'canto.ts', 'hero.ts', 'revelar.ts', 'tokens.ts'];
    for (const nombre of otros) {
      const texto = readFileSync(join(RAIZ, 'src', 'motion', nombre), 'utf8');
      expect(texto, `${nombre} no debe registrar plugins`).not.toContain('registerPlugin');
    }
  });
});
