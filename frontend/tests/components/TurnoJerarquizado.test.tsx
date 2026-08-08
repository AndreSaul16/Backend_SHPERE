import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageBubble } from '../../src/components/chat/MessageBubble';
import type { Message } from '../../src/types';

/**
 * Tarea 2.3 — «una respuesta con encabezados y tabla se ve jerarquizada».
 *
 * El turno del transcript se pinta dentro de `.doc-prose` (§P1), así que la
 * jerarquía la da el CSS del documento y no una sobrecarga por elemento. Lo que
 * estas pruebas defienden es justamente eso: que NO vuelvan las seis
 * sobrecargas que peleaban con `.doc-prose` y le ganaban por especificidad,
 * todas escritas además en la paleta anterior.
 */

vi.mock('framer-motion', () => {
    const Component = ({ children, ...props }: any) => {
        const { initial, animate, exit, transition, layoutId, layout, variants,
            whileHover, whileTap, whileFocus, ...domProps } = props;
        return <div {...domProps}>{children}</div>;
    };
    return {
        AnimatePresence: ({ children }: any) => children,
        motion: new Proxy({}, { get: () => Component }),
        useReducedMotion: () => false,
    };
});

vi.mock('../../src/hooks/useUserAvatar', () => ({ useUserAvatar: () => null }));

const RICO = `# Recomendación

## Qué se decide

Se **pospone**, con una *reserva*. Ver el [informe](https://example.com) y \`ARR_Q4\`.

### Condiciones

- Cerrar la ronda

> El disenso se registra en acta.

| Concepto | Q4 |
|---|---:|
| Ingresos | 148.000 € |

---
`;

const turno = (content: string): Message => ({
    id: 'm1', role: 'CEO', content, agentId: 'ceo-1', timestamp: new Date(),
});

const pintar = (md: string) => render(<MessageBubble message={turno(md)} />);

describe('el turno del transcript es un documento', () => {
    it('saca los seis niveles de encabezado, la cita, el enlace y la regla', () => {
        const { container } = pintar(RICO);
        expect(container.querySelector('h1')?.textContent).toBe('Recomendación');
        expect(container.querySelector('h2')?.textContent).toBe('Qué se decide');
        expect(container.querySelector('h3')?.textContent).toBe('Condiciones');
        expect(container.querySelector('blockquote')).toBeTruthy();
        expect(container.querySelector('hr')).toBeTruthy();
        expect(container.querySelector('strong')?.textContent).toBe('pospone');
        expect(container.querySelector('em')?.textContent).toBe('reserva');
        expect(screen.getByRole('link', { name: 'informe' })).toBeTruthy();
    });

    it('los pinta con la tipografía del documento, no con la suya', () => {
        const { container } = pintar(RICO);
        const prosa = container.querySelector('.doc-prose');
        expect(prosa).toBeTruthy();
        // El peldaño de menos: la escala de la hoja está diseñada para 68ch y
        // en una burbuja de 390px un h1 a 33px no cabe ni en una línea.
        expect(prosa!.className).toContain('doc-prose--turno');

        // Ninguna sobrecarga por elemento: si vuelve una, vuelve el markdown
        // con dos sistemas tipográficos a la vez.
        for (const sel of ['h1', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'em', 'strong', 'a']) {
            const el = container.querySelector(sel);
            if (el) expect(el.className).toBe('');
        }
    });

    it('no deja restos de la paleta anterior en el código ni en la cita', () => {
        const { container } = pintar(RICO);
        expect(container.innerHTML).not.toContain('electric-cyan');
    });

    it('la tabla se desplaza en su contenedor y no rompe la burbuja (§9.7)', () => {
        const { container } = pintar(RICO);
        const tabla = container.querySelector('table');
        expect(tabla).toBeTruthy();
        expect(tabla!.closest('.doc-table-scroll')).toBeTruthy();
    });
});
