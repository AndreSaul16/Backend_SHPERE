/**
 * El SVG tiene que llegar al visor que lo sanea.
 *
 * `SvgViewer` existe, está en su propio trozo perezoso, sanea con DOMPurify y
 * hasta tiene un test que le mete un `<script>` dentro. Lo que no tenía era
 * ninguna forma de que le llegase un artefacto: los dos mapas del almacén no
 * traducían `svg`, así que todo SVG caía a `code` y se pintaba como texto. Una
 * capacidad declarada en cinco sitios y alcanzable en ninguno.
 *
 * Son DOS mapas a propósito —uno para el streaming y otro para el historial— y
 * por eso se prueban por separado: enchufar uno y olvidar el otro es
 * exactamente la clase de fallo que este cambio persigue.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useChatStore } from '../../src/store/useChatStore';
import { chatService, type StreamCallbacks } from '../../src/services/api';
import { mapSessionHistory } from '../../src/store/chat/historyMapper';

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

const SID = 's-svg';
const stream = chatService.streamChat as never as ReturnType<typeof vi.fn>;
const SVG = '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';

beforeEach(() => {
    useChatStore.getState().resetState();
    vi.clearAllMocks();
    useChatStore.setState({
        currentSessionId: SID,
        selectedAgentId: 'group-chat',
        messagesBySession: { [SID]: [] },
    });
});

describe('AV-003 · el almacén produce artefactos svg', () => {
    it('el streaming crea un artefacto de tipo svg', async () => {
        stream.mockImplementation(async (_q: string, _s: string, cb: StreamCallbacks) => {
            cb.onArtifactOpen?.({ title: 'Diagrama', artifact_type: 'svg', language: '', type_status: 'ok' });
            cb.onArtifactChunk?.(SVG);
            cb.onArtifactClose?.({ content_status: 'ok' });
            cb.onDone?.();
        });

        await useChatStore.getState().sendMessage('dibújame algo');

        const [artefacto] = useChatStore.getState().artifacts;
        expect(artefacto.type).toBe('svg');
        expect(artefacto.content).toBe(SVG);
    });

    it('el historial recupera un artefacto de tipo svg', () => {
        const { artifacts } = mapSessionHistory(
            [{
                type: 'ai',
                content: `Aquí lo tienes:\n<sphere_artifact title="Diagrama" type="svg">${SVG}</sphere_artifact>`,
                additional_kwargs: {},
            }],
            SID,
            [],
        );

        expect(artifacts).toHaveLength(1);
        expect(artifacts[0].type).toBe('svg');
        expect(artifacts[0].content).toBe(SVG);
    });

    it('un tipo que sigue sin existir sigue cayendo a código', () => {
        // La lista blanca no se abre de par en par: sólo entra `svg`.
        const { artifacts } = mapSessionHistory(
            [{
                type: 'ai',
                content: '<sphere_artifact title="X" type="markdwon">texto</sphere_artifact>',
                additional_kwargs: {},
            }],
            SID,
            [],
        );

        expect(artifacts[0].type).toBe('code');
    });
});
