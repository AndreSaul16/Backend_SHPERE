/**
 * ASH-007 — el copy de la junta no promete ejecución.
 *
 * AVISO, por honestidad: esto es una guarda de regresión de COPY y nada más.
 * Comprobar que un texto está en pantalla NO comprueba que el sistema haga lo
 * que el texto promete. Quien prueba que la junta no ejecuta nada es el
 * contrato del prompt en el backend (`test_board_prompt.py`); esto sólo impide
 * que alguien vuelva a escribir lo contrario en la interfaz.
 *
 * Todo se afirma sobre el texto RENDERIZADO. Afirmar una constante exportada
 * contra sí misma, o mirar el fichero donde vive el literal, daría un test que
 * no puede fallar nunca — que es justo lo que este cambio combate.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { BoardActivationModal } from '../../src/components/modals/BoardActivationModal';
import { ChatPanel } from '../../src/components/chat/ChatPanel';
import { useChatStore } from '../../src/store/useChatStore';
import { useBillingStore } from '../../src/store/useBillingStore';
import { MOCK_AGENTS, createGreeting } from '../../src/store/chat/agentCatalog';

/**
 * Lo que un humano leería en pantalla: sin asteriscos de markdown (van a
 * `<strong>`) y con los espacios normalizados, porque el texto está partido
 * entre varios elementos.
 */
const textoEnPantalla = () => (document.body.textContent ?? '').replace(/\s+/g, ' ').trim();

const PROHIBIDAS = [
    'la junta ejecuta',
    '28 integraciones',
    'los directores consultan datos en tiempo real',
    'tus agentes actúan por ti mientras debaten',
];

function sinAfirmacionesProhibidas(texto: string) {
    const plano = texto.toLowerCase();
    const encontradas = PROHIBIDAS.filter((frase) => plano.includes(frase.toLowerCase()));
    expect(encontradas, `copy prohibido en pantalla: ${encontradas.join(' · ')}`).toEqual([]);
}

beforeEach(() => {
    useChatStore.getState().resetState();
    useBillingStore.setState({
        plan_id: 'free',
        pro_messages_balance: 5,
        topup_messages_balance: 0,
        refresh: vi.fn().mockResolvedValue(undefined),
    });
});

describe('Texto 1 — el modal de activación dice qué hace la junta y qué no', () => {
    const montar = () =>
        render(
            <BoardActivationModal
                open
                onActivate={vi.fn()}
                onRouterOnly={vi.fn()}
                onClose={vi.fn()}
            />,
        );

    it('declara que delibera, no consulta en vivo y no ejecuta', () => {
        montar();

        expect(textoEnPantalla()).toContain(
            'La junta delibera: no consulta datos en vivo ni ejecuta acciones.',
        );
    });

    it('dice quién lanza cada próximo paso', () => {
        montar();

        expect(textoEnPantalla()).toContain(
            'Cada próximo paso del acta se abre con un clic en el chat de su director, y lo lanzas tú.',
        );
    });

    it('no contiene ninguna afirmación prohibida', () => {
        montar();

        sinAfirmacionesProhibidas(textoEnPantalla());
    });
});

describe('Textos 2 y 3 — la bienvenida y el saludo del canal Junta', () => {
    const montarJunta = () => {
        const sesion = 'sesion-junta';
        useChatStore.setState({
            currentSessionId: sesion,
            selectedAgentId: 'group-chat',
            sessions: [
                {
                    id: sesion,
                    agentId: 'group-chat',
                    title: 'Junta',
                    lastMessage: '',
                    timestamp: new Date(),
                },
            ],
        });
        return render(
            <MemoryRouter initialEntries={[`/chat/${sesion}`]}>
                <Routes>
                    <Route path="/chat/:sessionId" element={<ChatPanel />} />
                </Routes>
            </MemoryRouter>,
        );
    };

    it('la bienvenida de una junta vacía dice que la ejecución vive en el chat del director', () => {
        montarJunta();

        expect(screen.getByText(/Listo para empezar/)).toBeTruthy();
        expect(textoEnPantalla()).toContain(
            'Deliberan y firman el acta; cada próximo paso se abre en el chat de su director, y lo lanzas tú.',
        );
    });

    it('el saludo del canal Junta describe el debate, no un router', () => {
        const sesion = 'sesion-junta';
        const saludo = createGreeting('group-chat', MOCK_AGENTS);
        useChatStore.setState({
            currentSessionId: sesion,
            selectedAgentId: 'group-chat',
            sessions: [
                {
                    id: sesion,
                    agentId: 'group-chat',
                    title: 'Junta',
                    lastMessage: '',
                    timestamp: new Date(),
                },
            ],
            messagesBySession: { [sesion]: [saludo] },
        });
        render(
            <MemoryRouter initialEntries={[`/chat/${sesion}`]}>
                <Routes>
                    <Route path="/chat/:sessionId" element={<ChatPanel />} />
                </Routes>
            </MemoryRouter>,
        );

        const visible = textoEnPantalla();
        expect(visible).toContain(
            'Tus directores debaten en fases, votan y el CEO firma el acta.',
        );
        expect(visible).toContain(
            'Aquí se decide: cada próximo paso se ejecuta después, en el chat de su director.',
        );
        sinAfirmacionesProhibidas(visible);
    });
});

describe('Texto 5 — PRODUCT.md declara que en la junta no se ejecuta nada', () => {
    const producto = () => readFileSync(join(process.cwd(), '..', 'PRODUCT.md'), 'utf-8');

    it('separa el chat individual de la junta', () => {
        const texto = producto();

        expect(texto).toContain('chat individual');
        expect(texto).toContain('En la junta no se ejecuta ninguna herramienta');
    });

    it('la trazabilidad se atribuye al chat de cada director, no a la junta', () => {
        const texto = producto();

        expect(texto).toContain('en el chat de cada director, qué herramienta se ejecutó');
    });

    it('no contiene ninguna afirmación prohibida', () => {
        sinAfirmacionesProhibidas(producto());
    });
});
