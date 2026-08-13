import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { ActaSeal } from '../../src/components/artifacts/ActaSeal';
import { __resetSellosEstampados } from '../../src/components/artifacts/sealRegistry';

/**
 * El Sello — DESIGN §8.3, tarea 2.2.
 *
 * Lo que estas pruebas defienden, en orden de importancia:
 *   1. Que la textura siga viniendo horneada. La tentación de volver a meter
 *      `feTurbulence` en runtime es real y cuesta 4-8 ms de pintado en móvil.
 *   2. Que la anilina sea `aniline-500` literal y no `var(--certify)`, que en
 *      tema oscuro cae a 2.99:1 sobre el papel del acta.
 *   3. Que caiga UNA vez por junta.
 */

const RAIZ = resolve(__dirname, '..', '..');
const FECHA = new Date('2026-08-08T10:00:00Z');

beforeEach(() => __resetSellosEstampados());
afterEach(() => cleanup());

describe('ActaSeal', () => {
    it('anuncia el acta sellada con su fecha, para quien no lo ve', () => {
        render(<ActaSeal sessionId="junta-1" date={FECHA} />);
        expect(screen.getByRole('img', { name: /Acta sellada el 8 de agosto de 2026/ })).toBeTruthy();
    });

    it('lleva la leyenda y la fecha sobre el anillo', () => {
        const { container } = render(<ActaSeal sessionId="junta-1" date={FECHA} />);
        const leyendas = [...container.querySelectorAll('textPath')].map((t) => t.textContent?.trim());
        expect(leyendas).toContain('SPHERE · JUNTA');
        expect(leyendas).toContain('8 AGO 2026');
    });

    it('usa una máscara PRE-RENDERIZADA y ningún filtro de runtime', () => {
        const { container } = render(<ActaSeal sessionId="junta-1" date={FECHA} />);
        const capa = container.querySelector<HTMLElement>('span[aria-hidden="true"]');
        expect(capa).toBeTruthy();
        expect(capa!.className).toContain('acta-seal-stamp');
        expect(capa!.style.getPropertyValue('--seal-src')).toMatch(/^url\(\/seals\/seal-[1-4]\.svg\)$/);
        // Ni un `filter: url(#…)` en todo el sello: es la corrección de la
        // auditoría v3 y el motivo de que los activos existan.
        expect(container.innerHTML).not.toMatch(/filter\s*[:=]/);
        expect(container.innerHTML).not.toContain('url(#');
        expect(container.querySelector('feTurbulence')).toBeNull();
    });

    it('pinta la anilina explícita, no el token de tema `--certify`', () => {
        const { container } = render(<ActaSeal sessionId="junta-1" date={FECHA} />);
        expect(container.querySelector('.bg-aniline-500')).toBeTruthy();
        expect(container.querySelector('.fill-aniline-500')).toBeTruthy();
        expect(container.innerHTML).not.toContain('certify');
    });

    it('da el mismo tampón a la misma junta y reparte entre juntas distintas', () => {
        const de = (sessionId: string) => {
            __resetSellosEstampados();
            const { container, unmount } = render(<ActaSeal sessionId={sessionId} date={FECHA} />);
            const capa = container.querySelector<HTMLElement>('span[aria-hidden="true"]')!;
            const url = capa.style.getPropertyValue('--seal-src');
            unmount();
            return url;
        };
        expect(de('junta-q4')).toBe(de('junta-q4'));
        const variantes = new Set(
            ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'].map((s) => de(`junta-${s}`))
        );
        expect(variantes.size).toBeGreaterThan(1);
    });

    it('cae la primera vez y ya está asentado la segunda', () => {
        const { container, unmount } = render(<ActaSeal sessionId="junta-1" date={FECHA} />);
        // Framer Motion escribe el estado inicial en el DOM al montar; con
        // `skipAnimations` el estado final llega en el mismo tick, así que lo
        // que se comprueba es la DECISIÓN de animar, no el fotograma.
        const primero = container.firstElementChild as HTMLElement;
        expect(primero.dataset.sellado).toBe('cae');
        unmount();

        const segundo = render(<ActaSeal sessionId="junta-1" date={FECHA} />)
            .container.firstElementChild as HTMLElement;
        expect(segundo.dataset.sellado).toBe('asentado');
    });
});

describe('activos horneados de public/seals', () => {
    it('son cuatro, sin filtros dentro y de tamaño razonable', () => {
        const dir = resolve(RAIZ, 'public', 'seals');
        const ficheros = readdirSync(dir).filter((f) => f.endsWith('.svg')).sort();
        expect(ficheros).toEqual(['seal-1.svg', 'seal-2.svg', 'seal-3.svg', 'seal-4.svg']);
        for (const f of ficheros) {
            const svg = readFileSync(resolve(dir, f), 'utf8');
            // Si alguien vuelve a meter el turbulence en el activo, el
            // navegador tendría que ejecutarlo al pintar la máscara.
            expect(svg).not.toContain('feTurbulence');
            expect(svg).not.toContain('<filter');
            expect(svg).toContain('fill-rule="evenodd"');
            expect(Buffer.byteLength(svg)).toBeLessThan(12_000);
        }
    });
});
