/**
 * D41 — caracterización de `AgentCreationWizard` ANTES del troceo.
 *
 * El asistente eran 1458 líneas con 18 `useState` y un borrado a mano de 14
 * setters, y de todo eso sólo estaba cubierta la zona de subida (D14, en
 * `UploadZones.a11y.test.tsx`). Estos tests fijan el comportamiento ACTUAL —lo
 * que hace, no lo que debería hacer— para que el troceo sea reversible: si uno
 * se pone rojo, el reparto ha cambiado la aplicación y hay que replantearlo.
 *
 * Dos de ellos fijan BUGS a propósito, y lo dicen en su nombre. Arreglarlos
 * dentro de un refactor estructural haría imposible saber qué rompió qué.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../setup';
import { AgentCreationWizard } from '../../src/components/modals/AgentCreationWizard';
import { AGENT_HEX } from '../../src/store/useChatStore';
import { MODELO_POR_DEFECTO } from '../../src/lib/modelos';

vi.mock('firebase/auth', () => ({
    getAuth: vi.fn(() => ({
        currentUser: { getIdToken: vi.fn(() => Promise.resolve('mock-token')) },
    })),
}));

const API = 'http://localhost:8000/api/v1';
const PLANTILLAS_URL = `${API}/agents/templates`;
const CREAR_URL = `${API}/agents/`;

const PLANTILLAS = [
    {
        template_id: 't-legal',
        name: 'Abogado Mercantil',
        category: 'legal',
        description: 'Revisa contratos y detecta cláusulas de riesgo',
        icon: 'scale',
        system_prompt: 'Eres un abogado mercantil.',
        suggested_files: ['contrato-marco.pdf', 'anexo.pdf'],
        default_temperature: 0.3,
        default_model: 'deepseek-v4-flash',
        tags: ['contratos', 'riesgo', 'clausulas', 'cuarta'],
    },
    {
        template_id: 't-tech',
        name: 'Revisor de Código',
        category: 'tech',
        description: 'Audita pull requests',
        icon: 'cpu',
        system_prompt: 'Eres un ingeniero senior.',
        suggested_files: [],
        default_temperature: 0.9,
        default_model: 'deepseek-v4-pro',
        tags: [],
    },
];

function conPlantillas() {
    server.use(http.get(PLANTILLAS_URL, () => HttpResponse.json(PLANTILLAS)));
}

interface Espias {
    onClose: ReturnType<typeof vi.fn>;
    onAgentCreated: ReturnType<typeof vi.fn>;
}

function montar(espias: Partial<Espias> = {}) {
    const onClose = espias.onClose ?? vi.fn();
    const onAgentCreated = espias.onAgentCreated ?? vi.fn();
    const utils = render(
        <AgentCreationWizard isOpen onClose={onClose} onAgentCreated={onAgentCreated} />,
    );
    return { ...utils, onClose, onAgentCreated };
}

/** Rellena el paso «Configurar» con lo mínimo para poder avanzar. */
async function rellenarMinimo(user: ReturnType<typeof userEvent.setup>) {
    await user.type(await screen.findByLabelText(/nombre del agente/i), 'Auditor');
    fireEvent.change(screen.getByLabelText(/system prompt/i), {
        target: { value: 'Audita contratos.' },
    });
}

/** Desde cero → Configurar → Conocimiento. */
async function hastaConocimiento(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: /crear desde cero/i }));
    await rellenarMinimo(user);
    await user.click(screen.getByRole('button', { name: /siguiente/i }));
    return screen.findByRole('button', { name: /adjuntar documentos/i });
}

