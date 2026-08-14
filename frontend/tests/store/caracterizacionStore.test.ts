/**
 * Caracterización de `useChatStore` — D40, red de seguridad del troceo.
 *
 * Estos tests NO describen lo que el store DEBERÍA hacer: describen lo que HACE
 * hoy, incluidas las rarezas. Se escribieron ANTES de partir el fichero de 1267
 * líneas en slices, y su único trabajo es cazar cualquier cambio de
 * comportamiento durante el traslado. Si uno se pone rojo después de mover
 * código, es que el traslado cambió algo.
 *
 * Cubren la parte que las suites existentes no tocaban: catálogo de agentes,
 * ciclo de vida de sesiones (crear/cargar/borrar/renombrar), artefactos,
 * interruptores de interfaz, `resetState` y las funciones puras de identidad de
 * sesión. El stream vive en `caracterizacionStream.test.ts`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    useChatStore,
    GROUP_CHAT_ID,
    resolveSessionAgentId,
    rebuildBoardSession,
    getGroupMembers,
    getBoardAgentByRole,
    BOARD_DEVIL_AGENT,
    AGENT_HEX,
} from '../../src/store/useChatStore';
import { chatService } from '../../src/services/api';
import { idDeTurno } from '../../src/store/chat/historyMapper';
import type { ChatSession, Message } from '../../src/types';

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

const sesion = (over: Partial<ChatSession> = {}): ChatSession => ({
    session_id: 's1',
    user_id: 'u1',
    title: 'Sesión',
    base_agent_id: 'group-chat',
    agent_ref_type: 'core',
    type: 'group',
    visual_config: {},
    context_files: [],
    enabled_tools: [],
    members: [],
    created_at: new Date().toISOString(),
    ...over,
});

const msg = (over: Partial<Message> = {}): Message => ({
    id: 'm1',
    role: 'CEO',
    content: 'hola',
    timestamp: new Date(),
    ...over,
});

beforeEach(() => {
    useChatStore.getState().resetState();
    vi.clearAllMocks();
});

// ---------------------------------------------------------------- catálogo

describe('catálogo de agentes', () => {
    it('`getAgents` concatena core y custom, en ese orden', () => {
        useChatStore.setState({ customAgents: [{ id: 'x1' } as never] });

        const ids = useChatStore.getState().getAgents().map((a) => a.id);

        expect(ids[0]).toBe('group-chat');
        expect(ids[ids.length - 1]).toBe('x1');
        expect(ids).toHaveLength(6);
    });

    it('los cinco directores de fábrica salen con su hex de §2.8', () => {
        const core = useChatStore.getState().coreAgents;
        expect(core.find((a) => a.id === 'group-chat')?.hexColor).toBe(AGENT_HEX.group);
        expect(core.find((a) => a.id === 'ceo-1')?.hexColor).toBe(AGENT_HEX.CEO);
        expect(core.find((a) => a.id === 'cto-1')?.hexColor).toBe(AGENT_HEX.CTO);
        expect(core.find((a) => a.id === 'cmo-1')?.hexColor).toBe(AGENT_HEX.CMO);
        expect(core.find((a) => a.id === 'cfo-1')?.hexColor).toBe(AGENT_HEX.CFO);
    });

    it('`getGroupMembers` excluye a la junta misma', () => {
        const miembros = getGroupMembers(useChatStore.getState().coreAgents);
        expect(miembros.map((a) => a.id)).toEqual(['ceo-1', 'cto-1', 'cmo-1', 'cfo-1']);
    });

    /**
     * QA-2 (B) — la junta la componen los cuatro directores, nadie más.
     *
     * `getGroupMembers` es lo que se PINTA como junta: la lista de «Miembros
     * del Grupo» de Configuración y el recuento «N Expertos Activos» de la
     * cabecera del chat salen de aquí, no de `session.members`. Con el catálogo
     * completo (core + a medida) contaba también a los specialists del usuario,
     * así que la cabecera prometía expertos que jamás deliberan: el grafo del
     * debate tiene clavados CTO/CFO/CMO (`board_v2.py:40`, y el triaje sólo
     * admite esos) y un agente a medida no tiene asiento en la mesa.
     */
    it('`getGroupMembers` deja fuera también a los agentes a medida', () => {
        const aMedida = {
            id: 'uuid-experto',
            name: 'Auditor de Precios',
            role: 'specialist',
            avatar: 'A',
            description: 'Agente a medida del usuario.',
            color: 'bg-surface',
            hexColor: AGENT_HEX.custom,
            isOnline: true,
        };
        const catalogo = [...useChatStore.getState().coreAgents, aMedida as never];

        const miembros = getGroupMembers(catalogo);

        expect(miembros.map((a) => a.id)).toEqual(['ceo-1', 'cto-1', 'cmo-1', 'cfo-1']);
    });

    it('`getBoardAgentByRole` resuelve DEVIL fuera de la lista, y el resto por rol', () => {
        const agentes = useChatStore.getState().coreAgents;
        expect(getBoardAgentByRole(agentes, 'DEVIL')).toBe(BOARD_DEVIL_AGENT);
        expect(getBoardAgentByRole(agentes, 'CTO')?.id).toBe('cto-1');
        expect(getBoardAgentByRole(agentes, 'NADIE')).toBeUndefined();
    });

    it('`fetchCustomAgents` deja el error en `fetch_agents` sin relanzar', async () => {
        (chatService.getCustomAgents as never as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));

        await expect(useChatStore.getState().fetchCustomAgents()).resolves.toBeUndefined();

        expect(useChatStore.getState().errorStates.fetch_agents).toBe('Error al obtener agentes personalizados');
    });

    it('`addCustomAgent` relanza Y deja el error escrito', async () => {
        (chatService.createCustomAgent as never as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));

        await expect(useChatStore.getState().addCustomAgent({})).rejects.toThrow(
            'Error al crear agente personalizado',
        );
        expect(useChatStore.getState().errorStates.fetch_agents).toBe('Error al crear agente personalizado');
    });

    it('`deleteCustomAgent` saca al agente de la lista cuando el backend acepta', async () => {
        (chatService.deleteCustomAgent as never as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
        useChatStore.setState({ customAgents: [{ id: 'a1' }, { id: 'a2' }] as never });

        await useChatStore.getState().deleteCustomAgent('a1');

        expect(useChatStore.getState().customAgents.map((a) => a.id)).toEqual(['a2']);
    });

    it('renombrar y recolorear alcanza a core y a custom a la vez', () => {
        useChatStore.setState({ customAgents: [{ id: 'cto-1', name: 'Clon' }] as never });

        useChatStore.getState().renameAgent('cto-1', 'Hernesto');
        useChatStore.getState().updateAgentColor('cto-1', '#123456');

        const core = useChatStore.getState().coreAgents.find((a) => a.id === 'cto-1');
        const custom = useChatStore.getState().customAgents.find((a) => a.id === 'cto-1');
        expect(core?.name).toBe('Hernesto');
        expect(core?.hexColor).toBe('#123456');
        expect(custom?.name).toBe('Hernesto');
    });
});

