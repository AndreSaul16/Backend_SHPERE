import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ArtifactPanel } from '../../src/components/artifacts/ArtifactPanel';
import { useChatStore } from '../../src/store/useChatStore';

// Mock de framer-motion
vi.mock('framer-motion', () => ({
    useReducedMotion: () => false,
        AnimatePresence: ({ children }: any) => children,
    motion: {
        div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
        span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
    },
}));

describe('ArtifactPanel - Comportamiento de UI', () => {
    beforeEach(() => {
        useChatStore.getState().resetState();
    });

    it('debe mostrar el estado vacío cuando no hay artefactos', () => {
        render(<ArtifactPanel />);
        expect(screen.getByText(/Área de Visualización/i)).toBeDefined();
        expect(screen.getByText(/aparecerán aquí para su inspección/i)).toBeDefined();
    });

    it('debe listar los artefactos y permitir seleccionar uno', () => {
        const mockArtifacts = [
            { id: '1', title: 'Test 1', type: 'code', content: 'c1', agentId: 'a', createdAt: new Date() },
            { id: '2', title: 'Test 2', type: 'markdown', content: 'c2', agentId: 'a', createdAt: new Date() }
        ];

        useChatStore.setState({ artifacts: mockArtifacts as any });

        render(<ArtifactPanel />);

        expect(screen.getByText('Test 1')).toBeDefined();
        expect(screen.getByText('Test 2')).toBeDefined();

        // Hacer clic en el segundo
        fireEvent.click(screen.getByText('Test 2'));

        expect(useChatStore.getState().activeArtifactId).toBe('2');
    });

    it('debe mostrar mensaje de selección si hay artefactos pero ninguno activo', () => {
        useChatStore.setState({
            artifacts: [{ id: '1', title: 'T1', type: 'code', content: 'c1', agentId: 'a', createdAt: new Date() }] as any,
            activeArtifactId: null
        });

        render(<ArtifactPanel />);
        expect(screen.getByText(/SELECCIONA UN OBJETO PARA INSPECCIONAR/i)).toBeDefined();
    });
});