describe('D41 — paso 0: método y catálogo de plantillas', () => {
    it('pide las plantillas al abrirse y las pinta con su nombre, descripción y 3 etiquetas', async () => {
        conPlantillas();
        montar();

        expect(await screen.findByRole('button', { name: /Abogado Mercantil/ })).toBeInTheDocument();
        expect(screen.getByText(/Revisa contratos y detecta/)).toBeInTheDocument();
        // `tags.slice(0, 3)`: la cuarta no se pinta.
        expect(screen.getByText('contratos')).toBeInTheDocument();
        expect(screen.getByText('clausulas')).toBeInTheDocument();
        expect(screen.queryByText('cuarta')).not.toBeInTheDocument();
    });

    it('sin plantillas, invita a crear desde cero', async () => {
        montar(); // el handler por defecto devuelve []
        expect(await screen.findByText(/No hay plantillas disponibles/i)).toBeInTheDocument();
    });

    it('si el catálogo falla, pinta «estado + texto» del error', async () => {
        server.use(
            http.get(PLANTILLAS_URL, () =>
                HttpResponse.json({}, { status: 503, statusText: 'Caido' }),
            ),
        );
        montar();
        expect(await screen.findByText('503 Caido')).toBeInTheDocument();
    });

    it('el filtro de categoría acota la rejilla y «Todas» la devuelve entera', async () => {
        conPlantillas();
        const user = userEvent.setup();
        montar();

        await screen.findByRole('button', { name: /Abogado Mercantil/ });
        await user.click(screen.getByRole('button', { name: 'Tecnologia' }));

        expect(screen.queryByRole('button', { name: /Abogado Mercantil/ })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Revisor de Código/ })).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Todas' }));
        expect(screen.getByRole('button', { name: /Abogado Mercantil/ })).toBeInTheDocument();
    });

    it('elegir plantilla rellena el formulario, marca su modelo y salta a «Configurar»', async () => {
        conPlantillas();
        const user = userEvent.setup();
        montar();

        await user.click(await screen.findByRole('button', { name: /Abogado Mercantil/ }));

        expect(await screen.findByLabelText(/nombre del agente/i)).toHaveValue('Abogado Mercantil');
        expect(screen.getByLabelText(/descripción breve/i)).toHaveValue(
            'Revisa contratos y detecta cláusulas de riesgo',
        );
        expect(screen.getByLabelText(/system prompt/i)).toHaveValue('Eres un abogado mercantil.');
        expect(screen.getByLabelText(/temperatura/i)).toHaveValue('0.3');
        expect(screen.getByRole('button', { name: /DeepSeek V4 Flash/ })).toHaveAttribute(
            'aria-pressed',
            'true',
        );
        expect(screen.getByText(/Pre-rellenado por plantilla/i)).toBeInTheDocument();
        expect(screen.getByText(/Paso 2 de 4/)).toBeInTheDocument();
    });

    it('el foco inicial cae en el primer paso de la barra, no en «Cerrar»', async () => {
        montar();
        const primero = await screen.findByRole('button', { name: 'Metodo' });
        await waitFor(() => expect(document.activeElement).toBe(primero));
    });
});

