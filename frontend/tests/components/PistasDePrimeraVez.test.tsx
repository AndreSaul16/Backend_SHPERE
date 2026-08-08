import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';

import { server } from '../setup';
import {
    PREFIJO_PISTA,
    __olvidarPistas,
    marcarPistaVista,
    pistaVista,
    useFirstTimeHint,
} from '../../src/hooks/useFirstTimeHint';
import { BoardTable } from '../../src/components/chat/BoardTable';
import { useChatStore } from '../../src/store/useChatStore';
import type { Agent } from '../../src/types';
import type { BoardSessionState } from '../../src/store/useChatStore';

/**
 * Tarea 5.12 · Q13 — onboarding contextual; `OnboardingChecklist` retirado.
 *
 * ── Lo que se hereda del componente retirado ────────────────────────────────
 *
 * Sus siete pruebas fijaban contratos que este sustituto tiene que respetar, y
 * el principal era: **no saber no es lo mismo que saber que sí**. Allí, no
 * poder consultar si había una integración conectada NO podía marcar el paso
 * como hecho. Aquí el estado dudoso es `localStorage` inaccesible —Safari
 * privado, cookies de terceros bloqueadas—, y la regla es la misma: no se da la
 * pista por vista.
 *
 * Los otros dos contratos que se conservan: ni un rechazo sin dueño en el
 * montaje, y CERO llamadas a la API — que además es la razón de existir de la
 * tarea, porque el checklist disparaba tres en cada montaje de la pantalla de
 * bienvenida para todo usuario.
 */

let sinDueno: unknown[] = [];
const anotar = (e: unknown) => { sinDueno.push(e); };

/** Toda petición que salga durante estas pruebas es un fallo de la tarea. */
let peticiones: string[] = [];

beforeEach(() => {
    sinDueno = [];
    peticiones = [];
    localStorage.clear();
    __olvidarPistas();
    useChatStore.getState().resetState();
    process.on('unhandledRejection', anotar);
    server.events.on('request:start', ({ request }) => { peticiones.push(request.url); });
});
afterEach(() => {
    process.off('unhandledRejection', anotar);
    server.events.removeAllListeners('request:start');
});

vi.mock('framer-motion', () => {
    const Component = ({ children, ...props }: any) => {
        const {
            initial, animate, exit, transition, layoutId, layout, variants,
            drag, dragConstraints, dragElastic, onDragEnd,
            whileHover, whileTap, whileFocus, ...domProps
        } = props;
        return <div {...domProps}>{children}</div>;
    };
    return {
        useReducedMotion: () => false,
        AnimatePresence: ({ children }: any) => children,
        motion: new Proxy({}, { get: () => Component }),
    };
});

const AGENTS: Agent[] = [
    { id: 'ceo-1', name: 'Oberon (CEO)', role: 'CEO', avatar: 'O', description: '', color: 'text-agent-ceo', hexColor: '#B290EC', isOnline: true },
    { id: 'cto-1', name: 'Nexus (CTO)', role: 'CTO', avatar: 'N', description: '', color: 'text-agent-cto', hexColor: '#00BFB0', isOnline: true },
];

const board = (overrides: Partial<BoardSessionState> = {}): BoardSessionState => ({
    active: true, phase: 'opening', participants: ['CTO'], statusByRole: {},
    votes: {}, tally: null, unanimous: false, earlyExit: false,
    cost: 5, devil: false, lastIntervention: null,
    ...overrides,
});

describe('el registro de pistas', () => {
    it('una pista sin ver se enseña; vista, no vuelve', () => {
        const { result, rerender } = renderHook(() => useFirstTimeHint('mesa'));
        expect(result.current.mostrar).toBe(true);

        act(() => result.current.descartar());
        rerender();
        expect(result.current.mostrar).toBe(false);

        // Y tampoco en un montaje nuevo: es lo que significa «una vez».
        const otra = renderHook(() => useFirstTimeHint('mesa'));
        expect(otra.result.current.mostrar).toBe(false);
    });

    it('`activo: false` no gasta la pista: sigue pendiente para cuando toque', () => {
        const apagada = renderHook(() => useFirstTimeHint('aguja', false));
        expect(apagada.result.current.mostrar).toBe(false);
        expect(pistaVista('aguja')).toBe(false);

        const encendida = renderHook(() => useFirstTimeHint('aguja', true));
        expect(encendida.result.current.mostrar).toBe(true);
    });

    it('cada pista es independiente: descartar una no descarta las otras', () => {
        marcarPistaVista('mesa');
        expect(pistaVista('mesa')).toBe(true);
        expect(pistaVista('aguja')).toBe(false);
        expect(pistaVista('sello')).toBe(false);
    });

    it('lo visto sobrevive a la recarga', () => {
        marcarPistaVista('sello');
        expect(localStorage.getItem(`${PREFIJO_PISTA}sello`)).toBe('1');
    });
});

