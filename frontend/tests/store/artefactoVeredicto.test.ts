/**
 * El veredicto tiene que llegar hasta el `Artifact` del almacén.
 *
 * Es el tramo que `tsc` NO puede vigilar: los campos son opcionales a
 * propósito, así que un manejador que se olvide de reenviarlos compila limpio y
 * el aviso desaparece sin que nada se ponga rojo. Esta prueba recorre el camino
 * entero —evento SSE → `createStreamHandlers` → `artifacts` del store— porque
 * es el único sitio donde ese olvido se ve.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useChatStore } from '../../src/store/useChatStore';
import { chatService, type StreamCallbacks } from '../../src/services/api';

vi.mock('../../src/services/api', () => ({
    chatService: {
        getSessions: vi.fn(),
        getCustomAgents: vi.fn(),
        createCustomAgent: vi.fn(),
        deleteCustomAgent: vi.fn(),
        createSession: vi.fn(),
        getSessionHistory: vi.fn(),
        updateSession: vi.fn(),
        deleteSession: vi.fn(),
        streamChat: vi.fn(),
    },
}));

const SID = 's-veredicto';
const stream = chatService.streamChat as never as ReturnType<typeof vi.fn>;

const abrirSesion = () => {
    useChatStore.setState({
        currentSessionId: SID,
        selectedAgentId: 'group-chat',
        messagesBySession: { [SID]: [] },
    });
};

const enviar = async (guion: (cb: StreamCallbacks) => void) => {
    stream.mockImplementation(async (_q: string, _s: string, cb: StreamCallbacks) => guion(cb));
    await useChatStore.getState().sendMessage('hazme un documento');
};

const artefactos = () => useChatStore.getState().artifacts;

beforeEach(() => {
    useChatStore.getState().resetState();
    vi.clearAllMocks();
    abrirSesion();
});

describe('el veredicto del tipo llega al artefacto del almacén', () => {
    it('un tipo desconocido deja `typeStatus` y `declaredType` en el artefacto', async () => {
        await enviar((cb) => {
            cb.onArtifactOpen?.({
                title: 'Plan',
                artifact_type: 'code',
                language: '',
                declared_type: 'markdwon',
                type_status: 'unknown',
            });
            cb.onArtifactChunk?.('el plan entero');
            cb.onArtifactClose?.({ content_status: 'unchecked' });
            cb.onDone?.();
        });

        const [artefacto] = artefactos();
        expect(artefacto.typeStatus).toBe('unknown');
        expect(artefacto.declaredType).toBe('markdwon');
        expect(artefacto.type).toBe('code');
        expect(artefacto.content).toBe('el plan entero');
    });

    it('un tipo válido no inventa veredicto', async () => {
        await enviar((cb) => {
            cb.onArtifactOpen?.({
                title: 'Diagrama',
                artifact_type: 'mermaid',
                language: '',
                type_status: 'ok',
            });
            cb.onArtifactClose?.({ content_status: 'ok' });
            cb.onDone?.();
        });

        const [artefacto] = artefactos();
        expect(artefacto.typeStatus).toBe('ok');
        expect(artefacto.declaredType).toBeUndefined();
        expect(artefacto.type).toBe('mermaid');
    });
});

describe('el veredicto del cierre llega al artefacto del almacén', () => {
    it('el corte por tamaño se anota en el artefacto, no sólo en el canal', async () => {
        await enviar((cb) => {
            cb.onArtifactOpen?.({ title: 'Bucle', artifact_type: 'code', language: '', type_status: 'ok' });
            cb.onArtifactChunk?.('un montón de texto');
            cb.onArtifactClose?.({
                truncated: true,
                reason: 'size_limit',
                limit_bytes: 262144,
                content_status: 'unchecked',
            });
            cb.onDone?.();
        });

        const [artefacto] = artefactos();
        expect(artefacto.truncated).toBe(true);
        expect(artefacto.truncatedReason).toBe('size_limit');
        // El contenido recibido se conserva entero: el corte etiqueta, no borra.
        expect(artefacto.content).toBe('un montón de texto');
    });

    it('un contenido que no encaja con su tipo se anota como `mismatch`', async () => {
        await enviar((cb) => {
            cb.onArtifactOpen?.({ title: 'Tabla', artifact_type: 'csv', language: '', type_status: 'ok' });
            cb.onArtifactChunk?.('esto es prosa sin separadores');
            cb.onArtifactClose?.({ content_status: 'mismatch' });
            cb.onDone?.();
        });

        const [artefacto] = artefactos();
        expect(artefacto.contentStatus).toBe('mismatch');
        expect(artefacto.type).toBe('data_table');
    });

    it('el cierre sigue soltando el canal del artefacto', async () => {
        await enviar((cb) => {
            cb.onArtifactOpen?.({ title: 'Acta', artifact_type: 'markdown', language: '', type_status: 'ok' });
            cb.onArtifactChunk?.('contenido');
            cb.onArtifactClose?.({ truncated: true, reason: 'stream_ended', content_status: 'unchecked' });
            cb.onDone?.();
        });

        expect(useChatStore.getState().streamingArtifactBySession[SID]).toBeNull();
    });

    it('un backend sin veredicto deja el artefacto sin avisos', async () => {
        await enviar((cb) => {
            cb.onArtifactOpen?.({ title: 'Acta', artifact_type: 'markdown', language: '' });
            cb.onArtifactChunk?.('contenido');
            cb.onArtifactClose?.();
            cb.onDone?.();
        });

        const [artefacto] = artefactos();
        expect(artefacto.truncated).toBeFalsy();
        expect(artefacto.contentStatus).toBeUndefined();
        expect(artefacto.typeStatus).not.toBe('unknown');
    });
});