describe('D41 — navegación entre pasos', () => {
    it('«Siguiente» sólo se habilita con nombre Y system prompt', async () => {
        const user = userEvent.setup();
        montar();

        await user.click(await screen.findByRole('button', { name: /crear desde cero/i }));
        const siguiente = screen.getByRole('button', { name: /siguiente/i });
        expect(siguiente).toBeDisabled();

        await user.type(await screen.findByLabelText(/nombre del agente/i), 'Auditor');
        expect(siguiente).toBeDisabled();

        fireEvent.change(screen.getByLabelText(/system prompt/i), { target: { value: '  ' } });
        expect(siguiente).toBeDisabled(); // sólo espacios no cuenta

        fireEvent.change(screen.getByLabelText(/system prompt/i), { target: { value: 'Audita.' } });
        expect(siguiente).toBeEnabled();
    });

    it('«Atrás» conserva lo escrito', async () => {
        const user = userEvent.setup();
        montar();
        await hastaConocimiento(user);

        await user.click(screen.getByRole('button', { name: /atrás/i }));

        expect(await screen.findByLabelText(/nombre del agente/i)).toHaveValue('Auditor');
        expect(screen.getByLabelText(/system prompt/i)).toHaveValue('Audita contratos.');
    });

    it('la barra deja volver a un paso ya hecho y bloquea los futuros', async () => {
        const user = userEvent.setup();
        montar();
        await user.click(await screen.findByRole('button', { name: /crear desde cero/i }));

        expect(screen.getByRole('button', { name: 'Revisar' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Configurar' })).toBeEnabled();

        await user.click(screen.getByRole('button', { name: 'Metodo' }));
        expect(await screen.findByRole('button', { name: /crear desde cero/i })).toBeInTheDocument();
    });

    it('en el paso 0 el botón secundario es «Cancelar» y cierra', async () => {
        const user = userEvent.setup();
        const { onClose } = montar();

        await user.click(await screen.findByRole('button', { name: /cancelar/i }));
        expect(onClose).toHaveBeenCalled();
    });
});

describe('D41 — paso 2: base de conocimiento', () => {
    it('lista los adjuntos con su tamaño, deja quitarlos y sólo ofrece «Saltar» si no hay ninguno', async () => {
        const user = userEvent.setup();
        const { container } = montar();
        await hastaConocimiento(user);

        expect(screen.getByRole('button', { name: /saltar por ahora/i })).toBeInTheDocument();

        const input = container.querySelector('input[type="file"]') as HTMLInputElement;
        const fichero = new File(['x'.repeat(2048)], 'contrato.pdf', { type: 'application/pdf' });
        fireEvent.change(input, { target: { files: [fichero] } });

        expect(await screen.findByText('contrato.pdf')).toBeInTheDocument();
        expect(screen.getByText('2.0 KB')).toBeInTheDocument();
        expect(screen.getByText('Archivos (1)')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /saltar por ahora/i })).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /Quitar contrato\.pdf de la lista/i }));
        expect(screen.queryByText('contrato.pdf')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /saltar por ahora/i })).toBeInTheDocument();
    });

    it('«Saltar por ahora» avanza a «Revisar»', async () => {
        const user = userEvent.setup();
        montar();
        await hastaConocimiento(user);

        await user.click(screen.getByRole('button', { name: /saltar por ahora/i }));
        expect(await screen.findByText(/Paso 4 de 4/)).toBeInTheDocument();
    });

    it('la plantilla elegida sugiere sus ficheros en este paso', async () => {
        conPlantillas();
        const user = userEvent.setup();
        montar();

        await user.click(await screen.findByRole('button', { name: /Abogado Mercantil/ }));
        await user.click(await screen.findByRole('button', { name: /siguiente/i }));

        expect(await screen.findByText(/Archivos sugeridos por la plantilla/i)).toBeInTheDocument();
        expect(screen.getByText('contrato-marco.pdf')).toBeInTheDocument();
    });
});

describe('D41 — paso 3: revisión', () => {
    it('resume modelo, temperatura, color y documentos, y recorta el prompt a 500 caracteres', async () => {
        const user = userEvent.setup();
        montar();

        await user.click(await screen.findByRole('button', { name: /crear desde cero/i }));
        await user.type(await screen.findByLabelText(/nombre del agente/i), 'Auditor');
        fireEvent.change(screen.getByLabelText(/system prompt/i), {
            target: { value: 'A'.repeat(600) },
        });
        fireEvent.change(screen.getByLabelText(/temperatura/i), { target: { value: '1.4' } });
        await user.click(screen.getByRole('button', { name: /siguiente/i }));
        await user.click(await screen.findByRole('button', { name: /siguiente/i }));

        expect(await screen.findByText(/Paso 4 de 4/)).toBeInTheDocument();
        expect(screen.getByText('1.4')).toBeInTheDocument();
        expect(screen.getByText('Ninguno')).toBeInTheDocument();
        expect(screen.getByText(AGENT_HEX.custom)).toBeInTheDocument();
        expect(screen.getByText('A'.repeat(500) + '...')).toBeInTheDocument();
    });
});

