/**
 * La banda de veredicto: un artefacto nunca se pinta mal en silencio.
 *
 * Una sola banda, en el panel, encima del visor. Hay cinco visores y tres
 * veredictos: repartirlos daría quince sitios donde olvidarse de uno, y el
 * olvido es exactamente la clase de fallo que este cambio arregla.
 *
 * Los tres casos se leen del propio `Artifact` del almacén, no de un prop que
 * alguien tenga que acordarse de pasar.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ArtifactPanel } from '../../src/components/artifacts/ArtifactPanel';
import { useChatStore } from '../../src/store/useChatStore';
import type { Artifact } from '../../src/types/artifact';

vi.mock('../../src/components/artifacts/ArtifactRenderer', () => ({
    ArtifactRenderer: ({ artifact }: { artifact: Artifact }) => (
        <div data-testid="visor">{artifact.content}</div>
    ),
}));

const hacerArtefacto = (extra: Partial<Artifact> = {}): Artifact => ({
    id: 'a1',
    title: 'Documento',
    type: 'code',
    content: 'contenido del documento',
    createdAt: new Date(),
    ...extra,
});

const pintar = (artefacto: Artifact) => {
    useChatStore.setState({ artifacts: [artefacto], activeArtifactId: artefacto.id });
    return render(<ArtifactPanel />);
};

beforeEach(() => {
    useChatStore.getState().resetState();
});

describe('la banda de veredicto', () => {
    it('nombra el tipo declarado cuando SPHERE no lo reconoce', () => {
        pintar(hacerArtefacto({ typeStatus: 'unknown', declaredType: 'markdwon' }));

        const banda = screen.getByTestId('banda-de-veredicto');
        expect(banda).toHaveTextContent(/markdwon/);
        expect(banda).toHaveTextContent(/texto sin formato/i);
    });

    it('avisa del corte por tamaño sin dar el documento por perdido', () => {
        pintar(hacerArtefacto({ truncated: true, truncatedReason: 'size_limit' }));

        expect(screen.getByTestId('banda-de-veredicto')).toHaveTextContent(/256 KB/);
    });

    it('avisa cuando la generación terminó antes de cerrar el documento', () => {
        pintar(hacerArtefacto({ truncated: true, truncatedReason: 'stream_ended' }));

        expect(screen.getByTestId('banda-de-veredicto')).toHaveTextContent(
            /terminó antes de cerrar/i,
        );
    });

    it('avisa cuando el contenido no encaja con el tipo declarado', () => {
        pintar(hacerArtefacto({ type: 'data_table', contentStatus: 'mismatch' }));

        const banda = screen.getByTestId('banda-de-veredicto');
        expect(banda).toHaveTextContent(/no encaja con el tipo declarado/i);
        expect(banda).toHaveTextContent(/tabla/i);
    });

    it('nunca esconde el contenido: enseñarlo mal es el fallo, taparlo sería otro', () => {
        pintar(hacerArtefacto({ typeStatus: 'unknown', declaredType: 'markdwon' }));

        expect(screen.getByTestId('visor')).toHaveTextContent('contenido del documento');
    });

    it('no presenta el aviso como una caída de la aplicación', () => {
        // `alert` interrumpe al lector de pantalla y en pantalla se lee como
        // error de la aplicación. Esto es un aviso sobre un documento, no una
        // caída: `status`.
        pintar(hacerArtefacto({ truncated: true, truncatedReason: 'size_limit' }));

        expect(screen.getByTestId('banda-de-veredicto')).toHaveAttribute('role', 'status');
    });

    it('el aviso de sistema y el del contenido no se confunden', () => {
        // Un `csv` mal formado no puede parecer lo mismo que un corte del
        // sistema: uno habla de lo que escribió el modelo y el otro de lo que
        // hizo SPHERE con el documento.
        pintar(hacerArtefacto({ truncated: true, truncatedReason: 'size_limit' }));
        expect(screen.getByTestId('banda-de-veredicto')).toHaveAttribute('data-tono', 'sistema');

        useChatStore.getState().resetState();
        pintar(hacerArtefacto({ type: 'data_table', contentStatus: 'mismatch' }));
        expect(screen.getAllByTestId('banda-de-veredicto').at(-1)).toHaveAttribute(
            'data-tono',
            'contenido',
        );
    });

    it('un artefacto correcto no lleva banda', () => {
        pintar(hacerArtefacto({ typeStatus: 'ok', contentStatus: 'ok' }));

        expect(screen.queryByTestId('banda-de-veredicto')).toBeNull();
    });

    it('un artefacto sin veredicto ninguno tampoco lleva banda', () => {
        // Es el caso del historial y el de un backend anterior al cambio.
        pintar(hacerArtefacto());

        expect(screen.queryByTestId('banda-de-veredicto')).toBeNull();
    });

    it('un contenido `unchecked` no es un aviso: no se juzga y no se dice nada', () => {
        pintar(hacerArtefacto({ type: 'markdown', contentStatus: 'unchecked' }));

        expect(screen.queryByTestId('banda-de-veredicto')).toBeNull();
    });

    it('sólo hay UNA banda aunque coincidan dos veredictos', () => {
        pintar(hacerArtefacto({
            typeStatus: 'unknown',
            declaredType: 'markdwon',
            truncated: true,
            truncatedReason: 'size_limit',
        }));

        expect(screen.getAllByTestId('banda-de-veredicto')).toHaveLength(1);
    });
});
