import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useChatStore } from '../../src/store/useChatStore';
import { server } from '../setup';
import { http, HttpResponse } from 'msw';
import { chatService } from '../../src/services/api';

// Mock simple de chatService
vi.mock('../../src/services/api', () => ({
    chatService: {
        createSession: vi.fn(),
        streamChat: vi.fn(),
        sendMessage: vi.fn(),
        getSessions: vi.fn(),
        getSessionHistory: vi.fn(),
        getCustomAgents: vi.fn(),
        createCustomAgent: vi.fn(),
        deleteCustomAgent: vi.fn()
    }
}));

describe('useChatStore - Integración Streaming SSE', () => {
    beforeEach(() => {
        useChatStore.getState().resetState();
        vi.clearAllMocks();
    });

    it('debe orquestar el flujo completo de un artefacto: open -> chunk -> close', async () => {
        // 1. Mock de creación de sesión (en el service mockeado)
        (chatService.createSession as any).mockResolvedValue({
            session_id: 's-123',
            title: 'Test Session'
        });

        await useChatStore.getState().createNewSession();

        // 2. Simular implementación de streamChat
        (chatService.streamChat as any).mockImplementation(async (query: string, sid: string, callbacks: any) => {
            // Simulamos la secuencia de eventos SSE
            callbacks.onToken('Pensando...');
            callbacks.onArtifactOpen({ title: 'Dynamic Art', artifact_type: 'code', language: 'javascript' });
            callbacks.onArtifactChunk('const a = 1;');
            callbacks.onArtifactChunk(' console.log(a);');
            callbacks.onArtifactClose();
            callbacks.onDone();
        });

        // 3. Ejecutar envío de mensaje
        await useChatStore.getState().sendMessage('Genera código');

        const state = useChatStore.getState();
        const artifacts = state.artifacts;

        // 4. Verificaciones
        expect(artifacts.length).toBe(1);
        expect(artifacts[0].title).toBe('Dynamic Art');
        expect(artifacts[0].content).toBe('const a = 1; console.log(a);');
        expect(state.isArtifactPanelOpen).toBe(true);
        expect(state.activeArtifactId).toBe(artifacts[0].id);
    });
});

/**
 * SFS-004 y SFS-005 — caracterización del cierre del turno fallido.
 *
 * `streamHandlers.onError` ya saca la sesión de `streamingSessionIds` y escribe
 * «*La respuesta se cortó aquí.*» ignorando el objeto de error. No hay cambio de
 * producción aquí: estos tests existen para que eso no pueda romperse en
 * silencio cuando el stream EMPIECE a avisar de verdad (SFS-001/002).
 */
describe('el turno fallido cierra el estado de carga y se lee bien', () => {
    beforeEach(() => {
        useChatStore.getState().resetState();
        vi.clearAllMocks();
    });

    const conFalloDeStream = (error: unknown) => {
        (chatService.createSession as any).mockResolvedValue({ session_id: 's1', title: 'Junta' });
        (chatService.streamChat as any).mockImplementation(
            async (_q: string, _sid: string, callbacks: any) => {
                callbacks.onToken('La caja aguanta ');
                callbacks.onError(error);
            },
        );
    };

    it('la sesión sale de streamingSessionIds: nada de spinner infinito', async () => {
        conFalloDeStream(new Error('La conexión se cortó antes de que el turno terminara.'));
        await useChatStore.getState().createNewSession();

        await useChatStore.getState().sendMessage('¿Lanzamos Enterprise?');

        expect(useChatStore.getState().streamingSessionIds).not.toContain('s1');
    });

    it('el texto es presentable aunque el error no traiga mensaje', async () => {
        conFalloDeStream({});
        await useChatStore.getState().createNewSession();

        await useChatStore.getState().sendMessage('¿Lanzamos Enterprise?');

        const mensajes = useChatStore.getState().messagesBySession['s1'];
        const ultimo = mensajes[mensajes.length - 1];
        expect(ultimo.content).toContain('La respuesta se cortó aquí.');
        expect(ultimo.content).not.toContain('[object Object]');
        expect(ultimo.content).not.toContain('undefined');
        expect(ultimo.interrupted).toBe(true);
    });

    it('el texto ya recibido se conserva: el corte marca dónde, no borra', async () => {
        conFalloDeStream(new Error('corte'));
        await useChatStore.getState().createNewSession();

        await useChatStore.getState().sendMessage('¿Lanzamos Enterprise?');

        const mensajes = useChatStore.getState().messagesBySession['s1'];
        expect(mensajes[mensajes.length - 1].content).toContain('La caja aguanta');
    });
});
