import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AgentSelectorModal } from '../../src/components/modals/AgentSelectorModal';
import { useChatStore } from '../../src/store/useChatStore';

// Mock de framer-motion
vi.mock('framer-motion', () => ({
    AnimatePresence: ({ children }: any) => children,
    motion: {
        div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
        form: ({ children, ...props }: any) => <form {...props}>{children}</form>,
        button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
    },
}));

describe('AgentSelectorModal - Comportamiento de UI', () => {
    beforeEach(() => {
        useChatStore.getState().resetState();
    });

    it('no debe renderizar nada si el modal está cerrado', () => {
        const { container } = render(
            <MemoryRouter>
                <AgentSelectorModal />
            </MemoryRouter>
        );
        expect(container.firstChild).toBeNull();
    });

    it('debe listar los agentes core y permitir seleccionar uno para iniciar sesión', async () => {
        const createSessionSpy = vi.spyOn(useChatStore.getState(), 'createNewSession').mockResolvedValue('new-s-123');
        useChatStore.setState({ isAgentModalOpen: true });

        render(
            <MemoryRouter>
                <AgentSelectorModal />
            </MemoryRouter>
        );

        // Verificar que agentes core aparecen
        expect(screen.getByText('Nexus (CTO)')).toBeDefined();
        expect(screen.getByText('Oberon (CEO)')).toBeDefined();

        // Seleccionar Nexus
        fireEvent.click(screen.getByText('Nexus (CTO)').closest('button')!);

        expect(createSessionSpy).toHaveBeenCalledWith('cto-1');
    });

    it('debe abrir el asistente de creación de agente', async () => {
        useChatStore.setState({ isAgentModalOpen: true });

        render(
            <MemoryRouter>
                <AgentSelectorModal />
            </MemoryRouter>
        );

        fireEvent.click(screen.getByText('Crear agente nuevo'));

        // El botón abre el AgentCreationWizard (paso 0: "Elegir método").
        // Desde 1.8 el asistente es un <Modal>, así que su cabecera es el
        // título del diálogo: se comprueba por el nombre accesible del rol
        // `dialog`, que es lo que de verdad oye un lector de pantalla.
        expect(await screen.findByRole('heading', { name: 'Crear agente' })).toBeDefined();
        expect(screen.getAllByRole('dialog').some((d) => d.getAttribute('aria-modal') === 'true')).toBe(true);
        expect(screen.getByText('Crear desde cero')).toBeDefined();
        expect(screen.getByText(/o usa una plantilla/i)).toBeDefined();
    });
});