// ---------------------------------------------------------------- sesiones

describe('ciclo de vida de sesiones', () => {
    it('`fetchSessions` vuelca el listado del backend', async () => {
        (chatService.getSessions as never as ReturnType<typeof vi.fn>).mockResolvedValue([sesion()]);

        await useChatStore.getState().fetchSessions();

        expect(useChatStore.getState().sessions).toHaveLength(1);
    });

    it('`createNewSession` sin argumento abre una junta con saludo de junta', async () => {
        (chatService.createSession as never as ReturnType<typeof vi.fn>).mockResolvedValue(
            sesion({ session_id: 's-nueva' }),
        );

        const id = await useChatStore.getState().createNewSession();

        const st = useChatStore.getState();
        expect(id).toBe('s-nueva');
        expect(st.currentSessionId).toBe('s-nueva');
        expect(st.selectedAgentId).toBe(GROUP_CHAT_ID);
        expect(st.sessionsByAgent[GROUP_CHAT_ID]).toBe('s-nueva');
        expect(st.sessions[0].session_id).toBe('s-nueva');

        const saludo = st.messagesBySession['s-nueva'][0];
        expect(saludo.role).toBe('system');
        expect(saludo.content).toContain('Junta Directiva');
        // La junta no lleva `agentId`: no es un agente, es la sala.
        expect(saludo.agentId).toBeUndefined();

        expect(chatService.createSession).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Junta Directiva',
                base_agent_id: 'system',
                agent_ref_type: 'core',
                type: 'group',
                // QA-2 (B) — ÚNICA expectativa de caracterización que se
                // actualiza en este lote, y por decisión de producto.
                //
                // Decía «Se mandan TODOS los ids, incluida la propia junta» y
                // era literal: `allAgents.map(a => a.id)` metía a los agentes a
                // medida del usuario Y a 'group-chat' como miembro de sí mismo.
                // Ninguna de las dos cosas es una junta: el grafo del debate
                // tiene clavados CTO/CFO/CMO (`board_v2.py:40`) y 'group-chat'
                // es el canal, no un director. La membresía viaja al backend y
                // se guarda tal cual, así que era un dato falso persistido.
                members: ['ceo-1', 'cto-1', 'cmo-1', 'cfo-1'],
            }),
        );
    });

    /**
     * QA-2 (B), triangulación — con el catálogo «sucio» de verdad.
     *
     * El caso de arriba corre con la tienda de fábrica, donde lo único que
     * sobraba era 'group-chat'. Éste añade un agente a medida, que es como
     * está la tienda de cualquier usuario que se haya creado uno: la junta
     * tiene que seguir siendo los cuatro directores.
     */
    it('`createNewSession` de junta no arrastra a los agentes a medida', async () => {
        (chatService.createSession as never as ReturnType<typeof vi.fn>).mockResolvedValue(
            sesion({ session_id: 's-con-experto' }),
        );
        useChatStore.setState({
            customAgents: [
                {
                    id: 'uuid-experto',
                    name: 'Auditor de Precios',
                    role: 'specialist',
                    avatar: 'A',
                    description: 'Agente a medida del usuario.',
                    color: 'bg-surface',
                    hexColor: AGENT_HEX.custom,
                    isOnline: true,
                } as never,
            ],
        });

        await useChatStore.getState().createNewSession();

        expect(chatService.createSession).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'group',
                members: ['ceo-1', 'cto-1', 'cmo-1', 'cfo-1'],
            }),
        );
    });

    it('`createNewSession` de un director manda su rol como `base_agent_id`', async () => {
        (chatService.createSession as never as ReturnType<typeof vi.fn>).mockResolvedValue(
            sesion({ session_id: 's-cto', type: 'direct' }),
        );

        await useChatStore.getState().createNewSession('cto-1');

        const saludo = useChatStore.getState().messagesBySession['s-cto'][0];
        expect(saludo.role).toBe('CTO');
        expect(saludo.agentId).toBe('cto-1');
        expect(chatService.createSession).toHaveBeenCalledWith(
            expect.objectContaining({
                base_agent_id: 'CTO',
                agent_ref_type: 'core',
                type: 'direct',
                members: ['cto-1'],
                visual_config: expect.objectContaining({ bubble_color: AGENT_HEX.CTO }),
            }),
        );
    });

    it('un agente a medida viaja como `custom` con su id, y saluda genérico', async () => {
        useChatStore.setState({
            customAgents: [{ id: 'uuid-9', name: 'Analista', role: 'specialist', hexColor: '#abcdef' }] as never,
        });
        (chatService.createSession as never as ReturnType<typeof vi.fn>).mockResolvedValue(
            sesion({ session_id: 's-uuid' }),
        );

        await useChatStore.getState().createNewSession('uuid-9');

        expect(chatService.createSession).toHaveBeenCalledWith(
            expect.objectContaining({ base_agent_id: 'uuid-9', agent_ref_type: 'custom' }),
        );
        expect(useChatStore.getState().messagesBySession['s-uuid'][0].content).toBe('Conectado con Analista.');
    });

    it('`createNewSession` relanza `SessionError` y deja el error escrito', async () => {
        (chatService.createSession as never as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('502'));

        await expect(useChatStore.getState().createNewSession()).rejects.toThrow('Error al crear la sesión');
        expect(useChatStore.getState().errorStates.create_session).toBe('Error al crear la sesión');
    });

    it('`selectAgent` sólo cambia el canal elegido', () => {
        useChatStore.getState().selectAgent('cfo-1');
        expect(useChatStore.getState().selectedAgentId).toBe('cfo-1');
    });

    it('`updateSessionMetadata` fusiona lo que devuelve el backend', async () => {
        useChatStore.setState({ sessions: [sesion({ session_id: 's1', title: 'Viejo' })] });
        (chatService.updateSession as never as ReturnType<typeof vi.fn>).mockResolvedValue({ title: 'Nuevo' });

        await useChatStore.getState().updateSessionMetadata('s1', { title: 'Nuevo' });

        expect(useChatStore.getState().sessions[0].title).toBe('Nuevo');
        expect(useChatStore.getState().sessions[0].user_id).toBe('u1');
    });

    it('`deleteSession` limpia el canal activo si borras la sesión abierta', async () => {
        (chatService.deleteSession as never as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
        useChatStore.setState({
            sessions: [sesion({ session_id: 's1' }), sesion({ session_id: 's2' })],
            messagesBySession: { s1: [msg()], s2: [msg()] },
            currentSessionId: 's1',
            selectedAgentId: 'cto-1',
        });

        await useChatStore.getState().deleteSession('s1');

        const st = useChatStore.getState();
        expect(st.sessions.map((s) => s.session_id)).toEqual(['s2']);
        expect(st.messagesBySession.s1).toBeUndefined();
        expect(st.messagesBySession.s2).toBeDefined();
        expect(st.currentSessionId).toBeNull();
        expect(st.selectedAgentId).toBeNull();
    });

    it('`deleteSession` de otra sesión no toca el canal activo', async () => {
        (chatService.deleteSession as never as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
        useChatStore.setState({
            sessions: [sesion({ session_id: 's1' }), sesion({ session_id: 's2' })],
            currentSessionId: 's1',
            selectedAgentId: 'cto-1',
        });

        await useChatStore.getState().deleteSession('s2');

        expect(useChatStore.getState().currentSessionId).toBe('s1');
        expect(useChatStore.getState().selectedAgentId).toBe('cto-1');
    });
});