describe('D41 — envío', () => {
    let cuerpo: Record<string, unknown> | null;

    beforeEach(() => {
        cuerpo = null;
    });

    function conCreacionOk() {
        server.use(
            http.post(CREAR_URL, async ({ request }) => {
                cuerpo = (await request.json()) as Record<string, unknown>;
                return HttpResponse.json({
                    agent_id: 'nuevo-1',
                    ...cuerpo,
                });
            }),
        );
    }

    it('manda el contrato exacto al backend y avisa al padre antes de cerrar', async () => {
        conCreacionOk();
        const user = userEvent.setup();
        const { onClose, onAgentCreated } = montar();

        await user.click(await screen.findByRole('button', { name: /crear desde cero/i }));
        await user.type(await screen.findByLabelText(/nombre del agente/i), '  Auditor  ');
        fireEvent.change(screen.getByLabelText(/system prompt/i), {
            target: { value: '  Audita contratos.  ' },
        });
        fireEvent.change(screen.getByLabelText(/temperatura/i), { target: { value: '1.4' } });
        await user.click(screen.getByRole('button', { name: `Color ${AGENT_HEX.CTO}` }));
        await user.click(screen.getByRole('button', { name: /siguiente/i }));
        await user.click(await screen.findByRole('button', { name: /siguiente/i }));
        await user.click(await screen.findByRole('button', { name: /crear agente/i }));

        await waitFor(() => expect(cuerpo).not.toBeNull());
        expect(cuerpo).toEqual({
            identity: { name: 'Auditor', role: 'specialist', color: AGENT_HEX.CTO },
            brain_config: {
                // D66 arreglado en la fase 7: «desde cero» arranca en el
                // modelo por defecto, que SÍ está en la lista de opciones.
                model: MODELO_POR_DEFECTO,
                temperature: 1.4,
                system_prompt: 'Audita contratos.',
            },
            owner_user_id: 'default_user',
            is_public: false,
        });
        await waitFor(() => expect(onAgentCreated).toHaveBeenCalledWith('nuevo-1'));
        expect(onClose).toHaveBeenCalled();
    });

    it('sube los documentos uno a uno contra el agente recién creado', async () => {
        conCreacionOk();
        // Lo que se puede afirmar del cuerpo es POCO a propósito: jsdom serializa
        // el `File` de un `FormData` perdiendo nombre y contenido (queda
        // `filename="blob"` y el cuerpo vacío), y llamar a `request.formData()`
        // revienta el intérprete de multipart y el fallo se traga como «subida
        // fallida». Lo que sí es del asistente —una petición POR fichero, EN
        // SERIE, contra el agente recién creado y como multipart— sí se fija.
        const subidas: string[] = [];
        server.use(
            http.post(`${API}/agents/:id/documents`, ({ params, request }) => {
                subidas.push(`${params.id}:${request.headers.get('Content-Type')?.split(';')[0]}`);
                return HttpResponse.json({ ok: true });
            }),
        );

        const user = userEvent.setup();
        const { container, onAgentCreated } = montar();
        await hastaConocimiento(user);

        const input = container.querySelector('input[type="file"]') as HTMLInputElement;
        fireEvent.change(input, {
            target: {
                files: [
                    new File(['CONTENIDO-UNO'], 'uno.pdf', { type: 'application/pdf' }),
                    new File(['CONTENIDO-DOS'], 'dos.pdf', { type: 'application/pdf' }),
                ],
            },
        });
        await screen.findByText('uno.pdf');

        await user.click(screen.getByRole('button', { name: /siguiente/i }));
        await user.click(await screen.findByRole('button', { name: /crear agente/i }));

        await waitFor(() => expect(subidas).toHaveLength(2), { timeout: 8000 });
        expect(subidas).toEqual([
            'nuevo-1:multipart/form-data',
            'nuevo-1:multipart/form-data',
        ]);
        expect(onAgentCreated).toHaveBeenCalledWith('nuevo-1');
        // Dos subidas EN SERIE contra el interceptor de XHR: no cabe en los
        // 5 s por defecto.
    }, 20000);

    it('si la creación falla, pinta el error del store y NO cierra', async () => {
        server.use(http.post(CREAR_URL, () => HttpResponse.json({}, { status: 500 })));
        const user = userEvent.setup();
        const { onClose, onAgentCreated } = montar();

        await user.click(await screen.findByRole('button', { name: /crear desde cero/i }));
        await rellenarMinimo(user);
        await user.click(screen.getByRole('button', { name: /siguiente/i }));
        await user.click(await screen.findByRole('button', { name: /siguiente/i }));
        await user.click(await screen.findByRole('button', { name: /crear agente/i }));

        expect(await screen.findByText('Error al crear agente personalizado')).toBeInTheDocument();
        expect(onAgentCreated).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
    });
});

