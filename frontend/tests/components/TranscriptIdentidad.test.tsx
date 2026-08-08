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

    it('cada burbuja de junta toma el hex de §2.8 de su director', () => {
        render_();

        const esperado = [AGENT_HEX.CEO, AGENT_HEX.CTO, AGENT_HEX.CFO, AGENT_HEX.CMO];
        const filetes = burbujas().map(b => b.style.borderColor);

        expect(filetes).toHaveLength(4);
        esperado.forEach((hex, i) => {
            expect(filetes[i], `burbuja ${i}`).toContain(rgba(hex));
        });
        // Cuatro directores, cuatro colores: el fallo era que había uno solo.
        expect(new Set(filetes).size).toBe(4);
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

        expect(burbujas()[0].style.borderColor).toContain(rgba('#123456'));
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