// ------------------------------------------------------- carga de historial

describe('loadSession — mapeo del historial persistido', () => {
    const cargar = async (messages: unknown[], id = 's-hist') => {
        (chatService.getSessionHistory as never as ReturnType<typeof vi.fn>).mockResolvedValue({ messages });
        await useChatStore.getState().loadSession(id);
        return useChatStore.getState().messagesBySession[id];
    };

    it('traduce `human` a `user` y resuelve al autor', async () => {
        const msgs = await cargar([
            { type: 'human', content: 'pregunta', additional_kwargs: {} },
            { type: 'ai', content: 'respuesta', additional_kwargs: { agent_role: 'CTO', agent_id: 'cto-1' } },
        ]);

        expect(msgs[0].role).toBe('user');
        expect(msgs[1].role).toBe('CTO');
        expect(msgs[1].agentId).toBe('cto-1');
    });

    /* D59 — el identificador ya no es la POSICIÓN. Los pines se guardan en el
       backend con él como clave; con el índice, podar el hilo movía todos los
       pines un sitio a la izquierda. */
    it('D59: usa el identificador que manda el backend cuando existe', async () => {
        const msgs = await cargar([
            { id: 'run-abc', type: 'ai', content: 'respuesta', additional_kwargs: {} },
        ]);
        expect(msgs[0].id).toBe('run-abc');
    });

    it('D59: sin identificador del backend, el mismo turno da el mismo id caiga donde caiga', () => {
        const turno = { type: 'ai', content: 'respuesta', additional_kwargs: {} };
        // El identificador no depende de la posición: eso era el defecto.
        expect(idDeTurno(turno, 's-d59')).toBe(idDeTurno(turno, 's-d59'));
        // Y sigue distinguiendo turnos distintos de la misma sesión.
        expect(idDeTurno(turno, 's-d59')).not.toBe(
            idDeTurno({ ...turno, content: 'otra' }, 's-d59'),
        );
    });

    it('un rol desconocido cae a `CEO` (nunca `assistant`)', async () => {
        const msgs = await cargar([{ type: 'ai', content: 'x', additional_kwargs: { agent_role: 'assistant' } }]);
        expect(msgs[0].role).toBe('CEO');
    });

    it('DEVIL no está en la lista de agentes: se le presta la identidad del asiento', async () => {
        const msgs = await cargar([{ type: 'ai', content: 'x', additional_kwargs: { agent_role: 'DEVIL' } }]);
        expect(msgs[0].role).toBe('DEVIL');
        expect(msgs[0].agentId).toBe(BOARD_DEVIL_AGENT.id);
    });

    it('un voto sin confianza numérica se guarda con 50, y sin `decision` no se guarda', async () => {
        const msgs = await cargar([
            { type: 'ai', content: 'a', additional_kwargs: { agent_role: 'CTO', board_vote: { decision: 'SI' } } },
            { type: 'ai', content: 'b', additional_kwargs: { agent_role: 'CFO', board_vote: { confidence: 90 } } },
        ]);

        expect(msgs[0].vote).toEqual({ decision: 'SI', confidence: 50 });
        expect(msgs[1].vote).toBeUndefined();
    });

    it('`is_conclusion` y `board_phase` viajan al mensaje', async () => {
        const msgs = await cargar([
            {
                type: 'ai',
                content: 'acta',
                additional_kwargs: { agent_role: 'CEO', board_phase: 'synthesis', is_conclusion: true },
            },
        ]);

        expect(msgs[0].isConclusion).toBe(true);
        expect(msgs[0].phase).toBe('synthesis');
    });

    it('varios artefactos en un mismo turno se extraen todos, en orden', async () => {
        // AD-001: el atributo es `type=`, que es lo que el backend escribe. El
        // fixture decía `artifact_type=` y codificaba el bug del lector; la
        // aserción de abajo siempre fue correcta y no se toca.
        const contenido =
            'uno <sphere_artifact title="A" type="markdown">aaa</sphere_artifact> ' +
            'dos <sphere_artifact title="B" type="csv" language="">bbb</sphere_artifact>';
        const msgs = await cargar([{ type: 'ai', content: contenido, additional_kwargs: { agent_role: 'CTO' } }]);

        const arts = useChatStore.getState().artifacts;
        expect(arts.map((a) => a.title)).toEqual(['A', 'B']);
        expect(arts.map((a) => a.type)).toEqual(['markdown', 'data_table']);
        // Sin `language` explícito el campo queda sin poner, no en cadena vacía.
        expect(arts[1].language).toBeUndefined();
        expect(msgs[0].content).toContain('[ARTIFACT:');
        expect(msgs[0].content).not.toContain('<sphere_artifact');
    });

    it('el fallo de red deja la sesión abierta, sin mensajes y con el error escrito', async () => {
        (chatService.getSessionHistory as never as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('offline'));

        await useChatStore.getState().loadSession('s-rota');

        const st = useChatStore.getState();
        expect(st.currentSessionId).toBe('s-rota');
        expect(st.errorStates.load_history).toBe('Fallo al recuperar el historial de la sesión');
        expect(st.streamingSessionIds).not.toContain('s-rota');
        expect(st.messagesBySession['s-rota']).toBeUndefined();
    });

    it('la segunda visita sale de caché y no vuelve a pedir el historial', async () => {
        await cargar([{ type: 'ai', content: 'x', additional_kwargs: { agent_role: 'CTO', agent_id: 'cto-1' } }], 's-c');
        (chatService.getSessionHistory as never as ReturnType<typeof vi.fn>).mockClear();

        await useChatStore.getState().loadSession('s-c');

        expect(chatService.getSessionHistory).not.toHaveBeenCalled();
    });
});

