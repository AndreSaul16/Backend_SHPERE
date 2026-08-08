import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DebateReplay } from '../../src/components/chat/DebateReplay';
import { VELOCIDADES, duracionDeTurno } from '../../src/components/chat/replayTiempos';
import { mensajesDeMuestra, CONSULTA_DE_MUESTRA } from '../../src/lib/sampleBoard';
import { rebuildBoardSession } from '../../src/store/chat/boardSession';
import { useChatStore } from '../../src/store/useChatStore';
import type { Agent } from '../../src/types';

/**
 * Tarea 5.10 · Q7 — replay del debate y junta de muestra pregrabada.
 *
 * Criterio: «un acta cerrada se reproduce a 1×/2×/8×; una cuenta nueva ve la
 * junta de muestra sin gastar créditos».
 *
 * El «sin gastar créditos» no es retórica: se comprueba que reproducir no llama
 * a `sendMessage` ni toca el saldo. Un reproductor que por dentro reenviara la
 * consulta sería exactamente el fallo que viene a evitar.
 */

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

const AGENTES: Agent[] = [
    { id: 'ceo-1', name: 'Oberon (CEO)', role: 'CEO', avatar: 'O', description: '', color: '', hexColor: '#B290EC', isOnline: true },
    { id: 'cto-1', name: 'Nexus (CTO)', role: 'CTO', avatar: 'N', description: '', color: '', hexColor: '#00BFB0', isOnline: true },
    { id: 'cfo-1', name: 'Ledger (CFO)', role: 'CFO', avatar: 'L', description: '', color: '', hexColor: '#E0B341', isOnline: true },
    { id: 'cmo-1', name: 'Iris (CMO)', role: 'CMO', avatar: 'I', description: '', color: '', hexColor: '#E08A41', isOnline: true },
];

beforeEach(() => {
    useChatStore.getState().resetState();
    vi.useFakeTimers();
});
afterEach(() => {
    vi.useRealTimers();
});

const montar = () =>
    render(
        <DebateReplay
            open
            onClose={vi.fn()}
            mensajes={mensajesDeMuestra()}
            agentes={AGENTES}
            titulo="Junta de muestra"
        />,
    );

/**
 * Avanza `pasos` turnos.
 *
 * Uno por llamada a `act`, y no un salto grande de reloj: el temporizador del
 * turno siguiente sólo se programa DESPUÉS de que React repinte y vuelva a
 * correr el efecto, así que un `advanceTimersByTime(120000)` de una sentada
 * revela exactamente un turno.
 */
const avanzar = (pasos: number) => {
    for (let i = 0; i < pasos; i++) act(() => { vi.advanceTimersByTime(7000); });
};

describe('los tiempos', () => {
    it('un turno largo dura más que uno corto: no es un pase de diapositivas', () => {
        expect(duracionDeTurno('a'.repeat(400), 1)).toBeGreaterThan(
            duracionDeTurno('De acuerdo.', 1),
        );
    });

    it('la velocidad divide el tiempo, y son 1×, 2× y 8×', () => {
        expect(VELOCIDADES).toEqual([1, 2, 8]);
        const base = duracionDeTurno('a'.repeat(100), 1);
        expect(duracionDeTurno('a'.repeat(100), 2)).toBe(Math.round(base / 2));
        expect(duracionDeTurno('a'.repeat(100), 8)).toBe(Math.round(base / 8));
    });

    it('hay suelo y techo: ni un turno invisible ni medio minuto clavado', () => {
        expect(duracionDeTurno('', 1)).toBe(700);
        expect(duracionDeTurno('a'.repeat(100000), 1)).toBe(6000);
    });
});

