import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MainLayout } from '../../src/components/layout/MainLayout';
import { ArtifactPanel } from '../../src/components/artifacts/ArtifactPanel';
import { useChatStore } from '../../src/store/useChatStore';

/**
 * F3 (P0) — el acta no puede salir clipada a media palabra en escritorio.
 *
 * El panel abría en 450px y su carril de pestañas se llevaba 224px fijos
 * (`w-16 sm:w-56`), así que a la hoja le quedaban ~215px de los 1440 de
 * pantalla — menos el relleno, ~119px de columna — y «Junta Directiva» se
 * pintaba como «Junt» / «Direc», cortado por el borde del panel.
 *
 * Dos causas, dos comprobaciones: el ancho por defecto (§4.2
 * `--panel-artifact-*`) y el carril, que pasa a ser una tira horizontal (§9.8)
 * y devuelve el ancho entero a la hoja. Contra el código anterior este archivo
 * falla: `aria-valuenow` valía 450 y no existía ningún `role="tablist"`.
 */

vi.mock('framer-motion', () => ({
    AnimatePresence: ({ children }: any) => children,
    motion: {
        div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
        span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
    },
}));

const artefactos = [
    { id: 'a1', title: 'Acta de la Junta', type: 'markdown', content: '# Acta', agentId: 'ceo-1', createdAt: new Date() },
    { id: 'a2', title: 'Flujo de la junta', type: 'mermaid', content: 'graph TD;', agentId: 'ceo-1', createdAt: new Date() },
    { id: 'a3', title: 'Aislamiento por tenant', type: 'code', content: 'print(1)', agentId: 'cto-1', createdAt: new Date() },
];

describe('F3 — el panel de artefactos deja sitio al acta', () => {
    beforeEach(() => {
        useChatStore.getState().resetState();
    });

    it('el panel abre en el ancho del contrato (§4.2), no en 450px', () => {
        useChatStore.setState({ isArtifactPanelOpen: true });

        render(<MainLayout sidebar={<div />} chat={<div />} artifactPanel={<div />} />);

        const tirador = screen.getByRole('separator', { name: /ancho del panel/i });
        expect(tirador).toHaveAttribute('aria-valuenow', '480');
        expect(tirador).toHaveAttribute('aria-valuemin', '380');
        expect(tirador).toHaveAttribute('aria-valuemax', '760');
    });

    it('las pestañas son una tira horizontal, no una columna fija de 224px', () => {
        useChatStore.setState({ artifacts: artefactos as any, activeArtifactId: 'a1' });

        render(<ArtifactPanel />);

        const tablist = screen.getByRole('tablist', { name: /artefactos/i });
        expect(tablist).toHaveAttribute('aria-orientation', 'horizontal');
        // Ninguna clase de carril: el ancho del panel es para el documento.
        expect(tablist.className).not.toMatch(/\bw-(16|56)\b/);
        expect(screen.getAllByRole('tab')).toHaveLength(3);
    });

    it('la pestaña activa se anuncia y sólo ella está en el orden de tabulación (§9.8)', () => {
        useChatStore.setState({ artifacts: artefactos as any, activeArtifactId: 'a1' });

        render(<ArtifactPanel />);

        const [primera, segunda] = screen.getAllByRole('tab');
        expect(primera).toHaveAttribute('aria-selected', 'true');
        expect(primera).toHaveAttribute('tabindex', '0');
        expect(segunda).toHaveAttribute('aria-selected', 'false');
        expect(segunda).toHaveAttribute('tabindex', '-1');
        expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'artifact-tab-a1');
    });

    it('las flechas mueven entre pestañas y Home/End van a los extremos', () => {
        useChatStore.setState({ artifacts: artefactos as any, activeArtifactId: 'a1' });

        render(<ArtifactPanel />);
        const tablist = screen.getByRole('tablist', { name: /artefactos/i });

        fireEvent.keyDown(tablist, { key: 'ArrowRight' });
        expect(useChatStore.getState().activeArtifactId).toBe('a2');

        fireEvent.keyDown(tablist, { key: 'End' });
        expect(useChatStore.getState().activeArtifactId).toBe('a3');

        fireEvent.keyDown(tablist, { key: 'Home' });
        expect(useChatStore.getState().activeArtifactId).toBe('a1');

        // Circular: desde la primera, ← lleva a la última.
        fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
        expect(useChatStore.getState().activeArtifactId).toBe('a3');
    });
});
