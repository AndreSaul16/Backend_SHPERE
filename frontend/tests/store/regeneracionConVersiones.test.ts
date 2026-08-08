import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useChatStore } from '../../src/store/useChatStore';
import { chatService } from '../../src/services/api';

/**
 * Tarea 5.11 · Q12 — regenerar conserva la versión anterior.
 *
 * El fallo que cierra: `sendMessage(..., { regenerateFromId })` truncaba el hilo
 * desde esa burbuja y la respuesta anterior desaparecía sin dejar rastro. Con
 * dos versiones pagadas en créditos, la primera se perdía en silencio.
 */

vi.mock('../../src/services/api', () => ({
    chatService: {
        createSession: vi.fn(),
        streamChat: vi.fn(),
        getSessions: vi.fn(),
        getSessionHistory: vi.fn(),
        getCustomAgents: vi.fn(),
    },
}));

/** Un stream que escribe `texto` y termina. */
function streamQueEscribe(texto: string) {
    (chatService.streamChat as any).mockImplementation(
        async (_q: string, _sid: string, callbacks: any) => {
            callbacks.onToken(texto);
            callbacks.onDone();
        },
    );
}

beforeEach(() => {
    useChatStore.getState().resetState();
    vi.clearAllMocks();
    (chatService.createSession as any).mockResolvedValue({ session_id: 's-1', title: 'Junta' });
});

const turnos = () => useChatStore.getState().messagesBySession['s-1'] ?? [];
const ultimo = () => turnos()[turnos().length - 1];

describe('regenerar', () => {
    it('la versión anterior viaja con la nueva burbuja', async () => {
        await useChatStore.getState().createNewSession();

        streamQueEscribe('Primera respuesta.');
        await useChatStore.getState().sendMessage('¿Subimos precios?');
        const primera = ultimo();
        expect(primera.content).toBe('Primera respuesta.');

        streamQueEscribe('Segunda respuesta, mejor.');
        await useChatStore.getState().sendMessage('¿Subimos precios?', {
            regenerateFromId: primera.id,
        });

        const segunda = ultimo();
        expect(segunda.content).toBe('Segunda respuesta, mejor.');
        expect(segunda.versionesPrevias).toEqual(['Primera respuesta.']);
    });

    it('las versiones se acumulan: v1, v2 y la actual', async () => {
        await useChatStore.getState().createNewSession();

        streamQueEscribe('Uno.');
        await useChatStore.getState().sendMessage('Consulta');
        streamQueEscribe('Dos.');
        await useChatStore.getState().sendMessage('Consulta', { regenerateFromId: ultimo().id });
        streamQueEscribe('Tres.');
        await useChatStore.getState().sendMessage('Consulta', { regenerateFromId: ultimo().id });

        expect(ultimo().versionesPrevias).toEqual(['Uno.', 'Dos.']);
    });

    it('regenerar un turno vacío no inventa una v1 que no existe', async () => {
        await useChatStore.getState().createNewSession();

        // Un turno que se cortó antes de escribir nada.
        (chatService.streamChat as any).mockImplementation(
            async (_q: string, _sid: string, callbacks: any) => { callbacks.onDone(); },
        );
        await useChatStore.getState().sendMessage('Consulta');
        const vacio = ultimo();
        expect(vacio.content).toBe('');

        streamQueEscribe('Ahora sí.');
        await useChatStore.getState().sendMessage('Consulta', { regenerateFromId: vacio.id });

        expect(ultimo().versionesPrevias).toBeUndefined();
    });

    it('un envío normal no arrastra versiones de otro turno', async () => {
        await useChatStore.getState().createNewSession();

        streamQueEscribe('Uno.');
        await useChatStore.getState().sendMessage('Consulta');
        streamQueEscribe('Dos.');
        await useChatStore.getState().sendMessage('Consulta', { regenerateFromId: ultimo().id });
        expect(ultimo().versionesPrevias).toEqual(['Uno.']);

        streamQueEscribe('Otro turno distinto.');
        await useChatStore.getState().sendMessage('Otra consulta');
        expect(ultimo().versionesPrevias).toBeUndefined();
    });
});