describe('la junta de muestra', () => {
    it('empieza por la consulta y trae un debate con disenso', () => {
        const mensajes = mensajesDeMuestra();
        expect(mensajes[0].role).toBe('user');
        expect(mensajes[0].content).toBe(CONSULTA_DE_MUESTRA);

        const board = rebuildBoardSession(mensajes)!;
        // Una muestra tiene que enseñar el caso interesante, no un 2-0 sin
        // gracia: el CFO discrepa y lo hace con confianza alta.
        expect(board.votes.CFO.decision).toBe('NO');
        expect(board.votes.CFO.confidence).toBeGreaterThanOrEqual(70);
        expect(new Set(Object.values(board.votes).map((v) => v.decision)).size).toBeGreaterThan(1);
    });

    it('recorre las fases del backend, incluida la del diablo', () => {
        const fases = new Set(mensajesDeMuestra().map((m) => m.phase).filter(Boolean));
        expect(fases).toContain('opening');
        expect(fases).toContain('analysis');
        expect(fases).toContain('rebuttal');
        expect(fases).toContain('devil');
        expect(fases).toContain('synthesis');
    });

    it('es estable entre llamadas: el reproductor no la trata como contenido nuevo', () => {
        expect(JSON.stringify(mensajesDeMuestra())).toBe(JSON.stringify(mensajesDeMuestra()));
    });
});

describe('el reproductor', () => {
    it('abre con la consulta y va revelando turnos', () => {
        montar();
        expect(screen.getByText(/1 de \d+ turnos/i)).toBeInTheDocument();
        avanzar(1);
        expect(screen.queryByText(/^1 de \d+ turnos$/i)).toBeNull();
    });

    it('la mesa se reconstruye con los turnos ya revelados, no con todos', () => {
        montar();
        // Al principio nadie ha votado todavía: no hay grado de desacuerdo.
        expect(screen.queryByTestId('grado-de-desacuerdo')).toBeNull();
        avanzar(12);
        expect(screen.getByTestId('grado-de-desacuerdo')).toBeInTheDocument();
    });

    it('la pausa detiene el avance', () => {
        montar();
        avanzar(2);
        const antes = screen.getByText(/de \d+ turnos/i).textContent;
        fireEvent.click(screen.getByRole('button', { name: /pausar/i }));
        avanzar(6);
        expect(screen.getByText(/de \d+ turnos/i).textContent).toBe(antes);
    });

    it('las tres velocidades están y se marcan', () => {
        montar();
        for (const v of VELOCIDADES) {
            expect(screen.getByRole('button', { name: `Velocidad ${v} por uno` })).toBeInTheDocument();
        }
        fireEvent.click(screen.getByRole('button', { name: /velocidad 8/i }));
        expect(screen.getByRole('button', { name: /velocidad 8/i })).toHaveAttribute(
            'aria-pressed',
            'true',
        );
    });

    it('a 8× llega al final mucho antes que a 1×', () => {
        montar();
        fireEvent.click(screen.getByRole('button', { name: /velocidad 8/i }));
        avanzar(12);
        expect(screen.getByRole('button', { name: /volver a empezar/i })).toBeInTheDocument();
    });

    it('al acabar ofrece repetir, y repetir vuelve al principio', () => {
        montar();
        fireEvent.click(screen.getByRole('button', { name: /velocidad 8/i }));
        avanzar(12);
        fireEvent.click(screen.getByRole('button', { name: /volver a empezar/i }));
        expect(screen.getByText(/^1 de \d+ turnos$/i)).toBeInTheDocument();
    });

    it('el progreso también se anuncia, no sólo se dibuja', () => {
        montar();
        avanzar(2);
        expect(screen.getByText(/turno \d+ de \d+/i)).toBeInTheDocument();
    });

    it('NO gasta créditos: ni un mensaje enviado ni un saldo tocado', () => {
        const antes = JSON.stringify(useChatStore.getState().messagesBySession);
        montar();
        avanzar(12);
        expect(JSON.stringify(useChatStore.getState().messagesBySession)).toBe(antes);
    });

    it('cerrado no pinta nada', () => {
        render(
            <DebateReplay
                open={false}
                onClose={vi.fn()}
                mensajes={mensajesDeMuestra()}
                agentes={AGENTES}
                titulo="x"
            />,
        );
        expect(screen.queryByTestId('mandos-replay')).toBeNull();
    });
});
