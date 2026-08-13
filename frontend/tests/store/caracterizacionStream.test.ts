/**
 * Caracterización de `sendMessage` y de los manejadores del stream — D40.
 *
 * Igual que su hermano `caracterizacionStore.test.ts`: fija lo que el store HACE
 * hoy antes de partirlo en slices, no lo que debería hacer.
 *
 * Lo que se caracteriza aquí es la parte más difícil de trocear del fichero: los
 * ~20 callbacks SSE comparten tres variables mutables por cierre
 * —`activeBotMsgId`, `bubbleByRole` y `claimedInitial`— y de ellas depende a qué
 * burbuja va cada token. Si el troceo rompe ese estado compartido, los tokens
 * del CFO acaban en la burbuja del CTO y nadie lo nota hasta producción.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useChatStore } from '../../src/store/useChatStore';
import { chatService, type StreamCallbacks } from '../../src/services/api';
import { __resetToastBus, subscribeToasts, type ToastRecord } from '../../src/lib/toastBus';

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

const SID = 's-stream';
const stream = chatService.streamChat as never as ReturnType<typeof vi.fn>;

/** Deja el store con una sesión abierta y sin pasar por `createNewSession`. */
const abrirSesion = (agentId: string | null = 'group-chat') => {
    useChatStore.setState({ currentSessionId: SID, selectedAgentId: agentId, messagesBySession: { [SID]: [] } });
};

/** Ejecuta `sendMessage` guionizando los eventos SSE que emite el backend. */
const enviar = async (guion: (cb: StreamCallbacks) => void, texto = 'hola') => {
    stream.mockImplementation(async (_q: string, _s: string, cb: StreamCallbacks) => guion(cb));
    await useChatStore.getState().sendMessage(texto);
};

const mensajes = () => useChatStore.getState().messagesBySession[SID] ?? [];
const board = () => useChatStore.getState().boardSession;

beforeEach(() => {
    useChatStore.getState().resetState();
    vi.clearAllMocks();
    __resetToastBus();
});

// ------------------------------------------------------- antes del stream

describe('sendMessage — lo que ocurre antes del primer token', () => {
    it('en junta: mensaje de usuario, burbuja inicial del CEO y war-room en blanco', async () => {
        abrirSesion('group-chat');
        await enviar(() => {});

        const [usuario, bot] = mensajes();
        expect(usuario.role).toBe('user');
        expect(usuario.content).toBe('hola');
        // La junta abre optimista como CEO para no enseñar una burbuja de sistema vacía.
        expect(bot.role).toBe('CEO');
        expect(bot.agentId).toBe('ceo-1');
        expect(bot.content).toBe('');

        expect(board()).toEqual({
            active: false,
            phase: null,
            participants: [],
            statusByRole: {},
            votes: {},
            tally: null,
            unanimous: false,
            earlyExit: false,
            cost: 5,
            devil: false,
            lastIntervention: null,
        });
    });

    it('en 1-a-1: la burbuja lleva el rol del agente y el war-room se retira', async () => {
        useChatStore.setState({ boardSession: { active: true } as never });
        abrirSesion('cto-1');
        await enviar(() => {});

        expect(mensajes()[1].role).toBe('CTO');
        expect(mensajes()[1].agentId).toBe('cto-1');
        expect(board()).toBeNull();
    });

    it('con un agente desconocido la burbuja nace de sistema', async () => {
        abrirSesion('fantasma');
        await enviar(() => {});

        expect(mensajes()[1].role).toBe('system');
        expect(mensajes()[1].agentId).toBe('fantasma');
    });

    it('el coste optimista es 5 en junta y 1 en 1-a-1, y el rol destino sólo viaja en 1-a-1', async () => {
        abrirSesion('group-chat');
        await enviar(() => {});
        expect(stream.mock.calls[0][3]).toBeUndefined();
        expect(stream.mock.calls[0][5]).toBe(false);
        expect(stream.mock.calls[0][6]).toBe(5);

        useChatStore.getState().resetState();
        stream.mockClear();
        abrirSesion('cfo-1');
        await enviar(() => {});
        expect(stream.mock.calls[0][3]).toBe('CFO');
        expect(stream.mock.calls[0][6]).toBe(1);
    });

    it('un agente a medida (`specialist`) manda su id en vez de su rol', async () => {
        useChatStore.setState({
            customAgents: [{ id: 'uuid-9', name: 'Analista', role: 'specialist', hexColor: '#fff' }] as never,
        });
        abrirSesion('uuid-9');
        await enviar(() => {});

        expect(stream.mock.calls[0][3]).toBe('uuid-9');
    });

    it('sin sesión abierta, `sendMessage` crea una antes de enviar', async () => {
        (chatService.createSession as never as ReturnType<typeof vi.fn>).mockResolvedValue({ session_id: 's-auto' });
        useChatStore.setState({ currentSessionId: null, selectedAgentId: 'cto-1' });

        stream.mockResolvedValue(undefined);
        await useChatStore.getState().sendMessage('hola');

        expect(chatService.createSession).toHaveBeenCalledTimes(1);
        expect(useChatStore.getState().currentSessionId).toBe('s-auto');
        // Saludo + usuario + burbuja del bot.
        expect(useChatStore.getState().messagesBySession['s-auto']).toHaveLength(3);
    });

    it('regenerar trunca desde el mensaje pinchado y NO añade turno de usuario', async () => {
        useChatStore.setState({
            currentSessionId: SID,
            selectedAgentId: 'cto-1',
            messagesBySession: {
                [SID]: [
                    { id: 'u1', role: 'user', content: 'p', timestamp: new Date() },
                    { id: 'b1', role: 'CTO', content: 'r1', timestamp: new Date() },
                ],
            },
        });

        stream.mockResolvedValue(undefined);
        await useChatStore.getState().sendMessage('p', { regenerateFromId: 'b1' });

        const ms = mensajes();
        expect(ms.map((m) => m.id)).toEqual(['u1', expect.any(String)]);
        expect(ms[1].content).toBe('');
        // El backend se entera de que es una regeneración.
        expect(stream.mock.calls[0][5]).toBe(true);
    });

    it('regenerar desde un id que ya no existe deja el hilo intacto', async () => {
        useChatStore.setState({
            currentSessionId: SID,
            selectedAgentId: 'cto-1',
            messagesBySession: {
                [SID]: [{ id: 'u1', role: 'user', content: 'p', timestamp: new Date() }],
            },
        });

        stream.mockResolvedValue(undefined);
        await useChatStore.getState().sendMessage('p', { regenerateFromId: 'no-existe' });

        expect(mensajes().map((m) => m.id)).toEqual(['u1', expect.any(String)]);
    });
});

