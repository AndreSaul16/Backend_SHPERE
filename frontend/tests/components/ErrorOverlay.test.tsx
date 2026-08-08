import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ErrorOverlay } from '../../src/components/common/ErrorOverlay';
import { useChatStore } from '../../src/store/useChatStore';
import { ERRORES_EN_BLANCO } from '../../src/store/chat/errorsSlice';

vi.mock('framer-motion', () => ({
    AnimatePresence: ({ children }: any) => children,
    motion: {
        div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    },
}));

const conFallo = (parcial: Partial<typeof ERRORES_EN_BLANCO>) =>
    useChatStore.setState({ errorStates: { ...ERRORES_EN_BLANCO, ...parcial } });

describe('ErrorOverlay — ningún fallo deja parado', () => {
    beforeEach(() => {
        useChatStore.getState().resetState();
    });

    it('no debe renderizar nada si no hay errores', () => {
        const { container } = render(<ErrorOverlay />);
        expect(container.firstChild).toBeNull();
    });

    it('dice qué pasó y qué se conserva, en cristiano y sin el mensaje interno', () => {
        conFallo({ send_message: 'Error en el flujo de transmisión' });
        render(<ErrorOverlay />);

        expect(screen.getByText('Tu mensaje no ha salido')).toBeInTheDocument();
        expect(screen.getByText(/no se ha cobrado nada/i)).toBeInTheDocument();
        // §11: ni «Error del Sistema» ni el mensaje interno del store.
        expect(screen.queryByText(/Error del Sistema/i)).not.toBeInTheDocument();
        expect(screen.queryByText('Error en el flujo de transmisión')).not.toBeInTheDocument();
    });

    it('siempre se puede cerrar: antes se quedaba fijo para siempre', () => {
        conFallo({ artifact_parser: 'xml roto' });
        render(<ErrorOverlay />);

        fireEvent.click(screen.getByRole('button', { name: /Cerrar aviso/ }));

        expect(screen.queryByTestId('aviso-de-fallo')).not.toBeInTheDocument();
        expect(useChatStore.getState().errorStates.artifact_parser).toBeNull();
    });

    it('el fallo de historial ofrece reintentar y llama al store', async () => {
        const fetchSessions = vi.fn().mockResolvedValue(undefined);
        useChatStore.setState({ fetchSessions });
        conFallo({ fetch_agents: 'No se pudo cargar tu historial de juntas' });
        render(<ErrorOverlay />);

        fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));

        await waitFor(() => expect(fetchSessions).toHaveBeenCalled());
        expect(useChatStore.getState().errorStates.fetch_agents).toBeNull();
    });

    it('con dos fallos vivos manda el más bloqueante', () => {
        conFallo({ fetch_agents: 'lista', create_session: 'junta' });
        render(<ErrorOverlay />);

        expect(screen.getByText('No se ha podido abrir la junta')).toBeInTheDocument();
    });
});