describe('D41 — el modal y el borrado al cerrar', () => {
    it('el velo NO cierra (hay trabajo dentro) pero Escape sí', async () => {
        const user = userEvent.setup();
        const { onClose } = montar();

        await user.click(await screen.findByTestId('modal-backdrop'));
        expect(onClose).not.toHaveBeenCalled();

        await user.keyboard('{Escape}');
        expect(onClose).toHaveBeenCalled();
    });

    it('al cerrar borra el formulario y vuelve al paso 1 (con 300 ms de margen)', async () => {
        const user = userEvent.setup();
        const espias: Espias = { onClose: vi.fn(), onAgentCreated: vi.fn() };
        const { rerender } = montar(espias);

        await hastaConocimiento(user);
        expect(screen.getByText(/Paso 3 de 4/)).toBeInTheDocument();

        rerender(
            <AgentCreationWizard
                isOpen={false}
                onClose={espias.onClose}
                onAgentCreated={espias.onAgentCreated}
            />,
        );
        await act(async () => {
            await new Promise((r) => setTimeout(r, 400));
        });
        rerender(
            <AgentCreationWizard
                isOpen
                onClose={espias.onClose}
                onAgentCreated={espias.onAgentCreated}
            />,
        );

        expect(await screen.findByText(/Paso 1 de 4/)).toBeInTheDocument();
        await user.click(await screen.findByRole('button', { name: /crear desde cero/i }));
        expect(await screen.findByLabelText(/nombre del agente/i)).toHaveValue('');
    });

    it('BUG D41-B1: el borrado NO alcanza a «arrastrando», que sobrevive al cierre', async () => {
        const user = userEvent.setup();
        const espias: Espias = { onClose: vi.fn(), onAgentCreated: vi.fn() };
        const { rerender } = montar(espias);

        const zona = await hastaConocimiento(user);
        fireEvent.dragOver(zona);
        expect(await screen.findByText(/Suelta los archivos aquí/i)).toBeInTheDocument();

        rerender(
            <AgentCreationWizard
                isOpen={false}
                onClose={espias.onClose}
                onAgentCreated={espias.onAgentCreated}
            />,
        );
        await act(async () => {
            await new Promise((r) => setTimeout(r, 400));
        });
        rerender(
            <AgentCreationWizard
                isOpen
                onClose={espias.onClose}
                onAgentCreated={espias.onAgentCreated}
            />,
        );

        // Se vuelve al paso de conocimiento a mano: el rótulo de la zona ya no
        // dice «Adjuntar documentos», que es justo la señal del bug.
        await user.click(await screen.findByRole('button', { name: /crear desde cero/i }));
        await rellenarMinimo(user);
        await user.click(screen.getByRole('button', { name: /siguiente/i }));

        // Sin ningún arrastre en curso, la zona sigue diciendo que suelte.
        expect(await screen.findByText(/Suelta los archivos aquí/i)).toBeInTheDocument();
    });

    it('D66: «desde cero» arranca con un modelo que SÍ está en la lista', async () => {
        const user = userEvent.setup();
        montar();

        await user.click(await screen.findByRole('button', { name: /crear desde cero/i }));

        // Antes ninguno de los dos radios quedaba marcado y la revisión
        // enseñaba «deepseek-chat» crudo, que ni existía como opción.
        expect(await screen.findByRole('button', { name: /DeepSeek V4 Pro/ })).toHaveAttribute(
            'aria-pressed',
            'true',
        );
        expect(screen.getByRole('button', { name: /DeepSeek V4 Flash/ })).toHaveAttribute(
            'aria-pressed',
            'false',
        );
        expect(screen.queryByText('deepseek-chat')).not.toBeInTheDocument();
    });
});