// -------------------------------------------------------- texto y etiquetas

describe('tokens, rol y razonamiento', () => {
    it('los tokens sin rol se acumulan en la burbuja activa', async () => {
        abrirSesion('cto-1');
        await enviar((cb) => {
            cb.onToken('Hola', null);
            cb.onToken(' mundo', null);
        });

        expect(mensajes()[1].content).toBe('Hola mundo');
    });

    it('`onRole` reetiqueta la burbuja activa y le pone el agente que responde', async () => {
        abrirSesion('group-chat');
        await enviar((cb) => cb.onRole('CFO'));

        expect(mensajes()[1].role).toBe('CFO');
        expect(mensajes()[1].agentId).toBe('cfo-1');
    });

    it('`onThinking` acumula en `thinking`, no en `content`', async () => {
        abrirSesion('cto-1');
        await enviar((cb) => {
            cb.onThinking?.('pien', null);
            cb.onThinking?.('so', null);
        });

        expect(mensajes()[1].thinking).toBe('pienso');
        expect(mensajes()[1].content).toBe('');
    });
});

// ------------------------------------------------------------- war-room

describe('war-room en vuelo', () => {
    it('`onBoardStart` cuela la nota de sistema JUSTO ANTES de la burbuja activa', async () => {
        abrirSesion('group-chat');
        await enviar((cb) => cb.onBoardStart?.({ agents: ['CTO', 'CFO'], iterations: 2 }));

        const ms = mensajes();
        expect(ms).toHaveLength(3);
        expect(ms[1].role).toBe('system');
        expect(ms[1].content).toContain('CTO, CFO');
        expect(ms[2].content).toBe('');
        expect(board()!.active).toBe(true);
    });

    it('`onBoardPlan` fija participantes, coste y a todos en `idle`', async () => {
        abrirSesion('group-chat');
        await enviar((cb) => cb.onBoardPlan?.({ participants: ['CTO', 'CFO'], cost: 3 }));

        expect(board()).toMatchObject({
            active: true,
            participants: ['CTO', 'CFO'],
            cost: 3,
            statusByRole: { CTO: 'idle', CFO: 'idle' },
        });
    });

    it('cada `onBoardAgent` abre su burbuja: el primero reclama la inicial vacía', async () => {
        abrirSesion('group-chat');
        await enviar((cb) => {
            cb.onBoardAgent?.({ role: 'CEO', is_conclusion: false, phase: 'opening' });
            cb.onToken('abro', 'CEO');
            cb.onBoardAgent?.({ role: 'CTO', is_conclusion: false, phase: 'analysis' });
            cb.onToken('tecnica', 'CTO');
            // Los agentes debaten en paralelo: un token del CEO llega tarde.
            cb.onToken('!', 'CEO');
        });

        const ms = mensajes();
        expect(ms).toHaveLength(3);
        expect(ms[1]).toMatchObject({ role: 'CEO', content: 'abro!', phase: 'opening', agentId: 'ceo-1' });
        expect(ms[2]).toMatchObject({ role: 'CTO', content: 'tecnica', phase: 'analysis', agentId: 'cto-1' });
        expect(board()).toMatchObject({ active: true, phase: 'analysis', statusByRole: { CEO: 'speaking', CTO: 'speaking' } });
    });

    it('si la burbuja inicial ya tiene texto, el primer agente abre una nueva', async () => {
        abrirSesion('group-chat');
        await enviar((cb) => {
            cb.onToken('ruido', null);
            cb.onBoardAgent?.({ role: 'CEO', is_conclusion: false });
        });

        const ms = mensajes();
        expect(ms).toHaveLength(3);
        expect(ms[1].content).toBe('ruido');
        expect(ms[2].content).toBe('');
    });

    it('el diablo levanta la bandera del war-room', async () => {
        abrirSesion('group-chat');
        await enviar((cb) => cb.onBoardAgent?.({ role: 'DEVIL', is_conclusion: false, phase: 'devil' }));

        expect(board()!.devil).toBe(true);
        expect(mensajes()[1].agentId).toBe('devil-1');
    });

    it('`onBoardVote` pinta el chip en la burbuja del rol y lo marca como acabado', async () => {
        abrirSesion('group-chat');
        await enviar((cb) => {
            cb.onBoardAgent?.({ role: 'CTO', is_conclusion: false });
            cb.onBoardVote?.({ role: 'CTO', vote: 'SI', confidence: 78 });
        });

        expect(mensajes()[1].vote).toEqual({ decision: 'SI', confidence: 78 });
        expect(board()).toMatchObject({ votes: { CTO: { decision: 'SI', confidence: 78 } }, statusByRole: { CTO: 'done' } });
    });

    it('un voto sin decisión cae en CONDICIONAL y sin confianza numérica en 50', async () => {
        abrirSesion('group-chat');
        await enviar((cb) => cb.onBoardVote?.({ role: 'CFO', vote: '', confidence: null as never }));

        expect(board()!.votes.CFO).toEqual({ decision: 'CONDICIONAL', confidence: 50 });
    });

    it('`onBoardPhase`, `onBoardConsensus` y `onBoardIntervention` sólo tocan el war-room', async () => {
        abrirSesion('group-chat');
        await enviar((cb) => {
            cb.onBoardPhase?.({ phase: 'rebuttal' });
            cb.onBoardConsensus?.({ unanimous: true, tally: { SI: 3 }, early_exit: true });
            cb.onBoardIntervention?.({ text: 'el humano interrumpe' });
        });

        expect(board()).toMatchObject({
            phase: 'rebuttal',
            unanimous: true,
            tally: { SI: 3 },
            earlyExit: true,
            lastIntervention: 'el humano interrumpe',
        });
    });

    it('en 1-a-1 los eventos de junta no resucitan el war-room', async () => {
        abrirSesion('cto-1');
        await enviar((cb) => {
            cb.onBoardPlan?.({ participants: ['CTO'], cost: 3 });
            cb.onBoardVote?.({ role: 'CTO', vote: 'SI', confidence: 10 });
            cb.onBoardAgent?.({ role: 'CTO', is_conclusion: false });
        });

        expect(board()).toBeNull();
    });
});

