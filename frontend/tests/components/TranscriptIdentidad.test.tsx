import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ChatPanel } from '../../src/components/chat/ChatPanel';
import { useChatStore, AGENT_HEX, rebuildBoardSession } from '../../src/store/useChatStore';
import type { ChatSession, Message } from '../../src/types';

/**
 * F5 (P1) — los cinco directores no pueden pintarse del mismo color.
 *
 * `ChatPanel` pasaba `agentColor={effectiveBubbleColor}` a TODAS las burbujas y
 * en `MessageBubble` el color de sesión gana siempre, así que la identidad de
 * §2.8 —que sí está bien migrada en el store y sí se ve en las placas de la
 * banda— nunca llegaba al transcript: Oberon, Nexus, Ledger, Vortex y Némesis
 * salían los cinco en latón. §P2: el desacuerdo es la señal; si todos son el
 * mismo color, el desacuerdo sólo se distingue leyendo el nombre.
 */

vi.mock('framer-motion', () => {
    const Component = ({ children, ...props }: any) => {
        const { initial, animate, exit, transition, layoutId, layout, variants, whileHover, whileTap, whileFocus, ...domProps } = props;
        return <div {...domProps}>{children}</div>;
    };
    return {
        useReducedMotion: () => false,
        AnimatePresence: ({ children }: any) => children,
        motion: new Proxy({}, { get: () => Component }),
    };
});

vi.mock('../../src/hooks/useUserAvatar', () => ({ useUserAvatar: () => null }));

const SESSION_ID = 's-junta';

const junta: ChatSession = {
    session_id: SESSION_ID, user_id: 'u1', title: 'Junta', base_agent_id: 'group-chat',
    agent_ref_type: 'core', type: 'group',
    // La sesión trae color propio: antes ganaba éste y aplanaba a los cinco.
    visual_config: { bubble_color: '#D7A94F' },
    context_files: [], enabled_tools: [], members: [], created_at: new Date().toISOString(),
};

const turno = (id: string, role: any, agentId: string, content: string): Message => ({
    id, role, content, agentId, timestamp: new Date(),
});

const mensajes: Message[] = [
    turno('m1', 'CEO', 'ceo-1', 'Abro la sesión.'),
    turno('m2', 'CTO', 'cto-1', 'Técnicamente llegamos.'),
    turno('m3', 'CFO', 'cfo-1', 'La caja no aguanta.'),
    turno('m4', 'CMO', 'cmo-1', 'Con condiciones.'),
];

/** jsdom normaliza `#B290EC35` a `rgba(178, 144, 236, 0.208)`. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- se conserva; FASE 8 dejó las aserciones en var()+hex
const rgba = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
};

/** Las burbujas del transcript, en orden de aparición. */
const burbujas = () => Array.from(document.querySelectorAll('[data-row]')) as HTMLElement[];

