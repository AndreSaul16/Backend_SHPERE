import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MessageBubble } from '../../src/components/chat/MessageBubble';
import { AGENT_HEX } from '../../src/store/chat/agentCatalog';
import type { Agent, Message, Role } from '../../src/types';

/**
 * Viveza-1 · §2.8 «Relleno de identidad», ahora NORMATIVO.
 *
 * Triage: todas las burbujas de agente compartían `bg-ai-bubble`
 * (`--surface-2`, plano) y la identidad quedaba en un filete de 2px más el
 * nombre coloreado; la placa del director va `hidden sm:flex`, o sea que en
 * móvil el filete era TODA la señal. La burbuja del usuario, en cambio, sí
 * llevaba relleno (`bg-user-bubble/12`).
 *
 * Este fichero comprueba las dos mitades del contrato:
 *  1. El DOM: el turno de un director lleva su relleno, derivado de la misma
 *     fuente de color que el filete, y el turno del usuario NO cambia.
 *  2. `index.css`: los dos temas definen el suelo y la proporción — 12% sobre
 *     `baize-900` en oscuro, 10% sobre `paper-100` en claro. En jsdom no hay
 *     hoja de estilos que resolver, así que el contrato del tema se lee del
 *     fichero, como ya hace `RowActions.a11y.test.tsx`.
 *
 * P5 se mantiene: el relleno es un canal ADICIONAL. El filete de 2px y el
 * nombre en versalitas siguen ahí, así que la identidad nunca depende del
 * color a solas.
 */

const director = (role: Role, hexColor: string): Agent => ({
    id: `${role}-1`,
    name: role === 'CTO' ? 'Nexus técnico' : 'Oberon ejecutivo',
    role,
    avatar: 'N',
    description: '',
    color: '',
    hexColor,
    isOnline: true,
});

const turno = (role: Role): Message => ({
    id: `m-${role}`,
    role,
    content: 'La propuesta se sostiene.',
    timestamp: new Date('2026-08-14T10:00:00Z'),
    agentId: `${role}-1`,
});

/** La burbuja del turno — el mismo asidero que ya usa TranscriptIdentidad. */
const burbuja = (container: HTMLElement) =>
    container.querySelector<HTMLElement>('[data-row]')!;

describe('§2.8 — el turno de un director lleva su relleno de identidad', () => {
    it('el relleno del CTO sale de la variable de su rol', () => {
        const { container } = render(
            <MessageBubble message={turno('CTO')} agent={director('CTO', AGENT_HEX.CTO)} />,
        );

        const fondo = burbuja(container).style.backgroundColor;
        expect(fondo).toContain('--agent-cto');
        expect(fondo).toContain(AGENT_HEX.CTO);
    });

    it('cada director tiñe distinto: el relleno no es una superficie compartida', () => {
        const cto = render(
            <MessageBubble message={turno('CTO')} agent={director('CTO', AGENT_HEX.CTO)} />,
        );
        const ceo = render(
            <MessageBubble message={turno('CEO')} agent={director('CEO', AGENT_HEX.CEO)} />,
        );

        const fondoCto = burbuja(cto.container).style.backgroundColor;
        const fondoCeo = burbuja(ceo.container).style.backgroundColor;

        expect(fondoCto).toContain('--agent-cto');
        expect(fondoCeo).toContain('--agent-ceo');
        // El fallo que se arregla: los dos eran EXACTAMENTE el mismo fondo.
        expect(fondoCto).not.toBe(fondoCeo);
    });

    it('el relleno sigue al tema en vez de clavar el paño oscuro', () => {
        const { container } = render(
            <MessageBubble message={turno('CEO')} agent={director('CEO', AGENT_HEX.CEO)} />,
        );

        const fondo = burbuja(container).style.backgroundColor;
        // La proporción y el suelo los pone el TEMA, no el componente: es lo
        // que hace que el mismo turno valga en paño y en papel.
        expect(fondo).toContain('var(--relleno-identidad-pct)');
        expect(fondo).toContain('var(--relleno-identidad-base)');
    });

    it('el filete de 2px y el nombre en versalitas siguen ahí (P5: nunca sólo color)', () => {
        const { container, getByText } = render(
            <MessageBubble message={turno('CTO')} agent={director('CTO', AGENT_HEX.CTO)} />,
        );

        // El filete del canto conserva la identidad — es el segundo canal.
        expect(burbuja(container).style.borderInlineStartColor).toContain('--agent-cto');
        // Y el tercero: el nombre del director, coloreado.
        expect(getByText('Nexus')).toBeInTheDocument();
    });

    it('el turno del USUARIO no cambia: sigue sin relleno de identidad en línea', () => {
        const mensajeUsuario: Message = {
            id: 'm-user',
            role: 'user',
            content: '¿Aguanta la caja?',
            timestamp: new Date('2026-08-14T10:00:00Z'),
        };

        const { container } = render(<MessageBubble message={mensajeUsuario} />);

        const caja = burbuja(container);
        // Su relleno lo sigue poniendo `bg-user-bubble/12`, no un estilo en
        // línea: este ciclo NO toca la burbuja del usuario.
        expect(caja.style.backgroundColor).toBe('');
        // Pero su filete de identidad sí sigue en su sitio.
        expect(caja.style.borderInlineEndColor).toContain('--agent-user');
    });
});

describe('§2.8 — el contrato de los dos temas vive en `index.css`', () => {
    const css = readFileSync(resolve(__dirname, '../../src/index.css'), 'utf8');

    /** El bloque de reglas que sigue a un selector, hasta su llave de cierre. */
    const bloque = (selector: string) => {
        const desde = css.indexOf(selector);
        expect(desde, `no se encontró el selector ${selector}`).toBeGreaterThan(-1);
        return css.slice(desde, css.indexOf('\n}', desde));
    };

    it('el tema oscuro tiñe al 12% sobre baize-900 (receta literal de §2.8)', () => {
        // §2.8: «12% de alpha sobre baize-900 — Nexus da #0B2C24 (1.21:1 vs el
        // fondo) e ink-100 encima sigue en 12.80:1. Por encima del 12% el
        // transcript se convierte en un arcoíris».
        const oscuro = bloque('/* ═══ TEMA OSCURO');
        expect(oscuro).toMatch(/--relleno-identidad-pct:\s*12%/);
        expect(oscuro).toMatch(/--relleno-identidad-base:\s*var\(--baize-900\)/);
    });

    it('el tema claro tiñe al 10% sobre paper-100', () => {
        const claro = bloque('[data-theme="light"]{');
        expect(claro).toMatch(/--relleno-identidad-pct:\s*10%/);
        expect(claro).toMatch(/--relleno-identidad-base:\s*var\(--paper-100\)/);
    });
});