// ------------------------------------------------- identidad de sesión (P0)

describe('resolveSessionAgentId — `group-chat` es valor, no centinela', () => {
    it('lo que diga la sesión manda sobre los mensajes', () => {
        expect(resolveSessionAgentId({ base_agent_id: 'cfo-1', type: 'direct' }, [msg({ agentId: 'cto-1' })])).toBe(
            'cfo-1',
        );
        expect(resolveSessionAgentId({ base_agent_id: GROUP_CHAT_ID, type: 'group' }, [msg({ agentId: 'cto-1' })])).toBe(
            GROUP_CHAT_ID,
        );
    });

    it('ausencia es `undefined`, `\'\'` o sólo espacios', () => {
        const mensajes = [msg({ agentId: 'cto-1' })];
        expect(resolveSessionAgentId({ base_agent_id: '', type: 'direct' }, mensajes)).toBe('cto-1');
        expect(resolveSessionAgentId({ base_agent_id: '   ', type: 'direct' }, mensajes)).toBe('cto-1');
        expect(resolveSessionAgentId(undefined, mensajes)).toBe('cto-1');
    });

    it('sin `base_agent_id`, el tipo `group` sigue siendo prueba de junta', () => {
        expect(resolveSessionAgentId({ base_agent_id: '', type: 'group' }, [msg({ agentId: 'cto-1' })])).toBe(
            GROUP_CHAT_ID,
        );
    });

    it('sin sesión ni mensajes útiles, se asume junta', () => {
        expect(resolveSessionAgentId(undefined, [])).toBe(GROUP_CHAT_ID);
        expect(resolveSessionAgentId(undefined, [msg({ agentId: 'system' })])).toBe(GROUP_CHAT_ID);
    });
});