// -------------------------------------------------- artefactos y utensilios

describe('artefactos y utensilios en streaming', () => {
    it('el artefacto deja su marcador en la burbuja y se cierra el canal al terminar', async () => {
        abrirSesion('cto-1');
        await enviar((cb) => {
            cb.onArtifactOpen?.({ title: 'Plan', artifact_type: 'markdown', language: '' });
            cb.onArtifactChunk?.('# Plan');
            cb.onArtifactClose?.();
        });

        const st = useChatStore.getState();
        expect(st.artifacts[0]).toMatchObject({ title: 'Plan', type: 'markdown', content: '# Plan', agentId: 'cto-1' });
        expect(st.artifacts[0].language).toBeUndefined();
        expect(mensajes()[1].content).toContain(`[ARTIFACT:${st.artifacts[0].id}:Plan]`);
        expect(st.streamingArtifactBySession[SID]).toBeNull();
    });

    it('un trozo de artefacto sin artefacto abierto se descarta en silencio', async () => {
        abrirSesion('cto-1');
        await enviar((cb) => cb.onArtifactChunk?.('huérfano'));

        expect(useChatStore.getState().artifacts).toHaveLength(0);
    });

    it('un tipo desconocido de artefacto cae a `code`', async () => {
        abrirSesion('cto-1');
        await enviar((cb) => cb.onArtifactOpen?.({ title: 'X', artifact_type: 'inventado', language: 'go' }));

        expect(useChatStore.getState().artifacts[0].type).toBe('code');
        expect(useChatStore.getState().artifacts[0].language).toBe('go');
    });

    it('los utensilios se escriben como marcadores; el resultado se corta a 300', async () => {
        abrirSesion('cto-1');
        await enviar((cb) => {
            cb.onToolStart?.({ tool_name: 'buscar', args: {} });
            cb.onToolResult?.({ tool_name: 'buscar', result: 'x'.repeat(400) });
        });

        const texto = mensajes()[1].content;
        expect(texto).toContain('[TOOL_START:buscar]');
        expect(texto).toContain(`[TOOL_RESULT:buscar:${'x'.repeat(300)}]`);
        expect(texto).not.toContain('x'.repeat(301));
    });

    it('el error de utensilio se sanea: sin `]` ni saltos de línea, y cortado a 200', async () => {
        abrirSesion('cto-1');
        await enviar((cb) => cb.onToolError?.({ tool_name: 'buscar', error: 'a]b\nc\rd' + 'z'.repeat(300) }));

        const texto = mensajes()[1].content;
        expect(texto).toContain('[TOOL_ERROR:buscar:a b c d');
        expect(texto.match(/\]/g)).toHaveLength(1);
    });
});

