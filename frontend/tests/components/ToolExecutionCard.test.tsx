/**
 * TRI-003 y TRI-004 — lo que la tarjeta afirma tiene que coincidir con lo que pasó.
 *
 * Dos mentiras distintas y las dos caras: una acción que solo está esperando un
 * «sí» no puede pintarse ✓ verde (parece hecha) ni ✗ roja con «Reintentar»
 * (parece rota, y el botón gasta crédito reintentando una pregunta). Y en
 * ningún estado debe verse el identificador técnico de la herramienta.
 */
import { render as renderSinRouter, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach } from 'vitest';
import { ToolExecutionCard } from '../../src/components/chat/ToolExecutionCard';
import { useChatStore } from '../../src/store/useChatStore';

// Con remedio `connect` la tarjeta enlaza a Ajustes → Conexiones, y un <Link> necesita
// router. El resto de casos no lo necesita, pero envolver siempre evita que el próximo
// enlace rompa media suite por un motivo que no es el que se está probando.
const render = (ui: ReactElement) => renderSinRouter(<MemoryRouter>{ui}</MemoryRouter>);

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

    it('una herramienta OAuth que falla se nombra en cristiano, no por su identificador', () => {
        // TRI-004: las 7 de GitHub/Slack/Notion no tenían etiqueta, así que la
        // tarjeta caía al identificador crudo y el usuario leía
        // «slack_post_message — falló».
        render(
            <ToolExecutionCard
                toolName="slack_post_message"
                status="failed"
                error="Slack devolvió 401"
            />,
        );

        expect(screen.queryByText(/slack_post_message/)).toBeNull();
        expect(screen.getByText('Publicando en Slack — falló')).toBeInTheDocument();
    });

    // --- TER-004: ningún «Reintentar» sobre lo que no puede funcionar ---
    //
    // Pulsar «Reintentar» envía un mensaje nuevo al agente y GASTA UN CRÉDITO. Ante una
    // credencial que falta, reintentar no puede funcionar jamás: el botón no se
    // deshabilita ni se esconde, no existe.

    it('TER-004: con remedio `connect` no hay «Reintentar», hay enlace a Conexiones', () => {
        render(
            <ToolExecutionCard
                toolName="whatsapp_send_message"
                status="failed"
                error="Conecta WhatsApp para poder enviar mensajes."
                remedio="connect"
            />,
        );

        expect(screen.queryByRole('button', { name: /Reintentar/ })).toBeNull();
        const enlace = screen.getByRole('link', { name: /Conexiones/ });
        expect(enlace).toHaveAttribute('href', '/settings/integrations');
        // Sigue siendo un fallo: la acción no ocurrió.
        expect(screen.getByText('Enviando WhatsApp — falló')).toBeInTheDocument();
        expect(screen.getByText('Conecta WhatsApp para poder enviar mensajes.')).toBeInTheDocument();
    });

    it('TER-004: con remedio `none` no hay ni botón ni enlace, sólo el mensaje', () => {
        render(
            <ToolExecutionCard
                toolName="whatsapp_send_message"
                status="failed"
                error="Ese contacto no está en tu lista. Añádelo en Ajustes → Contactos."
                remedio="none"
            />,
        );

        expect(screen.queryByRole('button', { name: /Reintentar/ })).toBeNull();
        expect(screen.queryByRole('link')).toBeNull();
        expect(screen.getByText('Enviando WhatsApp — falló')).toBeInTheDocument();
        expect(
            screen.getByText('Ese contacto no está en tu lista. Añádelo en Ajustes → Contactos.'),
        ).toBeInTheDocument();
    });

    // --- QA-1: el contacto que no está en la whitelist tiene remedio, y es una pantalla ---
    //
    // Antes viajaba como `none`: el mensaje nombraba «Ajustes → Contactos» y la tarjeta no
    // daba ninguna forma de llegar. Ahora enlaza, igual que hace `connect` con Conexiones.

    it('QA-1: con remedio `whitelist` hay enlace a Contactos y ningún «Reintentar»', () => {
        render(
            <ToolExecutionCard
                toolName="whatsapp_send_message"
                status="failed"
                error="El contacto «Ruben Lima» no está autorizado para enviar WhatsApp."
                remedio="whitelist"
            />,
        );

        const enlace = screen.getByRole('link', { name: /Contactos/ });
        expect(enlace).toHaveAttribute('href', '/settings/contacts');
        // Reintentar gasta un crédito y no puede funcionar hasta que el contacto exista.
        expect(screen.queryByRole('button', { name: /Reintentar/ })).toBeNull();
        // Sigue siendo un fallo: el mensaje no se ha enviado.
        expect(screen.getByText('Enviando WhatsApp — falló')).toBeInTheDocument();
        expect(
            screen.getByText('El contacto «Ruben Lima» no está autorizado para enviar WhatsApp.'),
        ).toBeInTheDocument();
    });

    it('QA-1: el enlace de `whitelist` va a Contactos, no a Conexiones', () => {
        // Los dos remedios enlazan, y a sitios distintos: confundirlos manda al usuario
        // a conectar un servicio que ya está conectado.
        render(
            <ToolExecutionCard
                toolName="whatsapp_send_message"
                status="failed"
                error="El contacto no está autorizado."
                remedio="whitelist"
            />,
        );

        expect(screen.queryByRole('link', { name: /Conexiones/ })).toBeNull();
        expect(screen.getByRole('link')).toHaveAttribute('href', '/settings/contacts');
    });

    it('TER-004: con remedio `retry` el botón sigue exactamente como hoy', () => {
        // Esta prueba DEBE estar en verde desde antes del cambio: es la red que impide
        // que el remedio se lleve por delante el caso bueno.
        render(
            <ToolExecutionCard
                toolName="calendar_delete_event"
                status="failed"
                error="Google no respondió"
                remedio="retry"
            />,
        );

        expect(screen.getByRole('button', { name: /Reintentar/ })).toBeInTheDocument();
        expect(screen.queryByRole('link')).toBeNull();
    });

    it('TER-004: durante el streaming el «Reintentar» de un fallo reintentable sigue deshabilitado', () => {
        useChatStore.setState({ currentSessionId: 's1', streamingSessionIds: ['s1'] });
        render(
            <ToolExecutionCard
                toolName="calendar_delete_event"
                status="failed"
                error="Google no respondió"
                remedio="retry"
            />,
        );

        expect(screen.getByRole('button', { name: /Reintentar/ })).toBeDisabled();
    });
});