describe('rebuildBoardSession — reconstruir el war-room de un debate cerrado', () => {
    it('sin turnos de agente no hay mesa', () => {
        expect(rebuildBoardSession([])).toBeNull();
        expect(rebuildBoardSession([msg({ role: 'user' }), msg({ role: 'system' })])).toBeNull();
    });

    it('un único director sin voto ni fase no es un debate', () => {
        expect(rebuildBoardSession([msg({ role: 'CTO' })])).toBeNull();
    });

    it('basta un voto, una fase, dos directores o el diablo', () => {
        expect(rebuildBoardSession([msg({ role: 'CTO', vote: { decision: 'SI', confidence: 10 } })])).not.toBeNull();
        expect(rebuildBoardSession([msg({ role: 'CTO', phase: 'analysis' })])).not.toBeNull();
        expect(rebuildBoardSession([msg({ role: 'CTO' }), msg({ role: 'CFO' })])).not.toBeNull();
        expect(rebuildBoardSession([msg({ role: 'DEVIL' })])).not.toBeNull();
    });

    it('el diablo cuenta como asiento, no como participante', () => {
        const board = rebuildBoardSession([msg({ role: 'CTO' }), msg({ role: 'DEVIL' })])!;
        expect(board.devil).toBe(true);
        expect(board.participants).toEqual(['CTO']);
        expect(board.statusByRole.DEVIL).toBe('done');
    });

    it('`unanimous` exige más de un voto y una sola decisión', () => {
        const uno = rebuildBoardSession([msg({ role: 'CTO', vote: { decision: 'SI', confidence: 1 } })])!;
        expect(uno.unanimous).toBe(false);

        const dos = rebuildBoardSession([
            msg({ role: 'CTO', vote: { decision: 'SI', confidence: 1 } }),
            msg({ role: 'CFO', vote: { decision: 'SI', confidence: 2 } }),
        ])!;
        expect(dos.unanimous).toBe(true);
        expect(dos.tally).toEqual({ SI: 2 });
    });

    it('gana la última fase vista, y el coste es siempre el de catálogo', () => {
        const board = rebuildBoardSession([
            msg({ role: 'CEO', phase: 'opening' }),
            msg({ role: 'CTO', phase: 'synthesis' }),
        ])!;
        expect(board.phase).toBe('synthesis');
        // El coste real (3 ó 5) no se persiste: se deja el de catálogo.
        expect(board.cost).toBe(5);
        expect(board.active).toBe(false);
        expect(board.earlyExit).toBe(false);
        expect(board.lastIntervention).toBeNull();
    });
});

