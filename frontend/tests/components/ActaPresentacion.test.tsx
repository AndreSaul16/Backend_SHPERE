import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ActaPresentation } from '../../src/components/artifacts/ActaPresentation';
import { partirEnDiapositivas } from '../../src/utils/actaDiapositivas';
import { useChatStore } from '../../src/store/useChatStore';

/**
 * Tarea 5.8 · Q1 — modo presentación del acta.
 *
 * Criterio: «P abre pantalla completa; ←/→ navega; Esc sale». Y la regla de
 * casa: a 390px no hay teclas, así que la navegación tiene que existir también
 * a botón, y la salida tiene que estar SIEMPRE visible — una salida que se
 * descubre moviendo el ratón no sirve en una sala con proyector.
 */

vi.mock('framer-motion', () => {
    const Component = ({ children, ...props }: any) => {
        const { initial, animate, exit, transition, layoutId, ...domProps } = props;
        return <div {...domProps}>{children}</div>;
    };
    return {
        useReducedMotion: () => false,
        AnimatePresence: ({ children }: any) => children,
        motion: new Proxy({}, { get: () => Component }),
    };
});

const ACTA = `# Acta de la junta del 12 de julio

Sesión ordinaria sobre precios.

## Contexto

El precio actual es de 29 euros.

## Deliberación

El CFO discrepa del CTO.

## Sección vacía

## Próximos pasos

- Medir la elasticidad
- Hablar con diez clientes
`;

describe('partir el acta en diapositivas', () => {
    it('la portada sale del `#` y su entradilla', () => {
        const [portada] = partirEnDiapositivas(ACTA, 'Acta de julio');
        expect(portada.tipo).toBe('portada');
        expect(portada.titulo).toBe('Acta de la junta del 12 de julio');
        expect(portada.cuerpo).toContain('Sesión ordinaria');
    });

    it('sin `#` propio, la portada toma el título del artefacto', () => {
        const [portada] = partirEnDiapositivas('## Contexto\n\nAlgo', 'Acta de julio');
        expect(portada.titulo).toBe('Acta de julio');
    });

    it('el recuento es una diapositiva propia y va justo tras la portada', () => {
        const d = partirEnDiapositivas(ACTA, 'x');
        expect(d[1].tipo).toBe('recuento');
    });

    it('los próximos pasos cierran, aunque el acta los traiga en medio', () => {
        const d = partirEnDiapositivas(
            '## Próximos pasos\n\n- Uno\n\n## Contexto\n\nAlgo',
            'x',
        );
        expect(d[d.length - 1].tipo).toBe('pasos');
    });

    it('una sección abierta y sin rellenar no ocupa una diapositiva', () => {
        const d = partirEnDiapositivas(ACTA, 'x');
        expect(d.some((x) => x.titulo === 'Sección vacía')).toBe(false);
    });

    it('la decoración del modelo no llega al título', () => {
        const d = partirEnDiapositivas('## **Contexto**:\n\nAlgo', 'x');
        expect(d.some((x) => x.titulo === 'Contexto')).toBe(true);
    });

    it('un acta vacía sigue dando portada y recuento, no una pantalla en blanco', () => {
        const d = partirEnDiapositivas('', 'Acta de julio');
        expect(d).toHaveLength(2);
        expect(d[0].titulo).toBe('Acta de julio');
    });
});

describe('la presentación en pantalla', () => {
    const abrir = (props: Partial<React.ComponentProps<typeof ActaPresentation>> = {}) =>
        render(
            <ActaPresentation
                open
                onClose={props.onClose ?? vi.fn()}
                title="Acta de julio"
                content={ACTA}
            />,
        );

    beforeEach(() => {
        useChatStore.getState().resetState();
        useChatStore.setState({
            boardSession: {
                active: false, phase: null, participants: ['CTO', 'CFO'], statusByRole: {},
                votes: {
                    CEO: { decision: 'SI', confidence: 80 },
                    CTO: { decision: 'SI', confidence: 75 },
                    CFO: { decision: 'NO', confidence: 92 },
                },
                tally: { SI: 2, NO: 1 }, unanimous: false, earlyExit: false,
                cost: 5, devil: false, lastIntervention: null,
            },
        });
    });

    it('es un diálogo modal de verdad, no una capa muda', () => {
        abrir();
        const capa = screen.getByRole('dialog', { name: /presentación/i });
        expect(capa).toHaveAttribute('aria-modal', 'true');
    });

    it('abre por la portada y dice dónde está', () => {
        abrir();
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
            'Acta de la junta del 12 de julio',
        );
        expect(screen.getByText(/^1 de \d+$/)).toBeInTheDocument();
    });

    it('→ pasa a la siguiente y ← vuelve', () => {
        abrir();
        fireEvent.keyDown(document, { key: 'ArrowRight' });
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Recuento de la junta');
        fireEvent.keyDown(document, { key: 'ArrowLeft' });
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
            'Acta de la junta del 12 de julio',
        );
    });

    it('los botones hacen lo mismo: a 390px son el único camino', () => {
        abrir();
        fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Recuento de la junta');
    });

    it('la diapositiva del recuento pinta los votos del store', () => {
        abrir();
        fireEvent.keyDown(document, { key: 'ArrowRight' });
        // Dos veces a propósito: el veredicto grande de la diapositiva y la
        // etiqueta de la propia barra.
        expect(screen.getAllByText('Junta dividida').length).toBeGreaterThan(0);
        expect(screen.getByRole('meter', { name: /grado de desacuerdo/i })).toBeInTheDocument();
    });

    it('los próximos pasos son el cierre', () => {
        abrir();
        fireEvent.keyDown(document, { key: 'End' });
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/próximos pasos/i);
        expect(screen.getByRole('button', { name: /siguiente/i })).toBeDisabled();
    });

    it('Esc sale', async () => {
        const onClose = vi.fn();
        abrir({ onClose });
        fireEvent.keyDown(document, { key: 'Escape' });
        await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('la salida está siempre en pantalla, no escondida tras un gesto', () => {
        abrir();
        expect(screen.getByRole('button', { name: /salir de la presentación/i })).toBeVisible();
    });

    it('el cambio de diapositiva se anuncia a quien no la ve', () => {
        abrir();
        fireEvent.keyDown(document, { key: 'ArrowRight' });
        expect(screen.getByText(/diapositiva 2 de/i)).toBeInTheDocument();
    });

    it('cerrada no pinta nada', () => {
        const { container } = render(
            <ActaPresentation open={false} onClose={vi.fn()} title="x" content={ACTA} />,
        );
        expect(container).toBeEmptyDOMElement();
    });
});
