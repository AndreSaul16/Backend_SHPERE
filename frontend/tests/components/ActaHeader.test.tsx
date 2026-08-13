import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ActaHeader } from '../../src/components/artifacts/ActaHeader';
import { __resetSellosEstampados } from '../../src/components/artifacts/sealRegistry';
import { useChatStore } from '../../src/store/useChatStore';
import type { Message } from '../../src/types';

/**
 * La cabecera de la hoja — tarea 2.1 («fecha y recuento») y el sitio donde
 * aterriza el Sello (§8.3).
 *
 * El recuento sale del store y no del markdown a propósito: el cuerpo del acta
 * lo escribe un modelo y a veces trae su propio encabezamiento y a veces no.
 */

const FECHA = new Date('2026-08-08T10:00:00Z');

const voto = (id: string, decision: Message['vote'] extends infer V ? NonNullable<V>['decision'] : never, confidence: number): Message => ({
    id,
    role: 'CFO',
    content: 'x',
    timestamp: FECHA,
    vote: { decision, confidence },
});

const sembrar = (mensajes: Message[], streaming = false) => {
    useChatStore.setState({
        currentSessionId: 'junta-q4',
        messagesBySession: { 'junta-q4': mensajes },
        streamingSessionIds: streaming ? ['junta-q4'] : [],
    });
};

beforeEach(() => __resetSellosEstampados());
afterEach(() => {
    cleanup();
    useChatStore.setState({ currentSessionId: null, messagesBySession: {}, streamingSessionIds: [] });
});

describe('ActaHeader', () => {
    it('data el acta en español peninsular', () => {
        sembrar([]);
        render(<ActaHeader actaId="art-1" date={FECHA} />);
        expect(screen.getByText('8 de agosto de 2026')).toBeTruthy();
    });

    it('cuenta los votos con el vocabulario canónico de §11', () => {
        sembrar([
            voto('1', 'SI', 78),
            voto('2', 'NO', 91),
            voto('3', 'CONDICIONAL', 64),
            voto('4', 'NO', 83),
        ]);
        render(<ActaHeader actaId="art-1" date={FECHA} />);
        expect(
            screen.getByText('Recuento · 1 a favor · 2 en contra · 1 condicional')
        ).toBeTruthy();
    });

    it('no inventa un recuento cuando no hubo votos', () => {
        sembrar([{ id: '1', role: 'user', content: 'hola', timestamp: FECHA }]);
        render(<ActaHeader actaId="art-1" date={FECHA} />);
        expect(screen.queryByText(/Recuento/)).toBeNull();
    });

    it('sella el acta cerrada', () => {
        sembrar([voto('1', 'SI', 78)]);
        render(<ActaHeader actaId="art-1" date={FECHA} />);
        expect(screen.getByRole('img', { name: /Acta sellada/ })).toBeTruthy();
    });

    it('NO sella mientras la junta sigue hablando', () => {
        // Un sello sobre un documento que todavía crece sería falso, y además
        // gastaría el único aterrizaje del debate en el momento equivocado.
        sembrar([voto('1', 'SI', 78)], true);
        render(<ActaHeader actaId="art-1" date={FECHA} />);
        expect(screen.queryByRole('img', { name: /Acta sellada/ })).toBeNull();
    });

    it('el tampón lo elige la junta, no el artefacto', () => {
        // El artefacto se re-crea con un uuid nuevo en cada carga del historial:
        // si el sangrado dependiera de él, la misma acta cambiaría de sello.
        sembrar([]);
        const primera = render(<ActaHeader actaId="art-uuid-1" date={FECHA} />);
        const a = primera.container.querySelector<HTMLElement>('[role="img"] span')!.style.getPropertyValue('--seal-src');
        cleanup();
        __resetSellosEstampados();
        const segunda = render(<ActaHeader actaId="art-uuid-2" date={FECHA} />);
        const b = segunda.container.querySelector<HTMLElement>('[role="img"] span')!.style.getPropertyValue('--seal-src');
        expect(a).toBe(b);
    });
});
