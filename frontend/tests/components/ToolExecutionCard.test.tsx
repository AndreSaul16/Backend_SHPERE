/**
 * TRI-003 y TRI-004 — lo que la tarjeta afirma tiene que coincidir con lo que pasó.
 *
 * Dos mentiras distintas y las dos caras: una acción que solo está esperando un
 * «sí» no puede pintarse ✓ verde (parece hecha) ni ✗ roja con «Reintentar»
 * (parece rota, y el botón gasta crédito reintentando una pregunta). Y en
 * ningún estado debe verse el identificador técnico de la herramienta.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { ToolExecutionCard } from '../../src/components/chat/ToolExecutionCard';
import { useChatStore } from '../../src/store/useChatStore';

describe('ToolExecutionCard', () => {
    beforeEach(() => {
        useChatStore.getState().resetState();
    });

    it('un fallo se ve como fallo: etiqueta humana, motivo y «Reintentar»', () => {
        render(
            <ToolExecutionCard
                toolName="calendar_delete_event"
                status="failed"
                error="Google no respondió"
            />,
        );

        expect(screen.getByText('Eliminando evento — falló')).toBeInTheDocument();
        expect(screen.getByText('Google no respondió')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Reintentar/ })).toBeInTheDocument();
    });

    it('una confirmación pendiente muestra el resumen de lo que se hará', () => {
        render(
            <ToolExecutionCard
                toolName="whatsapp_send_message"
                status="awaiting_confirmation"
                resumen="Enviar «llego tarde» a +34600111222"
            />,
        );

        expect(screen.getByText('Enviar «llego tarde» a +34600111222')).toBeInTheDocument();
    });

    it('una confirmación pendiente no se pinta como fallo ni ofrece «Reintentar»', () => {
        render(
            <ToolExecutionCard
                toolName="calendar_delete_event"
                status="awaiting_confirmation"
                resumen="Borrar «Comité» del jueves"
            />,
        );

        expect(screen.queryByText(/— falló/)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Reintentar/ })).not.toBeInTheDocument();
    });

    it('una confirmación pendiente tampoco se pinta como éxito', () => {
        // El ✓ verde ante una acción que no ha ocurrido es la otra mentira.
        const { container } = render(
            <ToolExecutionCard
                toolName="calendar_delete_event"
                status="awaiting_confirmation"
                resumen="Borrar «Comité» del jueves"
            />,
        );

        expect(container.querySelector('.text-success')).toBeNull();
        expect(container.querySelector('.text-dissent')).toBeNull();
    });

    it('la tarjeta dice quién espera: la etiqueta humana, no el identificador', () => {
        render(
            <ToolExecutionCard
                toolName="calendar_delete_event"
                status="awaiting_confirmation"
                resumen="Borrar «Comité» del jueves"
            />,
        );

        expect(screen.getByText(/Eliminando evento/)).toBeInTheDocument();
        expect(screen.queryByText(/calendar_delete_event/)).not.toBeInTheDocument();
    });
});
