import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MemoryRouter } from 'react-router-dom';
import { ToolExecutionCard } from '../../src/components/chat/ToolExecutionCard';
import { MessageBubble } from '../../src/components/chat/MessageBubble';
import { useChatStore } from '../../src/store/useChatStore';
import type { Message } from '../../src/types';

/**
 * Viveza-1 · §7.4 — «No se anima, nunca: alto (`height`) ni ancho».
 *
 * Cuatro divulgaciones animaban `height: 0 → 'auto'`, que es justo lo que la
 * sección prohíbe por su nombre: cada fotograma dispara layout de todo lo que
 * hay debajo, y en el transcript «lo que hay debajo» es el resto del debate.
 * §7.5 firma el sustituto desde el principio: `grid-template-rows 0fr→1fr`,
 * que sí compone.
 *
 * Los cuatro sitios (referencias del triage):
 *   · `MessageBubble.tsx:148`        — el bloque de razonamiento
 *   · `ChatPanel.tsx:883`            — la barra de búsqueda
 *   · `KnowledgeBasePanel.tsx:417`   — la fila de subida en curso
 *   · `ToolExecutionCard.tsx:194`    — el resultado de la herramienta
 *
 * Este fichero defiende las DOS mitades: que la prohibición se cumple (guardia
 * mecánica sobre el fuente, que es donde vive la regla) y que el comportamiento
 * que esas divulgaciones tenían sigue intacto — ninguno de los cuatro tenía
 * test de expandir/colapsar antes de este ciclo.
 */

const FUENTES = [
    'src/components/chat/MessageBubble.tsx',
    'src/components/chat/ChatPanel.tsx',
    'src/components/agents/KnowledgeBasePanel.tsx',
    'src/components/chat/ToolExecutionCard.tsx',
] as const;

describe('§7.4 — ninguna divulgación anima el alto', () => {
    it.each(FUENTES)('%s no anima `height` a `auto`', (ruta) => {
        const fuente = readFileSync(resolve(__dirname, '../..', ruta), 'utf8');

        // `height: 'auto'` en un `animate` es la firma exacta de la infracción.
        expect(fuente).not.toMatch(/height:\s*['"]auto['"]/);
    });

    it.each(FUENTES)('%s usa el acordeón de §7.5 (`grid-template-rows`)', (ruta) => {
        const fuente = readFileSync(resolve(__dirname, '../..', ruta), 'utf8');

        // El sustituto contratado, no cualquier otro: 0fr→1fr.
        expect(fuente).toMatch(/gridTemplateRows/);
        expect(fuente).toMatch(/['"]0fr['"]/);
        expect(fuente).toMatch(/['"]1fr['"]/);
    });
});

describe('§7.5 — el resultado de una herramienta sigue desplegando', () => {
    beforeEach(() => {
        useChatStore.getState().resetState();
    });

    it('despliega y repliega el resultado, y lo anuncia con aria-expanded', async () => {
        const user = userEvent.setup();
        render(
            <MemoryRouter>
                <ToolExecutionCard
                    toolName="calendar_list_events"
                    status="success"
                    result="Comité de dirección — jueves 10:00"
                />
            </MemoryRouter>,
        );

        const disparador = screen.getByRole('button', { expanded: false });
        expect(screen.queryByText('Comité de dirección — jueves 10:00')).toBeNull();

        await user.click(disparador);

        expect(screen.getByText('Comité de dirección — jueves 10:00')).toBeInTheDocument();
        expect(screen.getByRole('button', { expanded: true })).toBeInTheDocument();

        await user.click(disparador);

        // `AnimatePresence` retira al saliente en el frame siguiente.
        await waitFor(() =>
            expect(screen.queryByText('Comité de dirección — jueves 10:00')).toBeNull(),
        );
        expect(screen.getByRole('button', { expanded: false })).toBeInTheDocument();
    });
});

describe('§7.5 — el razonamiento del turno sigue desplegando', () => {
    const conRazonamiento: Message = {
        id: 'm-thinking',
        role: 'assistant',
        content: 'La propuesta se sostiene.',
        thinking: 'Primero he mirado la caja: aguanta dos trimestres.',
        timestamp: new Date('2026-08-14T10:00:00Z'),
        agentId: 'cfo-1',
    };

    it('el bloque de razonamiento se abre y se cierra desde su disparador', async () => {
        const user = userEvent.setup();
        render(<MessageBubble message={conRazonamiento} />);

        // Debate cerrado (no está streameando): arranca colapsado.
        const disparador = screen.getByRole('button', { name: /Razonamiento/ });
        expect(screen.queryByText(/aguanta dos trimestres/)).toBeNull();

        await user.click(disparador);

        expect(screen.getByText(/aguanta dos trimestres/)).toBeInTheDocument();

        await user.click(disparador);

        await waitFor(() => expect(screen.queryByText(/aguanta dos trimestres/)).toBeNull());
    });
});
