import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../setup';
import { useChatStore } from '../../src/store/useChatStore';
import type { ChatSession } from '../../src/types';

/**
 * F2 (P0) — al reabrir una junta, la sesión sigue siendo una junta.
 *
 * `loadSession` usaba `'group-chat'` como centinela de «no hay valor» Y como
 * valor legítimo, así que descartaba la identidad justo cuando existía: la
 * sesión de junta se recargaba como chat 1-a-1 con el CEO. En cadena: sin mesa
 * de directores, coste «1 por mensaje» y todas las burbujas con el color del
 * CEO. Y aunque la identidad se salvara, `boardSession` sólo lo escribía el
 * stream SSE, así que la banda tampoco tenía de dónde reconstruirse.
 *
 * Verificado en las dos direcciones: con el código anterior,
 * `selectedAgentId` sale `'ceo-1'` y `boardSession` sale `null`.
 */

const SESSION_ID = 'junta-q4-enterprise';

const junta: ChatSession = {
    session_id: SESSION_ID,
    user_id: 'u1',
    title: 'Lanzamiento de SPHERE Enterprise',
    base_agent_id: 'group-chat',
    agent_ref_type: 'core',
    type: 'group',
    visual_config: {},
    context_files: [],
    enabled_tools: [],
    members: [],
    created_at: new Date().toISOString(),
};

const t = (n: number) => new Date(Date.UTC(2026, 7, 8, 13, n)).toISOString();

/** Historial en el formato que persiste el backend (ver `useChatStore.loadSession`). */
const HISTORIAL = {
    messages: [
        { type: 'human', content: '¿Lanzamos Enterprise en Q4?', additional_kwargs: { timestamp: t(40) } },
        {
            type: 'ai', content: 'Abro la sesión.',
            additional_kwargs: { agent_role: 'CEO', agent_id: 'ceo-1', board_phase: 'opening', timestamp: t(41) },
        },
        {
            type: 'ai', content: 'Técnicamente llegamos.',
            additional_kwargs: { agent_role: 'CTO', agent_id: 'cto-1', board_phase: 'analysis', board_vote: { decision: 'SI', confidence: 78 }, timestamp: t(45) },
        },
        {
            type: 'ai', content: 'La caja no aguanta el adelanto.',
            additional_kwargs: { agent_role: 'CFO', agent_id: 'cfo-1', board_phase: 'analysis', board_vote: { decision: 'NO', confidence: 91 }, timestamp: t(47) },
        },
        {
            type: 'ai', content: 'Con condiciones.',
            additional_kwargs: { agent_role: 'CMO', agent_id: 'cmo-1', board_phase: 'rebuttal', board_vote: { decision: 'CONDICIONAL', confidence: 64 }, timestamp: t(50) },
        },
        {
            type: 'ai', content: 'Nadie ha nombrado el escenario que hunde esto.',
            additional_kwargs: { agent_role: 'DEVIL', board_phase: 'devil', board_vote: { decision: 'NO', confidence: 83 }, timestamp: t(55) },
        },
        {
            type: 'ai', content: 'Queda el acta.',
            additional_kwargs: { agent_role: 'CEO', agent_id: 'ceo-1', board_phase: 'synthesis', is_conclusion: true, timestamp: t(58) },
        },
    ],
};

const servirHistorial = (payload: unknown) =>
    server.use(http.get('http://localhost:8000/api/v1/sessions/:id/history', () => HttpResponse.json(payload)));

