import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { PlumaDelActa } from '../../src/components/artifacts/PlumaDelActa';
import { avanceDeLaPluma, CHUNKS_POR_RENGLON } from '../../src/components/artifacts/pluma';
import { ActaHeader } from '../../src/components/artifacts/ActaHeader';
import { __resetSellosEstampados } from '../../src/components/artifacts/sealRegistry';
import { useChatStore } from '../../src/store/useChatStore';
import { chatService, type StreamCallbacks } from '../../src/services/api';

/**
 * §8.8 «La Pluma del Acta» — el libro se escribe solo.
 *
 * «Un trazo de pluma que **avanza con cada chunk recibido** y se reinicia (…).
 * **Sin timers: si no llegan chunks, la pluma se detiene — que es la verdad.**»
 *
 * Esa última frase es el contrato entero, y es lo que se prueba aquí de dos
 * maneras distintas, porque es lo único que separa este efecto de una barra de
 * progreso falsa:
 *
 *  1. **Contra el reloj.** Con temporizadores falsos se adelanta el tiempo diez
 *     segundos sin que llegue ni un trozo: la pluma tiene que estar exactamente
 *     donde estaba. Y no puede haber ni un temporizador montado.
 *  2. **Con chunks de verdad.** No se simula el almacén: se conduce el stream
 *     real (`onArtifactOpen` / `onArtifactChunk` / `onArtifactClose`, los mismos
 *     manejadores que usa el producto) y se mira la cabecera del acta.
 *
 * Y la secuencia que §8.8 encadena: al cerrarse el artefacto el trazo se
 * completa en una regla llena y ENTONCES cae el sello (§8.3).
 */

const SID = 'junta-pluma';
const FECHA = new Date('2026-08-14T10:00:00Z');

const avance = () => Number(screen.getByTestId('pluma-del-acta').getAttribute('data-avance'));

/** Deja el store con una sesión abierta, sin pasar por `createNewSession`. */
const abrirSesion = () => {
    useChatStore.setState({
        currentSessionId: SID,
        selectedAgentId: 'group-chat',
        messagesBySession: { [SID]: [] },
    });
};

beforeEach(() => {
    useChatStore.getState().resetState();
    __resetSellosEstampados();
    vi.restoreAllMocks();
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe('Pluma del acta — la aritmética del renglón (§8.8)', () => {
    it('sin trozos no hay trazo, y cada trozo llena un poco más el renglón', () => {
        expect(avanceDeLaPluma(0, false)).toBe(0);
        expect(avanceDeLaPluma(1, false)).toBeCloseTo(1 / CHUNKS_POR_RENGLON);
        expect(avanceDeLaPluma(CHUNKS_POR_RENGLON, false)).toBe(1);
    });

    it('lleno el renglón, la línea vuelve a empezar — que es lo que hace una pluma', () => {
        expect(avanceDeLaPluma(CHUNKS_POR_RENGLON + 1, false)).toBeCloseTo(1 / CHUNKS_POR_RENGLON);
        expect(avanceDeLaPluma(CHUNKS_POR_RENGLON * 2, false)).toBe(1);
    });

    it('cerrado el artefacto la regla está llena, dijera lo que dijera el renglón', () => {
        expect(avanceDeLaPluma(1, true)).toBe(1);
        expect(avanceDeLaPluma(0, true)).toBe(1);
    });
});

describe('Pluma del acta — no la mueve el reloj (§8.8)', () => {
    it('diez segundos sin un solo trozo la dejan exactamente donde estaba', () => {
        vi.useFakeTimers();

        render(<PlumaDelActa chunks={3} completa={false} />);
        const antes = avance();
        expect(antes).toBeCloseTo(3 / CHUNKS_POR_RENGLON);

        act(() => {
            vi.advanceTimersByTime(10_000);
        });

        expect(avance()).toBe(antes);
        // Y no hay nada montado que pudiera moverla más tarde.
        expect(vi.getTimerCount()).toBe(0);
    });
});

describe('Pluma del acta — la mueven los chunks reales del stream (§8.8)', () => {
    it('avanza con cada trozo que llega y se completa al cerrar, y entonces cae el sello', async () => {
        abrirSesion();

        let cbs: StreamCallbacks | undefined;
        vi.spyOn(chatService, 'streamChat').mockImplementation(
            async (_q: string, _s: string, cb: StreamCallbacks) => {
                cbs = cb;
                cb.onArtifactOpen?.({
                    title: 'Acta de la junta',
                    artifact_type: 'markdown',
                    language: '',
                });
                cb.onArtifactChunk?.('# Acta de la junta\n');
            },
        );

        await useChatStore.getState().sendMessage('convoca la junta');

        const acta = useChatStore.getState().artifacts[0];
        expect(acta.title).toBe('Acta de la junta');

        render(<ActaHeader actaId={acta.id} date={FECHA} />);

        const conUnTrozo = avance();
        expect(conUnTrozo).toBeCloseTo(1 / CHUNKS_POR_RENGLON);
        // Mientras se escribe, el acta NO está cerrada: no se sella.
        expect(screen.queryByRole('img', { name: /Acta sellada/ })).toBeNull();

        // Llegan tres trozos más, por el mismo canal que en producción.
        act(() => {
            cbs?.onArtifactChunk?.('Asisten: CEO, CTO, CFO.\n');
            cbs?.onArtifactChunk?.('Se debate la propuesta.\n');
            cbs?.onArtifactChunk?.('Se acuerda seguir adelante.\n');
        });

        expect(avance()).toBeCloseTo(4 / CHUNKS_POR_RENGLON);
        expect(avance()).toBeGreaterThan(conUnTrozo);

        // Se cierra el artefacto y termina el turno: la regla se completa y da
        // paso al sello. Ése es el encadenado de §8.8: debate → escritura →
        // constancia.
        act(() => {
            cbs?.onArtifactClose?.();
            cbs?.onDone?.();
        });

        expect(avance()).toBe(1);
        expect(screen.getByRole('img', { name: /Acta sellada/ })).toBeInTheDocument();
    });
});