describe('sin almacenamiento — el contrato heredado', () => {
    it('no poder leer NO se toma por «ya vista»: la pista se enseña', () => {
        const leer = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('modo privado');
        });
        expect(pistaVista('mesa')).toBe(false);
        leer.mockRestore();
    });

    it('no poder escribir tampoco convierte la pista en un moscardón', () => {
        const escribir = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('modo privado');
        });
        const { result, rerender } = renderHook(() => useFirstTimeHint('mesa'));
        act(() => result.current.descartar());
        rerender();
        expect(result.current.mostrar).toBe(false);
        // Otro montaje en la MISMA sesión tampoco la resucita: el registro cae
        // a memoria. Vuelve en la siguiente sesión, que es lo honesto cuando no
        // hay dónde recordarlo.
        expect(renderHook(() => useFirstTimeHint('mesa')).result.current.mostrar).toBe(false);
        escribir.mockRestore();
    });

    it('descartar sin almacenamiento no lanza nada sin dueño', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('modo privado');
        });
        const { result } = renderHook(() => useFirstTimeHint('mesa'));
        expect(() => act(() => result.current.descartar())).not.toThrow();
        expect(sinDueno).toHaveLength(0);
        vi.restoreAllMocks();
    });
});

describe('las pistas en su sitio', () => {
    it('la de la mesa sale la primera vez que hay mesa, y CERO peticiones', () => {
        render(<BoardTable board={board()} agents={AGENTS} />);
        expect(screen.getByTestId('pista-mesa')).toBeInTheDocument();
        // El motivo entero de la tarea: el checklist disparaba tres llamadas en
        // cada montaje de la pantalla de bienvenida, para TODO usuario.
        expect(peticiones).toHaveLength(0);
        expect(sinDueno).toHaveLength(0);
    });

    it('la de la aguja NO sale antes de que haya un voto que mirar', () => {
        render(<BoardTable board={board()} agents={AGENTS} />);
        expect(screen.queryByTestId('pista-aguja')).toBeNull();
    });

    it('y sale en cuanto lo hay', () => {
        render(
            <BoardTable
                board={board({ votes: { CEO: { decision: 'SI', confidence: 88 } } })}
                agents={AGENTS}
            />,
        );
        expect(screen.getByTestId('pista-aguja')).toBeInTheDocument();
    });

    it('se descarta con teclado, no sólo pinchando fuera', () => {
        render(<BoardTable board={board()} agents={AGENTS} />);
        const cerrar = screen.getByRole('button', { name: /entendido, no volver a mostrar/i });
        fireEvent.click(cerrar);
        expect(screen.queryByTestId('pista-mesa')).toBeNull();
    });

    it('un usuario que ya las vio no ve ninguna, y sigue sin haber peticiones', () => {
        marcarPistaVista('mesa');
        marcarPistaVista('aguja');
        render(
            <BoardTable
                board={board({ votes: { CEO: { decision: 'SI', confidence: 88 } } })}
                agents={AGENTS}
            />,
        );
        expect(screen.queryByTestId('pista-mesa')).toBeNull();
        expect(screen.queryByTestId('pista-aguja')).toBeNull();
        expect(peticiones).toHaveLength(0);
    });

    it('la pista no roba el foco: es una nota, no un diálogo', () => {
        render(<BoardTable board={board()} agents={AGENTS} />);
        const nota = screen.getByTestId('pista-mesa');
        expect(nota).toHaveAttribute('role', 'note');
        expect(nota.contains(document.activeElement)).toBe(false);
    });
});