describe('F5 — identidad de cada director en el transcript', () => {
    beforeEach(() => {
        useChatStore.getState().resetState();
        useChatStore.setState({
            sessions: [junta],
            currentSessionId: SESSION_ID,
            selectedAgentId: 'group-chat',
            messagesBySession: { [SESSION_ID]: mensajes },
        });
    });

    const render_ = () => render(<MemoryRouter><ChatPanel /></MemoryRouter>);

    it('cada burbuja de junta toma la identidad de §2.8 de su director, apta para los dos temas', () => {
        render_();

        // FASE 8 — la identidad ya no viaja como hex fijo (medía 2.2-2.6:1
        // sobre papel en tema claro): viaja como var(--agent-…) con el hex
        // canónico de respaldo, y el tema la re-resuelve. Ver lib/colorDeAgente.
        const esperado = [
            ['--agent-ceo', AGENT_HEX.CEO],
            ['--agent-cto', AGENT_HEX.CTO],
            ['--agent-cfo', AGENT_HEX.CFO],
            ['--agent-cmo', AGENT_HEX.CMO],
        ] as const;
        const filetes = burbujas().map(b => b.style.borderColor);

        expect(filetes).toHaveLength(4);
        esperado.forEach(([variable, hex], i) => {
            expect(filetes[i], `burbuja ${i}`).toContain(variable);
            expect(filetes[i], `burbuja ${i}`).toContain(hex);
        });
        // Cuatro directores, cuatro colores: el fallo era que había uno solo.
        expect(new Set(filetes).size).toBe(4);
    });

    it('el Diablo se pinta de coral y firma con su nombre, no «DEVIL»', () => {
        /**
         * Defecto visto en la verificación de la fase 3, no inventariado.
         *
         * `BOARD_DEVIL_AGENT` NO está en `getAgents()`: §2.8 sólo da identidad
         * seleccionable a los cinco directores y el Diablo es un asiento
         * opcional del debate. `ChatPanel` resolvía el agente de la burbuja SÓLO
         * por `agentId`, así que para `devil-1` salía `undefined` y la burbuja
         * caía al latón de reserva y firmaba con el rol crudo, «DEVIL».
         *
         * Y en la misma pantalla, su PLACA del Palco salía en coral, porque
         * `BoardTable` sí usa `getBoardAgentByRole`. El mismo asiento con dos
         * identidades a la vez.
         */
        useChatStore.setState({
            messagesBySession: {
                [SESSION_ID]: [turno('m-devil', 'DEVIL', 'devil-1', 'Nadie ha puesto número al coste de equivocarse.')],
            },
        });

        render_();

        const filete = burbujas()[0].style.borderColor;
        expect(filete).toContain('--agent-devil');
        expect(filete).toContain(AGENT_HEX.DEVIL);
        // Y no el latón de reserva, que es lo que salía.
        expect(filete).not.toContain(AGENT_HEX.custom);
        expect(screen.getByText('Némesis')).toBeInTheDocument();
        expect(screen.queryByText('DEVIL')).toBeNull();
    });

    it('en un chat 1-a-1 el color elegido para la sesión sigue mandando', () => {
        const directa: ChatSession = { ...junta, session_id: 's-cto', base_agent_id: 'cto-1', type: 'direct', visual_config: { bubble_color: '#123456' } };
        useChatStore.setState({
            sessions: [directa],
            currentSessionId: 's-cto',
            selectedAgentId: 'cto-1',
            messagesBySession: { 's-cto': [turno('m1', 'CTO', 'cto-1', 'Dime.')] },
        });

        render_();

        // El color de sesión lo eligió el usuario: NO se sustituye por el
        // token de tema del rol (regla de colorDeAgente).
        // jsdom normaliza el hex dentro del color-mix a rgb(): se comprueba
        // el triplete, que es unívoco para #123456.
        const filete = burbujas()[0].style.borderColor;
        expect(filete).toContain('18, 52, 86');
        expect(filete).not.toContain('--agent-cto');
    });
});

describe('F2 — la mesa de directores se monta al reabrir la junta', () => {
    beforeEach(() => {
        useChatStore.getState().resetState();
        useChatStore.setState({
            sessions: [junta],
            currentSessionId: SESSION_ID,
            selectedAgentId: 'group-chat',
            messagesBySession: { [SESSION_ID]: mensajes },
        });
    });

    it('pinta la banda con el war-room reconstruido de un debate terminado', () => {
        const conVotos = mensajes.map((m, i) => (
            i === 1 ? { ...m, vote: { decision: 'SI', confidence: 78 } as const, phase: 'analysis' as const } : m
        ));
        useChatStore.setState({
            messagesBySession: { [SESSION_ID]: conVotos },
            boardSession: rebuildBoardSession(conVotos),
        });

        render(<MemoryRouter><ChatPanel /></MemoryRouter>);

        // La región viva del recuento sólo existe dentro de `BoardWarRoom`.
        expect(screen.getByTestId('live-tally')).toBeInTheDocument();
        expect(screen.getByText(/5 por debate/i)).toBeInTheDocument();
    });

    it('no pinta una mesa vacía mientras el debate aún no ha arrancado', () => {
        useChatStore.setState({
            boardSession: {
                active: false, phase: null, participants: [], statusByRole: {},
                votes: {}, tally: null, unanimous: false, earlyExit: false,
                cost: 5, devil: false, lastIntervention: null,
            },
        });

        render(<MemoryRouter><ChatPanel /></MemoryRouter>);

        expect(screen.queryByTestId('live-tally')).not.toBeInTheDocument();
    });
});
