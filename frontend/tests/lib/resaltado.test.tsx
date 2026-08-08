import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';

import { LENGUAJES_RESALTADOS, lenguajeSoportado } from '../../src/lib/resaltado';
import { CodigoMarkdown } from '../../src/components/shared/CodigoMarkdown';

/**
 * Tareas 4.3 y 4.4 — un solo motor de resaltado, y ligero.
 *
 * Lo que estos tests defienden, y que la app no puede decir sola:
 *
 * 1. Que las ocho gramáticas están registradas de verdad. `prism-light` no
 *    registra ninguna por su cuenta, así que un import que se caiga en un
 *    refactor deja el bloque sin colorear y NADA falla.
 * 2. Que un lenguaje que no está registrado se pinta sin colorear en vez de
 *    tumbar el turno: `refractor` lanza si le piden una gramática que no tiene,
 *    y el modelo escribe ```rust cuando le apetece.
 * 3. Que el código EN LÍNEA no pasa por el resaltado. Es la frontera que se
 *    cruza sola: `react-markdown` usa el mismo componente `code` para los dos.
 */
describe('resaltado — el censo de gramáticas', () => {
    it('registra exactamente las ocho gramáticas del contrato', () => {
        expect([...LENGUAJES_RESALTADOS]).toEqual([
            'bash', 'javascript', 'json', 'markdown',
            'python', 'sql', 'typescript', 'yaml',
        ]);
    });

    it('reconoce los alias con los que los modelos escriben la valla', () => {
        for (const alias of ['ts', 'tsx', 'js', 'jsx', 'py', 'sh', 'shell', 'yml', 'md']) {
            expect(lenguajeSoportado(alias), alias).toBe(true);
        }
    });

    it('no reconoce lo que no está registrado, ni el vacío', () => {
        expect(lenguajeSoportado('rust')).toBe(false);
        expect(lenguajeSoportado('brainfuck')).toBe(false);
        expect(lenguajeSoportado(undefined)).toBe(false);
        expect(lenguajeSoportado(null)).toBe(false);
        expect(lenguajeSoportado('')).toBe(false);
    });
});

const pintar = (markdown: string) =>
    render(
        <div className="doc-prose">
            <ReactMarkdown rehypePlugins={[rehypeSanitize]} components={{ code: CodigoMarkdown }}>
                {markdown}
            </ReactMarkdown>
        </div>
    );

describe('CodigoMarkdown — el bloque cercado del turno', () => {
    it('tokeniza un bloque de un lenguaje registrado', () => {
        const { container } = pintar('```typescript\nconst saldo: number = 5;\n```');
        // Resaltar es partir el texto en spans con clase de token. Si el
        // resaltado no corriera, el `<code>` tendría UN solo nodo de texto.
        const tokens = container.querySelectorAll('code span');
        expect(tokens.length).toBeGreaterThan(3);
        expect(container.textContent).toContain('const');
        expect(container.textContent).toContain('saldo');
    });

    it('resuelve el alias: ```ts colorea igual que ```typescript', () => {
        const { container } = pintar('```ts\nconst a = 1;\n```');
        expect(container.querySelectorAll('code span').length).toBeGreaterThan(3);
    });

    it('un lenguaje no registrado se pinta entero y sin colorear, sin lanzar', () => {
        const fuente = 'fn main() { println!("hola"); }';
        const { container } = pintar('```rust\n' + fuente + '\n```');
        expect(container.textContent).toContain(fuente);
        // Sin tokenizar: el `<code>` conserva el texto de una pieza.
        expect(container.querySelectorAll('code span')).toHaveLength(0);
    });

    it('el código en línea no pasa por el resaltado', () => {
        const { container } = pintar('El saldo vive en `pro_messages_balance`.');
        const enLinea = container.querySelector('code');
        expect(enLinea?.textContent).toBe('pro_messages_balance');
        expect(enLinea?.querySelectorAll('span')).toHaveLength(0);
    });
});
