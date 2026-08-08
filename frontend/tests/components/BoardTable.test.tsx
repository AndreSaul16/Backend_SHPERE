/**
 * La Mesa / el Palco (§8.1) y la Aguja de Confianza (§8.2).
 *
 * Comportamiento, no píxeles. Lo que se comprueba aquí es lo que el contrato
 * promete y la revisión visual no encontró: que la junta entera se ve a la vez,
 * que el asiento en foco se puede cambiar sin ratón, que la medida existe para
 * quien no la ve, y que la aguja marca el umbral de 70.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BoardTable } from '../../src/components/chat/BoardTable';
import { ConfidenceNeedle, UMBRAL_OXBLOOD } from '../../src/components/chat/ConfidenceNeedle';
import type { BoardSessionState } from '../../src/store/useChatStore';
import type { Agent } from '../../src/types';

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
    { id: 'ceo-1', name: 'Oberon (CEO)', role: 'CEO', avatar: 'O', description: '', color: '', hexColor: '#B290EC', isOnline: true },
    { id: 'cto-1', name: 'Nexus (CTO)', role: 'CTO', avatar: 'N', description: '', color: '', hexColor: '#00BFB0', isOnline: true },
    { id: 'cfo-1', name: 'Ledger (CFO)', role: 'CFO', avatar: 'L', description: '', color: '', hexColor: '#7BA2F9', isOnline: true },
    { id: 'cmo-1', name: 'Vortex (CMO)', role: 'CMO', avatar: 'V', description: '', color: '', hexColor: '#DF80B8', isOnline: true },
];

const mesa = (o: Partial<BoardSessionState> = {}): BoardSessionState => ({
    active: true,
    phase: 'analysis',
    participants: ['CTO', 'CFO', 'CMO'],
    statusByRole: { CEO: 'done', CTO: 'speaking', CFO: 'done', CMO: 'idle' },
    votes: {
        CTO: { decision: 'SI', confidence: 78 },
        CFO: { decision: 'NO', confidence: 91 },
    },
    tally: { SI: 1, NO: 1 },
    unanimous: false,
    earlyExit: false,
    cost: 5,
    devil: false,
    lastIntervention: null,
    ...o,
});

describe('§8.1 El Palco — la junta entera a la vista', () => {
    it('pinta un asiento por director, todos a la vez', () => {
        render(<BoardTable board={mesa()} agents={AGENTS} />);
        // CEO + los tres participantes: «una junta donde no ves a todos no es
        // una junta».
        expect(screen.getAllByRole('tab')).toHaveLength(4);
    });

    it('el Abogado del Diablo se sienta sólo cuando la junta lo lleva', () => {
        const { rerender } = render(<BoardTable board={mesa()} agents={AGENTS} />);
        expect(screen.getAllByRole('tab')).toHaveLength(4);
        rerender(<BoardTable board={mesa({ devil: true })} agents={AGENTS} />);
        expect(screen.getAllByRole('tab')).toHaveLength(5);
    });

    it('por defecto el foco sigue a quien habla', () => {
        render(<BoardTable board={mesa()} agents={AGENTS} />);
        const seleccionado = screen.getAllByRole('tab').find((t) => t.getAttribute('aria-selected') === 'true');
        expect(seleccionado?.dataset.asiento).toBe('CTO');
        // Y la placa de quien habla se marca además con aria-current, que es lo
        // que §8.1 exige para movimiento reducido: la información no depende
        // del alzado de 2px.
        expect(seleccionado).toHaveAttribute('aria-current', 'true');
    });

    it('el asiento en foco se cambia con el teclado y se puede devolver a la sala', async () => {
        const user = userEvent.setup();
        render(<BoardTable board={mesa()} agents={AGENTS} />);

        const tabs = screen.getAllByRole('tab');
        const activo = tabs.find((t) => t.getAttribute('aria-selected') === 'true')!;
        activo.focus();

        await user.keyboard('{ArrowRight}');
        expect(
            screen.getAllByRole('tab').find((t) => t.getAttribute('aria-selected') === 'true')?.dataset.asiento,
        ).toBe('CFO');

        await user.keyboard('{Home}');
        expect(
            screen.getAllByRole('tab').find((t) => t.getAttribute('aria-selected') === 'true')?.dataset.asiento,
        ).toBe('CEO');

        // Fijado a mano: aparece la salida al automático.
        const volver = screen.getByRole('button', { name: /seguir la sala/i });
        await user.click(volver);
        expect(
            screen.getAllByRole('tab').find((t) => t.getAttribute('aria-selected') === 'true')?.dataset.asiento,
        ).toBe('CTO');
    });

    it('el asiento en foco es el panel de su placa y cita su última intervención', () => {
        render(
            <BoardTable
                board={mesa()}
                agents={AGENTS}
                intervencionPorRol={{ CTO: 'La migración cuesta dos trimestres.' }}
            />,
        );
        const panel = screen.getByRole('tabpanel');
        expect(panel).toHaveAttribute('aria-labelledby', 'asiento-placa-CTO');
        expect(within(panel).getByText(/La migración cuesta dos trimestres/)).toBeInTheDocument();
        expect(within(panel).getByText('Nexus (CTO)')).toBeInTheDocument();
    });

    it('la confianza viaja en el nombre accesible de la placa, que ARIA sí anuncia', () => {
        render(<BoardTable board={mesa()} agents={AGENTS} />);
        // Dentro de un botón los descendientes son presentacionales: si la
        // medida sólo estuviera en el `meter` de la placa, no la leería nadie.
        expect(screen.getByRole('tab', { name: /Ledger.*confianza 91 de 100/i })).toBeInTheDocument();
    });
});

describe('§8.2 La Aguja de Confianza', () => {
    it('es una medida anunciada, no un chip: role="meter" con su valor', () => {
        render(<ConfidenceNeedle valor={91} etiqueta="Ledger" />);
        const medida = screen.getByRole('meter');
        expect(medida).toHaveAttribute('aria-valuenow', '91');
        expect(medida).toHaveAttribute('aria-valuemin', '0');
        expect(medida).toHaveAttribute('aria-valuemax', '100');
        expect(medida).toHaveAccessibleName('Confianza de Ledger');
    });

    it('el asiento en foco expone la medida del voto', () => {
        render(<BoardTable board={mesa()} agents={AGENTS} />);
        expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '78');
    });

    it('recorta al rango: un valor imposible no rompe el dibujo ni la medida', () => {
        const { rerender } = render(<ConfidenceNeedle valor={140} etiqueta="X" />);
        expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '100');
        rerender(<ConfidenceNeedle valor={-20} etiqueta="X" />);
        expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '0');
    });

    it('pasado el 70 la cifra se tiñe de oxblood, y por debajo no', () => {
        const { container, rerender } = render(
            <ConfidenceNeedle valor={UMBRAL_OXBLOOD + 1} etiqueta="X" mostrarCifra />,
        );
        expect(container.querySelector('.text-dissent')).not.toBeNull();
        rerender(<ConfidenceNeedle valor={UMBRAL_OXBLOOD} etiqueta="X" mostrarCifra />);
        expect(container.querySelector('.text-dissent')).toBeNull();
    });

    it('dentro de un botón va muda, porque ARIA no la anunciaría', () => {
        render(<ConfidenceNeedle valor={64} etiqueta="Vortex" decorativa />);
        expect(screen.queryByRole('meter')).toBeNull();
    });
});