// ----------------------------------------------------------- cierre y fallos

describe('cierre del stream y fallos', () => {
    it('`onDone` apaga el streaming, suelta el abortador y da el debate por cerrado', async () => {
        abrirSesion('group-chat');
        await enviar((cb) => {
            cb.onBoardPlan?.({ participants: ['CTO'], cost: 3 });
            cb.onDone?.();
        });

        const st = useChatStore.getState();
        expect(st.streamingSessionIds).not.toContain(SID);
        expect(st.abortController).toBeNull();
        // El war-room sigue montado, pero ya no está «en vuelo».
        expect(st.boardSession).toMatchObject({ active: false, participants: ['CTO'] });
    });

    it('`onError` marca el corte EN EL HILO, conserva lo escrito y deja salida', async () => {
        abrirSesion('cto-1');
        await enviar((cb) => {
            cb.onToken('a medias', null);
            cb.onError?.(new Error('corte'));
        });

        expect(mensajes()[1].content).toContain('a medias');
        // El texto marca dónde se cortó; el «qué hacer» lo pinta el hilo a
        // partir de `interrupted` (botón «Reintentar el turno»).
        expect(mensajes()[1].content).toContain('La respuesta se cortó aquí');
        expect(mensajes()[1].interrupted).toBe(true);
        expect(useChatStore.getState().streamingSessionIds).not.toContain(SID);
        // Es el propio hilo el que avisa: no se escribe además en `errorStates`.
        expect(useChatStore.getState().errorStates.send_message).toBeNull();
    });

    /**
     * Éste era el bug, y esto es lo que caracterizaba antes:
     *
     *     // Sale por `return`, así que la sesión se queda marcada como en curso.
     *     expect(st.streamingSessionIds).toContain(SID);
     *
     * O sea que el test estaba VERDE describiendo el fallo. El `catch` del
     * `AbortError` hacía `return` sin sacar el id de `streamingSessionIds`, y
     * `stopGeneration` —que sí lo saca— sólo cubre el aborte que empieza en el
     * botón de detener. Cualquier otro (desmontar la vista, el navegador
     * abortando el `fetch`, un aborte de un envío que ya no es el activo) dejaba
     * la sesión marcada como «en curso» PARA SIEMPRE: compositor deshabilitado
     * con «Sistema ocupado…», tres puntitos de «está escribiendo» eternos y
     * ninguna salida que no fuera recargar la página.
     *
     * Lo que NO cambia, y por eso sigue comprobándose: un aborte no es un fallo.
     * No escribe `errorStates`, no marca el turno como interrumpido y no pinta
     * un «Reintentar» — el usuario paró a propósito.
     */
    it('un `AbortError` apaga el indicador de escritura sin contarlo como fallo', async () => {
        abrirSesion('cto-1');
        useChatStore.setState({ streamingArtifactBySession: { [SID]: 'a1' } });
        const abort = Object.assign(new Error('abortado'), { name: 'AbortError' });
        stream.mockRejectedValue(abort);

        await useChatStore.getState().sendMessage('hola');

        const st = useChatStore.getState();
        // Sigue sin ser un fallo: ni aviso, ni turno marcado como cortado.
        expect(st.errorStates.send_message).toBeNull();
        expect(mensajes().some((m) => m.interrupted)).toBe(false);
        // Y ahora, además, la sesión deja de estar «en curso».
        expect(st.streamingSessionIds).not.toContain(SID);
        expect(st.abortController).toBeNull();
        expect(st.streamingArtifactBySession[SID]).toBeNull();
    });

    it('un `AbortError` de un envío viejo no le quita el abortador al turno nuevo', async () => {
        abrirSesion('cto-1');
        const abort = Object.assign(new Error('abortado'), { name: 'AbortError' });
        stream.mockRejectedValue(abort);

        // El turno nuevo ya está en vuelo con SU abortador cuando llega el
        // rechazo del viejo: anularlo aquí dejaría al turno nuevo sin «Detener».
        const delTurnoNuevo = new AbortController();
        const envioViejo = useChatStore.getState().sendMessage('hola');
        useChatStore.setState({ abortController: delTurnoNuevo });
        await envioViejo;

        expect(useChatStore.getState().abortController).toBe(delTurnoNuevo);
    });

    it('un fallo de red escribe `send_message`, corta el artefacto y marca el turno', async () => {
        abrirSesion('cto-1');
        useChatStore.setState({ streamingArtifactBySession: { [SID]: 'a1' } });
        stream.mockRejectedValue(new Error('offline'));

        await useChatStore.getState().sendMessage('hola');

        const st = useChatStore.getState();
        expect(st.errorStates.send_message).toBe('Error en el flujo de transmisión');
        expect(st.streamingSessionIds).not.toContain(SID);
        expect(st.abortController).toBeNull();
        expect(st.streamingArtifactBySession[SID]).toBeNull();
        // El hilo se queda con la marca que pinta el «Reintentar el turno».
        expect(mensajes()[1].interrupted).toBe(true);
    });

    it('`stopGeneration` aborta, desmarca la sesión activa y corta su artefacto', async () => {
        const abort = new AbortController();
        const spy = vi.spyOn(abort, 'abort');
        useChatStore.setState({
            abortController: abort,
            currentSessionId: SID,
            streamingSessionIds: [SID, 'otra'],
            streamingArtifactBySession: { [SID]: 'a1' },
        });

        useChatStore.getState().stopGeneration();

        const st = useChatStore.getState();
        expect(spy).toHaveBeenCalled();
        expect(st.abortController).toBeNull();
        expect(st.streamingSessionIds).toEqual(['otra']);
        expect(st.streamingArtifactBySession[SID]).toBeNull();
    });

    it('`stopGeneration` sin sesión abierta vacía la lista entera', () => {
        useChatStore.setState({ currentSessionId: null, streamingSessionIds: ['a', 'b'] });

        useChatStore.getState().stopGeneration();

        expect(useChatStore.getState().streamingSessionIds).toEqual([]);
    });
});

// -------------------------------------------------- avisos de stream roto

describe('un turno que no se puede pintar avisa una sola vez', () => {
    let vistos: ToastRecord[];
    let cancelar: () => void;

    beforeEach(() => {
        vistos = [];
        cancelar = subscribeToasts((t) => vistos.push(t));
    });

    afterEach(() => cancelar());

    it('`onBoardStart` roto avisa como `warning` con clave fija', async () => {
        abrirSesion('group-chat');
        await enviar((cb) => cb.onBoardStart?.(undefined as never));

        expect(vistos).toHaveLength(1);
        expect(vistos[0]).toMatchObject({ variant: 'warning', title: 'Se ha perdido parte del debate' });
    });

    it('`onBoardAgent` roto avisa y no tumba el stream', async () => {
        abrirSesion('group-chat');
        await enviar((cb) => {
            cb.onBoardAgent?.(undefined as never);
            cb.onToken('sigo vivo', null);
        });

        expect(vistos).toHaveLength(1);
        expect(mensajes()[1].content).toBe('sigo vivo');
    });
});