// ------------------------------------------------ artefactos e interruptores

describe('artefactos e interfaz', () => {
    it('`addArtifact` lo abre y lo deja activo', () => {
        useChatStore.getState().addArtifact({ id: 'a1' } as never);

        const st = useChatStore.getState();
        expect(st.artifacts.map((a) => a.id)).toEqual(['a1']);
        expect(st.activeArtifactId).toBe('a1');
        expect(st.isArtifactPanelOpen).toBe(true);
        expect(st.getArtifacts()).toBe(st.artifacts);
    });

    it('`setActiveArtifact` abre el panel incluso al deseleccionar', () => {
        useChatStore.setState({ isArtifactPanelOpen: false });
        useChatStore.getState().setActiveArtifact(null);

        expect(useChatStore.getState().activeArtifactId).toBeNull();
        expect(useChatStore.getState().isArtifactPanelOpen).toBe(true);
    });

    it('los interruptores alternan sin argumento y obedecen con él', () => {
        const s = useChatStore.getState();
        const abierto = s.isSidebarOpen;

        s.toggleSidebar();
        expect(useChatStore.getState().isSidebarOpen).toBe(!abierto);
        s.toggleSidebar(true);
        expect(useChatStore.getState().isSidebarOpen).toBe(true);

        s.toggleAgentModal();
        expect(useChatStore.getState().isAgentModalOpen).toBe(true);
        s.toggleAgentModal(false);
        expect(useChatStore.getState().isAgentModalOpen).toBe(false);

        // `toggleArtifactPanel` no acepta argumento: sólo alterna.
        const panel = useChatStore.getState().isArtifactPanelOpen;
        s.toggleArtifactPanel();
        expect(useChatStore.getState().isArtifactPanelOpen).toBe(!panel);
    });

    it('`getCurrentMessages` devuelve lista vacía sin sesión abierta', () => {
        expect(useChatStore.getState().getCurrentMessages()).toEqual([]);

        useChatStore.setState({ currentSessionId: 's1', messagesBySession: { s1: [msg()] } });
        expect(useChatStore.getState().getCurrentMessages()).toHaveLength(1);

        useChatStore.setState({ currentSessionId: 'inexistente' });
        expect(useChatStore.getState().getCurrentMessages()).toEqual([]);
    });
});