describe('F2 — la junta no pierde su identidad al recargarse', () => {
    beforeEach(() => {
        useChatStore.getState().resetState();
    });

    it('conserva `group-chat` como agente de la sesión (y no lo cambia por el CEO)', async () => {
        useChatStore.setState({ sessions: [junta] });
        servirHistorial(HISTORIAL);

        await useChatStore.getState().loadSession(SESSION_ID);

        expect(useChatStore.getState().selectedAgentId).toBe('group-chat');
    });

    it('reconstruye el war-room del debate ya terminado', async () => {
        useChatStore.setState({ sessions: [junta] });
        servirHistorial(HISTORIAL);

        await useChatStore.getState().loadSession(SESSION_ID);
        const board = useChatStore.getState().boardSession;

        expect(board).not.toBeNull();
        expect(board!.votes.CTO).toEqual({ decision: 'SI', confidence: 78 });
        expect(board!.votes.CFO).toEqual({ decision: 'NO', confidence: 91 });
        expect(board!.votes.DEVIL).toEqual({ decision: 'NO', confidence: 83 });
        expect(board!.devil).toBe(true);
        expect(board!.participants).toEqual(expect.arrayContaining(['CEO', 'CTO', 'CFO', 'CMO']));
        expect(board!.participants).not.toContain('DEVIL'); // la banda lo añade aparte
        expect(board!.tally).toEqual({ SI: 1, NO: 2, CONDICIONAL: 1 });
        expect(board!.phase).toBe('synthesis');
        // El debate terminó: la mesa se pinta, pero nada la trata como viva.
        expect(board!.active).toBe(false);
    });

    it('vuelve a la junta desde la caché sin degradarla a chat con el CEO', async () => {
        useChatStore.setState({ sessions: [junta] });
        servirHistorial(HISTORIAL);

        await useChatStore.getState().loadSession(SESSION_ID);
        // Simula irse a otro sitio y volver: la segunda carga sale de caché.
        useChatStore.setState({ selectedAgentId: 'cto-1', boardSession: null });
        await useChatStore.getState().loadSession(SESSION_ID);

        expect(useChatStore.getState().selectedAgentId).toBe('group-chat');
        expect(useChatStore.getState().boardSession).not.toBeNull();
    });

    it('una sesión 1-a-1 sigue resolviéndose a su agente y sin mesa', async () => {
        const directa: ChatSession = { ...junta, session_id: 's-cto', base_agent_id: 'cto-1', type: 'direct' };
        useChatStore.setState({ sessions: [directa], boardSession: { active: true } as never });
        servirHistorial({
            messages: [
                { type: 'human', content: 'Hola', additional_kwargs: { timestamp: t(10) } },
                { type: 'ai', content: 'Dime.', additional_kwargs: { agent_role: 'CTO', agent_id: 'cto-1', timestamp: t(11) } },
            ],
        });

        await useChatStore.getState().loadSession('s-cto');

        expect(useChatStore.getState().selectedAgentId).toBe('cto-1');
        // Además se retira el war-room de la junta anterior: era de otra sesión.
        expect(useChatStore.getState().boardSession).toBeNull();
    });

    it('sin `base_agent_id` sigue infiriendo del historial (el camino legítimo del centinela)', async () => {
        const huerfana = { ...junta, session_id: 's-vieja', base_agent_id: '', type: 'direct' as const };
        useChatStore.setState({ sessions: [huerfana] });
        servirHistorial({
            messages: [
                { type: 'ai', content: 'Hola', additional_kwargs: { agent_role: 'CFO', agent_id: 'cfo-1', timestamp: t(12) } },
            ],
        });

        await useChatStore.getState().loadSession('s-vieja');

        expect(useChatStore.getState().selectedAgentId).toBe('cfo-1');
    });
});

/**
 * lanzamiento-p0 · BVT-002 — «se abstuvo» y «aún no ha votado» no son lo mismo.
 *
 * El backend escribe ahora `board_vote = {decision:'ABSTENCION', confidence:null}`
 * en `additional_kwargs`. El lector lo convertía en un 50 inventado, que es
 * exactamente la cifra que el chip enseñaría como confianza del director.
 */
describe('la abstención sobrevive a la recarga', () => {
    beforeEach(() => {
        useChatStore.getState().resetState();
    });

    it('el que se abstuvo vuelve como ABSTENCION y sin cifra; el que no votó, sin voto', async () => {
        useChatStore.setState({ sessions: [junta] });
        servirHistorial({
            messages: [
                { type: 'human', content: '¿Lanzamos Enterprise en Q4?', additional_kwargs: { timestamp: t(40) } },
                {
                    type: 'ai', content: 'No me pronuncio.',
                    additional_kwargs: {
                        agent_role: 'CFO', agent_id: 'cfo-1', board_phase: 'analysis',
                        board_vote: { decision: 'ABSTENCION', confidence: null }, timestamp: t(45),
                    },
                },
                {
                    type: 'ai', content: 'Todavía estoy leyendo.',
                    additional_kwargs: { agent_role: 'CMO', agent_id: 'cmo-1', board_phase: 'analysis', timestamp: t(46) },
                },
            ],
        });

        await useChatStore.getState().loadSession(SESSION_ID);
        const mensajes = useChatStore.getState().messagesBySession[SESSION_ID];
        const cfo = mensajes.find((m) => m.agentId === 'cfo-1')!;
        const cmo = mensajes.find((m) => m.agentId === 'cmo-1')!;

        expect(cfo.vote?.decision).toBe('ABSTENCION');
        expect(cfo.vote?.confidence).toBeNull();
        expect(cmo.vote).toBeUndefined();
    });
});
