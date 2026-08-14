/**
 * El Atril — ampliar el documento del panel de artefactos (QA-5).
 *
 * En escritorio el panel abre a 480px con techo de 760px (`MainLayout.tsx`), y
 * tras los paddings a un documento le quedan ~370px de texto: la medida de 60ch
 * de `.doc-prose` no se alcanza nunca y las tablas esconden columnas tras un
 * scroll horizontal. El Atril es la salida: el MISMO documento, a pantalla
 * grande, sobre el primitivo `<Modal>` de §9.4 — de donde salen gratis la
 * trampa de foco, `Escape` y la restauración del foco al disparador.
 *
 * Aquí NO se mockea framer-motion: `tests/setup.ts` ya pone
 * `MotionGlobalConfig.skipAnimations = true`, así que el `<Modal>` real —con su
 * `AnimatePresence` real— se monta y se desmonta en el mismo tick. Mockearlo
 * dejaría sin probar justo el contrato que este cambio da por heredado.
 */
import type { ReactElement } from 'react';
import { act, render as renderSinRouter, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach } from 'vitest';
import { ArtifactPanel } from '../../src/components/artifacts/ArtifactPanel';
import { useChatStore } from '../../src/store/useChatStore';
import type { Artifact } from '../../src/types/artifact';

/* `ActaActions` navega a la página de créditos cuando el envío a Notion se
   queda sin saldo, así que el acta ampliada necesita un Router encima. */
const render = (ui: ReactElement) => renderSinRouter(<MemoryRouter>{ui}</MemoryRouter>);

function hacerArtefacto(parcial: Partial<Artifact> = {}): Artifact {
    return {
        id: '1',
        type: 'markdown',
        title: 'Informe de opciones',
        content: '# Informe\n\nCuerpo del documento.',
        agentId: 'oberon',
        createdAt: new Date('2026-08-14T10:00:00Z'),
        ...parcial,
    };
}

function montarConArtefactoActivo(artifact: Artifact = hacerArtefacto()) {
    useChatStore.setState({ artifacts: [artifact], activeArtifactId: artifact.id });
    return render(<ArtifactPanel />);
}

describe('El Atril — ampliar el documento (§9.15)', () => {
    beforeEach(() => {
        useChatStore.getState().resetState();
    });

    it('ofrece «Ampliar documento» cuando hay un artefacto activo', () => {
        montarConArtefactoActivo();

        expect(screen.getByRole('button', { name: /ampliar documento/i })).toBeInTheDocument();
    });

    it('abre un diálogo modal a tamaño `full` con el título del documento', async () => {
        const user = userEvent.setup();
        montarConArtefactoActivo(hacerArtefacto({ title: 'Informe de opciones' }));

        await user.click(screen.getByRole('button', { name: /ampliar documento/i }));

        const atril = screen.getByRole('dialog');
        expect(atril).toHaveAttribute('aria-modal', 'true');
        // El nombre accesible sale del `aria-labelledby` de §9.4: si el título
        // no llegara al `<h2>`, el diálogo se anunciaría sin nombre.
        expect(atril).toHaveAccessibleName('Informe de opciones');
        expect(within(atril).getByRole('heading', { name: 'Informe de opciones' })).toBeInTheDocument();
        // El Atril existe para ganar ancho: a tamaño `md` no arregla nada.
        expect(atril).toHaveAttribute('data-size', 'full');
    });

    it('cierra con Escape y devuelve el foco al disparador', async () => {
        const user = userEvent.setup();
        montarConArtefactoActivo();

        const disparador = screen.getByRole('button', { name: /ampliar documento/i });
        await user.click(disparador);
        expect(screen.getByRole('dialog')).toBeInTheDocument();

        await user.keyboard('{Escape}');

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(document.activeElement).toBe(disparador);
    });

    it('no ofrece ampliar si hay documentos pero ninguno activo', () => {
        useChatStore.setState({
            artifacts: [hacerArtefacto()],
            activeArtifactId: null,
        });

        render(<ArtifactPanel />);

        expect(screen.queryByRole('button', { name: /ampliar documento/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('se cierra solo si el documento que mostraba desaparece del almacén', async () => {
        const user = userEvent.setup();
        montarConArtefactoActivo();

        await user.click(screen.getByRole('button', { name: /ampliar documento/i }));
        expect(screen.getByRole('dialog')).toBeInTheDocument();

        // Un Atril abierto sobre un documento que ya no existe es una hoja en
        // blanco que atrapa el foco: `open` tiene que mirar al artefacto vivo.
        act(() => {
            useChatStore.setState({ artifacts: [], activeArtifactId: null });
        });

        // `AnimatePresence` retira al que sale en el frame siguiente, incluso
        // con las animaciones desactivadas: se espera a la retirada, no se
        // afirma en el mismo tick.
        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
    });

    it('lleva la banda de veredicto DENTRO del Atril', async () => {
        const user = userEvent.setup();
        montarConArtefactoActivo(
            hacerArtefacto({ truncated: true, truncatedReason: 'size_limit' }),
        );

        await user.click(screen.getByRole('button', { name: /ampliar documento/i }));

        const atril = screen.getByRole('dialog');
        expect(within(atril).getByText(/cortado a los 256 KB/i)).toBeInTheDocument();
    });

    it('lleva las acciones del acta DENTRO del Atril cuando el documento es un acta', async () => {
        const user = userEvent.setup();
        montarConArtefactoActivo(
            hacerArtefacto({ title: 'Acta de la junta', content: '# Acta\n\nAcuerdos.' }),
        );

        await user.click(screen.getByRole('button', { name: /ampliar documento/i }));

        const atril = screen.getByRole('dialog');
        expect(within(atril).getByRole('button', { name: /presentar/i })).toBeInTheDocument();
        expect(within(atril).getByRole('button', { name: /enviar a notion/i })).toBeInTheDocument();
    });
});
