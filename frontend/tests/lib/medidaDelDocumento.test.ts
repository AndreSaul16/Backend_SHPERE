import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * La medida del documento: 60ch, y los dos tokens de acuerdo.
 *
 * ── Por qué existe este test ───────────────────────────────────────────────
 * El contrato decía `68ch` con la anotación «(~72 caracteres)». El paréntesis
 * decía la intención correcta y el número la implementaba mal para esta cara:
 * `ch` es el ancho del glifo «0», y en una tipografía proporcional el carácter
 * medio de prosa es más estrecho. Medido en Chromium contra la hoja de estilos
 * real, con prosa española de acta y recuento carácter a carácter con `Range`:
 *
 *     68ch  →  630,0px  →  82,1 caracteres/línea   (fuera de la ventana 65-75)
 *     60ch  →  555,8px  →  72,5 caracteres/línea   ✓
 *
 * (1ch = 9,264px en Literata Regular a 16px.)
 *
 * ── Por qué se comprueba en el FUENTE y no renderizando ────────────────────
 * Porque en jsdom no hay métricas tipográficas: todo mide 0. Un test que
 * «midiera» la medida en jsdom daría verde con cualquier valor, que es peor que
 * no tenerlo. Lo que este test sí puede garantizar —y es donde estaría el
 * error— es que los DOS tokens siguen diciendo lo mismo: `.doc-prose` consume
 * `--container-measure`, así que cambiar sólo `--measure-doc` no cambiaría nada
 * en pantalla y dejaría el contrato mintiendo.
 *
 * La medición de verdad vive en DESIGN §4.2, con su tabla y su método.
 */
const css = fs.readFileSync(
    path.resolve(import.meta.dirname, '../../src/index.css'),
    'utf8',
);

const MEDIDA = '60ch';

describe('la medida del documento', () => {
    it(`--measure-doc es min(${MEDIDA}, 100% - 32px)`, () => {
        expect(css).toMatch(/--measure-doc:\s*min\(60ch,\s*100% - 32px\)/);
    });

    it(`--container-measure es ${MEDIDA}`, () => {
        // Es el que de verdad aplica `.doc-prose`.
        expect(css).toMatch(/--container-measure:\s*60ch/);
    });

    it('los dos tokens dicen el mismo número', () => {
        const doc = /--measure-doc:\s*min\((\d+)ch/.exec(css)?.[1];
        const contenedor = /--container-measure:\s*(\d+)ch/.exec(css)?.[1];
        expect(doc).toBeDefined();
        expect(contenedor).toBeDefined();
        expect(doc).toBe(contenedor);
    });

    it('`.doc-prose` sigue consumiendo `--container-measure`', () => {
        // Si alguien lo cambia por un valor literal, los tokens dejan de
        // gobernar la medida y este fichero se convierte en decoración.
        expect(css).toMatch(/\.doc-prose\{[^}]*max-inline-size:\s*var\(--container-measure\)/s);
    });
});
