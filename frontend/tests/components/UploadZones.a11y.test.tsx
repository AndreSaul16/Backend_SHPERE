/**
 * D14 (tarea 1.10) — las dos zonas de subida se operan con teclado.
 *
 * DESIGN §12.4 lo enumera como uno de los cuatro caminos rotos: «hoy no se
 * puede subir un documento (las dos zonas de arrastre son `<div onClick>` con
 * el `<input type=file>` en `hidden`)».
 *
 * Estos tests prueban el COMPORTAMIENTO, no el marcado: que el disparador esté
 * en el orden de tabulación, que Enter abra el selector de ficheros, y que el
 * input no esté en `display:none` — que es lo que lo saca del árbol de
 * accesibilidad y lo que hace que algunos navegadores se nieguen a abrir el
 * selector. Un test que sólo mirase `toBeInTheDocument()` pasaría con el bug
 * puesto.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../setup';
import { KnowledgeBasePanel } from '../../src/components/agents/KnowledgeBasePanel';
import { AgentCreationWizard } from '../../src/components/modals/AgentCreationWizard';

vi.mock('firebase/auth', () => ({
    getAuth: vi.fn(() => ({
        currentUser: {
            getIdToken: vi.fn(() => Promise.resolve('mock-token')),
        },
    })),
}));

const AGENT_ID = 'cto-1';
const LIST_URL = `http://localhost:8000/api/v1/agents/${AGENT_ID}/documents`;

/**
 * jsdom no implementa el selector de ficheros, así que `input.click()` es un
 * no-op silencioso. Espiarlo es la única forma de comprobar que el disparador
 * llega hasta el input: es exactamente lo que el `<div onClick>` no hacía por
 * teclado.
 */
function spyOnFilePicker() {
    return vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
}

describe('D14 — zona de subida de KnowledgeBasePanel', () => {
    let pickerClick: ReturnType<typeof spyOnFilePicker>;

    beforeEach(() => {
        server.use(http.get(LIST_URL, () => HttpResponse.json({ documents: [], total_count: 0 })));
        pickerClick = spyOnFilePicker();
    });

    afterEach(() => {
        pickerClick.mockRestore();
    });

    it('el disparador es un botón alcanzable con Tab', async () => {
        const user = userEvent.setup();
        render(<KnowledgeBasePanel agentId={AGENT_ID} />);

        const trigger = await screen.findByRole('button', { name: /subir documentos/i });

        // Recorrer el orden de tabulación hasta dar con él. Si el disparador
        // fuese un <div> —como antes— jamás recibiría el foco y esto agotaría
        // el bucle.
        let reached = false;
        for (let i = 0; i < 30 && !reached; i++) {
            await user.tab();
            if (document.activeElement === trigger) reached = true;
        }
        expect(reached).toBe(true);
    });

    it('Enter sobre el disparador abre el selector de ficheros', async () => {
        const user = userEvent.setup();
        render(<KnowledgeBasePanel agentId={AGENT_ID} />);

        const trigger = await screen.findByRole('button', { name: /subir documentos/i });
        trigger.focus();
        await user.keyboard('{Enter}');

        await waitFor(() => expect(pickerClick).toHaveBeenCalled());
    });

    it('el input de fichero está en el árbol de accesibilidad, no en display:none', async () => {
        render(<KnowledgeBasePanel agentId={AGENT_ID} />);

        const input = await screen.findByLabelText(/subir documentos a la base de conocimiento/i);
        expect(input).toHaveAttribute('type', 'file');
        // `hidden` de Tailwind es `display:none`: saca el input del árbol de
        // accesibilidad. `sr-only` lo mantiene renderizado y anunciable.
        expect(input).not.toHaveClass('hidden');
        expect(input).toHaveClass('sr-only');
    });

    it('conserva arrastrar y soltar como atajo, sobre el propio disparador', async () => {
        render(<KnowledgeBasePanel agentId={AGENT_ID} />);

        const trigger = await screen.findByRole('button', { name: /subir documentos/i });
        // El atajo de ratón sigue existiendo y vive en el MISMO elemento que el
        // camino de teclado: arrastrar por encima cambia el rótulo.
        fireEvent.dragOver(trigger);
        expect(await screen.findByText(/suelta los archivos aquí/i)).toBeInTheDocument();

        fireEvent.dragLeave(trigger);
        expect(await screen.findByText(/también puedes arrastrarlos aquí/i)).toBeInTheDocument();
    });
});

describe('D14 — zona de subida de AgentCreationWizard', () => {
    let pickerClick: ReturnType<typeof spyOnFilePicker>;

    beforeEach(() => {
        pickerClick = spyOnFilePicker();
    });

    afterEach(() => {
        pickerClick.mockRestore();
    });

    /** Lleva el asistente hasta el paso 3, «Conocimiento». */
    async function goToKnowledgeStep(user: ReturnType<typeof userEvent.setup>) {
        render(<AgentCreationWizard isOpen onClose={() => {}} onAgentCreated={() => {}} />);

        await user.click(await screen.findByRole('button', { name: /desde cero/i }));

        const name = await screen.findByLabelText(/nombre/i);
        await user.type(name, 'Auditor');
        const prompt = await screen.findByLabelText(/instrucciones|system prompt|personalidad/i);
        await user.type(prompt, 'Audita contratos.');

        await user.click(screen.getByRole('button', { name: /siguiente/i }));
        return await screen.findByRole('button', { name: /adjuntar documentos/i });
    }

    it('el disparador es un botón y Enter abre el selector de ficheros', async () => {
        const user = userEvent.setup();
        const trigger = await goToKnowledgeStep(user);

        trigger.focus();
        expect(document.activeElement).toBe(trigger);

        await user.keyboard('{Enter}');
        await waitFor(() => expect(pickerClick).toHaveBeenCalled());
    });

    it('el input de fichero va en sr-only, no en display:none', async () => {
        const user = userEvent.setup();
        await goToKnowledgeStep(user);

        const input = screen.getByLabelText(/adjuntar documentos a la base de conocimiento del agente/i);
        expect(input).toHaveAttribute('type', 'file');
        expect(input).not.toHaveClass('hidden');
        expect(input).toHaveClass('sr-only');
    });
});