// ------------------------------------------------------------- resetState

describe('resetState — el borrado al cambiar de cuenta (A6)', () => {
    it('borra todo lo del usuario y devuelve los directores a fábrica', () => {
        useChatStore.getState().renameAgent('cto-1', 'Hernesto');
        useChatStore.setState({
            customAgents: [{ id: 'x' }] as never,
            sessions: [sesion()],
            messagesBySession: { s1: [msg()] },
            artifacts: [{ id: 'a' }] as never,
            currentSessionId: 's1',
            selectedAgentId: 'cto-1',
            streamingSessionIds: ['s1'],
            sessionsByAgent: { 'cto-1': 's1' },
            activeArtifactId: 'a',
            streamingArtifactBySession: { s1: 'a' },
            boardSession: { active: true } as never,
            errorStates: { ...useChatStore.getState().errorStates, send_message: 'ups' },
        });

        useChatStore.getState().resetState();

        const st = useChatStore.getState();
        expect(st.coreAgents.find((a) => a.id === 'cto-1')?.name).toBe('Nexus (CTO)');
        expect(st.customAgents).toEqual([]);
        expect(st.sessions).toEqual([]);
        expect(st.messagesBySession).toEqual({});
        expect(st.artifacts).toEqual([]);
        expect(st.currentSessionId).toBeNull();
        expect(st.selectedAgentId).toBeNull();
        expect(st.streamingSessionIds).toEqual([]);
        expect(st.sessionsByAgent).toEqual({});
        expect(st.activeArtifactId).toBeNull();
        expect(st.streamingArtifactBySession).toEqual({});
        expect(st.boardSession).toBeNull();
        expect(Object.values(st.errorStates).every((v) => v === null)).toBe(true);
    });

    it('NO toca los interruptores de interfaz ni el abortador', () => {
        const abort = new AbortController();
        useChatStore.setState({
            isSidebarOpen: false,
            isAgentModalOpen: true,
            isArtifactPanelOpen: true,
            abortController: abort,
        });

        useChatStore.getState().resetState();

        const st = useChatStore.getState();
        expect(st.isSidebarOpen).toBe(false);
        expect(st.isAgentModalOpen).toBe(true);
        expect(st.isArtifactPanelOpen).toBe(true);
        expect(st.abortController).toBe(abort);
    });
});
