import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DisagreementBar } from '../../src/components/chat/DisagreementBar';
import { gradoDeDesacuerdo, UMBRAL_DE_CONFIANZA } from '../../src/components/chat/desacuerdo';
import type { BoardVote } from '../../src/types';

/**
 * Tarea 5.5 · Q8 — el grado de desacuerdo en la cabecera del debate.
 *
 * Los datos llevaban ahí desde el primer debate: la cabecera enseñaba «2 a
 * favor · 1 en contra» y dejaba al usuario la lectura. Y no significa lo mismo
 * un 2-1 donde el que discrepa lo hace con un 91% de confianza —una junta
 * partida— que uno donde lo hace con un 55% —una reserva—. El umbral de 70 es
 * el mismo de la Aguja de Confianza (§8.2).
 */

vi.mock('framer-motion', () => ({
    useReducedMotion: () => false,
    AnimatePresence: ({ children }: any) => children,
    motion: new Proxy({}, { get: () => ({ children }: any) => <div>{children}</div> }),
}));

const voto = (decision: BoardVote['decision'], confidence: number): BoardVote =>
    ({ decision, confidence } as BoardVote);

describe('el cálculo del grado', () => {
    it('todos votando lo mismo es Unanimidad, y dice la confianza media', () => {
        const g = gradoDeDesacuerdo({
            CEO: voto('SI', 90), CTO: voto('SI', 80), CFO: voto('SI', 70),
        });
        expect(g.nivel).toBe('unanime');
        expect(g.etiqueta).toBe('Unanimidad');
        expect(g.grado).toBe(0);
        expect(g.detalle).toMatch(/80%/);
    });

    it('2-1 con el disenso por encima del umbral es Junta dividida', () => {
        const g = gradoDeDesacuerdo({
            CEO: voto('SI', 65), CTO: voto('SI', 60), CFO: voto('NO', 91),
        });
        expect(g.nivel).toBe('dividida');
        expect(g.etiqueta).toBe('Junta dividida');
        expect(g.confianzaDelDisenso).toBe(91);
    });

    it('el mismo 2-1 con el disenso flojo es una reserva, no una fractura', () => {
        const g = gradoDeDesacuerdo({
            CEO: voto('SI', 88), CTO: voto('SI', 80), CFO: voto('NO', 55),
        });
        expect(g.nivel).toBe('mayoria');
        expect(g.etiqueta).toBe('Mayoría con reserva');
    });

    it('un empate es junta dividida aunque nadie esté muy seguro', () => {
        const g = gradoDeDesacuerdo({ CEO: voto('SI', 50), CTO: voto('NO', 50) });
        expect(g.nivel).toBe('dividida');
    });

    it('justo en el umbral ya cuenta como certeza', () => {
        const g = gradoDeDesacuerdo({
            CEO: voto('SI', 90), CTO: voto('SI', 90), CFO: voto('NO', UMBRAL_DE_CONFIANZA),
        });
        expect(g.nivel).toBe('dividida');
    });

    it('un voto solo no es unanimidad — sería una mentira estadística', () => {
        expect(gradoDeDesacuerdo({ CEO: voto('SI', 99) }).nivel).toBe('sin-datos');
        expect(gradoDeDesacuerdo({}).nivel).toBe('sin-datos');
        expect(gradoDeDesacuerdo(null).nivel).toBe('sin-datos');
    });

    it('el condicional cuenta como su propia decisión, no como un sí flojo', () => {
        const g = gradoDeDesacuerdo({
            CEO: voto('SI', 80), CTO: voto('CONDICIONAL', 85), CFO: voto('CONDICIONAL', 75),
        });
        expect(g.recuento).toEqual({ SI: 1, NO: 0, CONDICIONAL: 2 });
        expect(g.nivel).toBe('dividida');
    });
});

describe('la barra en pantalla', () => {
    it('dice el veredicto con palabras, no sólo con color (§P5)', () => {
        render(
            <DisagreementBar
                votes={{ CEO: voto('SI', 65), CTO: voto('SI', 60), CFO: voto('NO', 91) }}
            />,
        );
        expect(screen.getByText('Junta dividida')).toBeInTheDocument();
        expect(screen.getByTestId('grado-de-desacuerdo')).toHaveAttribute('data-nivel', 'dividida');
    });

    it('la medida existe para quien no la ve', () => {
        render(
            <DisagreementBar
                votes={{ CEO: voto('SI', 65), CTO: voto('SI', 60), CFO: voto('NO', 91) }}
            />,
        );
        const medidor = screen.getByRole('meter', { name: /grado de desacuerdo/i });
        expect(medidor).toHaveAttribute('aria-valuemin', '0');
        expect(medidor).toHaveAttribute('aria-valuemax', '100');
        expect(Number(medidor.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
        expect(medidor.getAttribute('aria-valuetext')).toMatch(/junta dividida/i);
        expect(medidor.getAttribute('aria-valuetext')).toMatch(/91%/);
    });

    it('unánime lo dice y su medida es cero', () => {
        render(<DisagreementBar votes={{ CEO: voto('SI', 90), CTO: voto('SI', 88) }} />);
        expect(screen.getByText('Unanimidad')).toBeInTheDocument();
        expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '0');
    });

    it('sin votos suficientes no ocupa sitio para no decir nada', () => {
        const { container } = render(<DisagreementBar votes={{}} />);
        expect(container).toBeEmptyDOMElement();
    });
});

/**
 * lanzamiento-p0 · BVT-002 — la abstención llega aquí desde el backend.
 *
 * `ABSTENCION` es un valor nuevo de `decision` que este cálculo nunca había
 * visto: `recuento` la excluía pero `lista` no, así que dos síes y una
 * abstención se leían como «Unanimidad» y el cero de la abstención entraba en
 * la media. Una abstención no vota a favor de nadie.
 */
const abstencion = (): BoardVote => ({ decision: 'ABSTENCION', confidence: null } as BoardVote);

describe('la abstención en el grado de desacuerdo', () => {
    it('dos síes y una abstención NO son unanimidad', () => {
        const g = gradoDeDesacuerdo({
            CTO: voto('SI', 90), CFO: voto('SI', 80), CMO: abstencion(),
        });
        expect(g.etiqueta).toBe('Mayoría con reserva');
        expect(g.nivel).toBe('mayoria');
        expect(g.abstenciones).toBe(1);
    });

    it('la abstención no entra en la media de confianza', () => {
        const g = gradoDeDesacuerdo({
            CTO: voto('SI', 90), CFO: voto('SI', 80), CMO: abstencion(),
        });
        // 170/2, no 170/3: el que se abstiene no aporta un cero.
        expect(g.confianzaMedia).toBe(85);
        expect(g.recuento).toEqual({ SI: 2, NO: 0, CONDICIONAL: 0 });
        expect(g.total).toBe(2);
    });

    it('la unanimidad de verdad sigue siéndolo, y dice su media', () => {
        const g = gradoDeDesacuerdo({
            CTO: voto('SI', 90), CFO: voto('SI', 80), CMO: voto('SI', 70),
        });
        expect(g.etiqueta).toBe('Unanimidad');
        expect(g.abstenciones).toBe(0);
        expect(g.confianzaMedia).toBe(80);
    });

    it('una junta que sólo se abstiene no tiene grado que enseñar', () => {
        const g = gradoDeDesacuerdo({ CTO: abstencion(), CFO: abstencion(), CMO: abstencion() });
        expect(g.nivel).toBe('sin-datos');
        expect(g.etiqueta).toBe('Sin votos');
        expect(g.abstenciones).toBe(3);
    });
});
