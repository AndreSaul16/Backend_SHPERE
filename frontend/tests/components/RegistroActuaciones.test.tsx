import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, cleanup, within } from '@testing-library/react';
import { RegistroActuaciones } from '../../src/components/artifacts/RegistroActuaciones';
import { useChatStore } from '../../src/store/useChatStore';
import { chatService, type StreamCallbacks } from '../../src/services/api';

/**
 * §8.7 «El Registro de Actuaciones» — el telégrafo de eventos reales.
 *
 * «El diferenciador del producto es que los agentes **actúan en el mundo**.
 * Cada actuación real se asienta en un registro visible (…) disparada por
 * `onToolStart`/`onToolResult`/`onToolError` — **nunca por un timer**.»
 * Y: «**Cero bucles. Cero coste en reposo.**»
 *
 * Las tres cosas que se prueban, y cómo:
 *
 *  1. **La región viva existe desde el principio.** `role="log"` +
 *     `aria-live="polite"` montados aunque no haya pasado nada todavía: varios
 *     lectores no anuncian una región que aparece a la vez que su contenido —es
 *     la misma lección que ya está escrita en la región del recuento de la
 *     junta.
 *  2. **Las entradas las escriben los manejadores REALES del stream.** No se
 *     siembra el almacén a mano: se conduce `sendMessage` con los mismos
 *     eventos SSE que manda el backend. Si mañana alguien cambia el manejador y
 *     deja de anotar, esto se cae.
 *  3. **En reposo no hay animación.** Sin actuaciones no hay elemento animado
 *     que valga: ni un bucle, ni una entrada, ni un nodo esperando su turno.
 */

const SID = 'junta-registro';

const abrirSesion = () => {
    useChatStore.setState({
        currentSessionId: SID,
        selectedAgentId: 'group-chat',
        messagesBySession: { [SID]: [] },
    });
};

/** Conduce `sendMessage` guionizando los eventos SSE, y devuelve los callbacks. */
const conducirStream = async (guion: (cb: StreamCallbacks) => void) => {
    let cbs: StreamCallbacks | undefined;
    vi.spyOn(chatService, 'streamChat').mockImplementation(
        async (_q: string, _s: string, cb: StreamCallbacks) => {
            cbs = cb;
            guion(cb);
        },
    );
    await useChatStore.getState().sendMessage('haz cosas en el mundo');
    return cbs as StreamCallbacks;
};

beforeEach(() => {
    useChatStore.getState().resetState();
    vi.restoreAllMocks();
});

afterEach(() => {
    cleanup();
});

describe('Registro de actuaciones — §8.7', () => {
    it('en reposo: la región viva está, y no hay nada animado', () => {
        render(<RegistroActuaciones />);

        const registro = screen.getByRole('log');
        expect(registro).toHaveAttribute('aria-live', 'polite');

        // Cero coste en reposo: sin actuaciones no hay entrada que deslizar.
        expect(screen.queryByTestId('actuacion-entrante')).toBeNull();
        expect(registro).toBeEmptyDOMElement();
    });

    it('una herramienta que arranca se asienta en el registro, deslizándose una vez', async () => {
        abrirSesion();
        await conducirStream((cb) => {
            cb.onToolStart?.({ tool_name: 'notion_create_page', args: {} });
        });

        render(<RegistroActuaciones />);

        const entrada = screen.getByTestId('actuacion-entrante');
        expect(within(screen.getByRole('log')).getByText(/Creando página en Notion/)).toBeInTheDocument();
        expect(entrada).toHaveAttribute('data-estado', 'en-curso');

        // Se desliza y se asienta: una vez, no en bucle.
        expect(entrada.style.animationName).toBe('entrada-de-registro');
        expect(entrada.style.animationIterationCount).toBe('1');
    });

    it('al resolverse, la misma actuación pasa a hecha; si falla, a fallida', async () => {
        abrirSesion();
        const cbs = await conducirStream((cb) => {
            cb.onToolStart?.({ tool_name: 'notion_create_page', args: {} });
        });

        render(<RegistroActuaciones />);
        expect(screen.getByTestId('actuacion-entrante')).toHaveAttribute('data-estado', 'en-curso');

        act(() => {
            cbs.onToolResult?.({ tool_name: 'notion_create_page', result: 'Página creada' });
        });
        expect(screen.getByTestId('actuacion-entrante')).toHaveAttribute('data-estado', 'hecha');

        act(() => {
            cbs.onToolStart?.({ tool_name: 'github_create_issue', args: {} });
            cbs.onToolError?.({ tool_name: 'github_create_issue', error: 'GitHub no respondió' });
        });
        const ultima = screen.getByTestId('actuacion-entrante');
        expect(ultima).toHaveAttribute('data-estado', 'fallida');
        expect(within(screen.getByRole('log')).getByText(/Creando issue/)).toBeInTheDocument();
    });

    it('las antiguas se comprimen en un contador, y sólo se ve la última', async () => {
        abrirSesion();
        const cbs = await conducirStream((cb) => {
            cb.onToolStart?.({ tool_name: 'notion_create_page', args: {} });
        });

        render(<RegistroActuaciones />);
        // Con una sola actuación no hay nada que contar aparte.
        expect(screen.queryByTestId('registro-anteriores')).toBeNull();

        act(() => {
            cbs.onToolStart?.({ tool_name: 'github_create_issue', args: {} });
            cbs.onToolStart?.({ tool_name: 'calendar_create_event', args: {} });
        });

        // Una línea: la última actuación y el recuento de las anteriores.
        expect(screen.getAllByTestId('actuacion-entrante')).toHaveLength(1);
        expect(within(screen.getByRole('log')).getByText(/Creando evento/)).toBeInTheDocument();
        expect(screen.getByTestId('registro-anteriores')).toHaveTextContent('+2');
    });
});
