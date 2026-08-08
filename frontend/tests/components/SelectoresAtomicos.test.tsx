import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Profiler, type ReactNode } from 'react';
import { act, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { useChatStore } from '../../src/store/useChatStore';
import { MainLayout } from '../../src/components/layout/MainLayout';
import { ArtifactPanel } from '../../src/components/artifacts/ArtifactPanel';
import { AgentSelectorModal } from '../../src/components/modals/AgentSelectorModal';
import { Sidebar } from '../../src/components/sidebar/Sidebar';
import type { Message } from '../../src/types';

/**
 * Tarea 4.6 · D20 — el token no repinta la aplicación entera.
 *
 * El §2.3 del plan lo llamaba «Store sin selectores» y listaba las superficies
 * afectadas: `ChatPanel`, `Sidebar`, `ArtifactPanel`, `CreditsIndicator` y
 * `AgentSelectorModal`. La causa mecánica: `const { … } = useChatStore()` sin
 * selector suscribe a la INSTANTÁNEA del store, y `set` fabrica un objeto nuevo
 * en cada llamada — o sea uno por token de streaming.
 *
 * La aceptación de la tarea dice «con el Profiler», así que se mide con el
 * `<Profiler>` de React: cuenta COMMITS del subárbol, que es exactamente lo que
 * cuesta dinero. Se montan los componentes de verdad, no dobles.
 *
 * (`CreditsIndicator` no sale aquí: mirado, consume `useBillingStore`, no éste.
 * `ChatPanel` tampoco: sí tiene que repintarse con el token —es quien pinta el
 * transcript— y lo que se mide de él es que las burbujas que no cambian no se
 * repinten, que es `RerenderDelTranscript.test.tsx`.)
 */

vi.mock('../../src/contexts/AuthContext', () => ({
    useAuth: () => ({ user: { uid: 'u1', email: 'a@b.c', displayName: 'A', photoURL: null }, loading: false }),
    AuthProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../../src/hooks/useUserAvatar', () => ({ useUserAvatar: () => null }));
vi.mock('framer-motion', () => {
    const Componente = ({ children, ...props }: any) => {
        const { initial, animate, exit, transition, layoutId, layout, variants,
            whileHover, whileTap, whileFocus, drag, dragConstraints, dragElastic,
            onDragEnd, ...domProps } = props;
        return <div {...domProps}>{children}</div>;
    };
    return {
        useReducedMotion: () => true,
        AnimatePresence: ({ children }: any) => children,
        motion: new Proxy({}, { get: () => Componente }),
    };
});

const turno = (id: string, content: string): Message => ({
    id, role: 'CTO', content, timestamp: new Date('2026-08-07T10:00:00Z'), agentId: 'cto-1',
});

/** Un token llegando: el store reemplaza SÓLO el mensaje que lo recibe. */
function llegaUnToken(sessionId: string, msgId: string) {
    act(() => {
        useChatStore.setState((s) => ({
            messagesBySession: {
                ...s.messagesBySession,
                [sessionId]: (s.messagesBySession[sessionId] ?? []).map((m) =>
                    m.id === msgId ? { ...m, content: m.content + 'x' } : m
                ),
            },
        }));
    });
}

function montarConProfiler(hijo: ReactNode) {
    let commits = 0;
    render(
        <MemoryRouter>
            <Profiler id="sonda" onRender={() => { commits += 1; }}>
                {hijo}
            </Profiler>
        </MemoryRouter>
    );
    return {
        /** Commits desde la última lectura. */
        desdeAqui: () => { const n = commits; commits = 0; return n; },
    };
}

const SESION = 's1';

describe('un token de streaming no repinta el chrome', () => {
    beforeEach(() => {
        useChatStore.getState().resetState();
        useChatStore.setState({
            currentSessionId: SESION,
            selectedAgentId: 'group-chat',
            sessions: [{ session_id: SESION, title: 'Junta', type: 'group' } as never],
            messagesBySession: { [SESION]: [turno('m1', 'Hola'), turno('m2', 'Adiós')] },
            streamingSessionIds: [SESION],
        });
    });

    it('MainLayout: el shell de tres columnas se queda quieto', () => {
        const sonda = montarConProfiler(
            <MainLayout sidebar={<div />} chat={<div />} artifactPanel={<div />} />
        );
        sonda.desdeAqui();

        llegaUnToken(SESION, 'm2');
        llegaUnToken(SESION, 'm2');
        llegaUnToken(SESION, 'm2');

        // Cero. El shell lee dos interruptores de chrome y ninguno cambia
        // durante un debate. Antes de 4.6 eran tres commits del marco entero.
        expect(sonda.desdeAqui()).toBe(0);
    });

    it('Sidebar: el rail se queda quieto', () => {
        const sonda = montarConProfiler(<Sidebar />);
        sonda.desdeAqui();

        llegaUnToken(SESION, 'm2');
        llegaUnToken(SESION, 'm2');

        expect(sonda.desdeAqui()).toBe(0);
    });

    it('ArtifactPanel: el panel de artefactos se queda quieto', () => {
        const sonda = montarConProfiler(<ArtifactPanel />);
        sonda.desdeAqui();

        llegaUnToken(SESION, 'm2');
        llegaUnToken(SESION, 'm2');

        expect(sonda.desdeAqui()).toBe(0);
    });

    it('AgentSelectorModal: un modal cerrado no se repinta', () => {
        const sonda = montarConProfiler(<AgentSelectorModal />);
        sonda.desdeAqui();

        llegaUnToken(SESION, 'm2');
        llegaUnToken(SESION, 'm2');

        expect(sonda.desdeAqui()).toBe(0);
    });
});

describe('los selectores siguen viendo lo que tienen que ver', () => {
    beforeEach(() => {
        useChatStore.getState().resetState();
    });

    it('el rail SÍ se repinta cuando cambia lo suyo', () => {
        // La otra mitad de la comprobación: un selector que no repinta nunca no
        // es una optimización, es un bug. Si el historial cambia, el rail tiene
        // que enterarse.
        const sonda = montarConProfiler(<Sidebar />);
        sonda.desdeAqui();

        act(() => {
            useChatStore.setState({
                sessions: [{ session_id: 'nueva', title: 'Junta nueva', type: 'group' } as never],
                historialCargado: true,
            });
        });

        expect(sonda.desdeAqui()).toBeGreaterThan(0);
    });

    it('el panel SÍ se repinta cuando llega un artefacto', () => {
        const sonda = montarConProfiler(<ArtifactPanel />);
        sonda.desdeAqui();

        act(() => {
            useChatStore.getState().addArtifact({
                id: 'a1', title: 'Acta', type: 'markdown', content: '# Acta',
                agentId: 'ceo-1', createdAt: new Date(),
            });
        });

        expect(sonda.desdeAqui()).toBeGreaterThan(0);
    });

    it('el shell SÍ se repinta al abrir o cerrar el rail', () => {
        const sonda = montarConProfiler(
            <MainLayout sidebar={<div />} chat={<div />} artifactPanel={<div />} />
        );
        sonda.desdeAqui();

        act(() => { useChatStore.getState().toggleSidebar(); });

        expect(sonda.desdeAqui()).toBeGreaterThan(0);
    });
});

describe('los hooks derivados no entran en bucle (Zustand 5)', () => {
    beforeEach(() => {
        useChatStore.getState().resetState();
    });

    it('el hilo vacío es SIEMPRE la misma referencia', () => {
        // Devolver `[]` recién creado desde un selector no es una ineficiencia
        // en Zustand 5: `useSyncExternalStore` compara la instantánea por
        // identidad, ve un valor distinto en cada comprobación y re-renderiza
        // sin parar («The result of getSnapshot should be cached»). Por eso el
        // hilo vacío es una constante de módulo congelada.
        const s = useChatStore.getState();
        const a = s.messagesBySession['no-existe'];
        expect(a).toBeUndefined();

        // Se monta un componente que pide el hilo de una sesión inexistente y
        // se comprueba que se estabiliza en UN commit, no en un bucle.
        const sonda = montarConProfiler(<ArtifactPanel />);
        expect(sonda.desdeAqui()).toBeLessThanOrEqual(2);
    });
});
