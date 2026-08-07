/**
 * Regresión de los dos P0 de KnowledgeBasePanel arreglados en b7452be.
 *
 * El panel llegó a producción sin un solo test, y por eso pasaron:
 *
 *  P0-1 — Llamaba a los tres endpoints de documentos con fetch/XHR crudos y SIN
 *         cabecera Authorization, contra endpoints que exigen
 *         Depends(get_current_user) (backend/app/presentation/api/v1/documents.py
 *         :51, :181, :241). Listar, subir y borrar devolvían 401.
 *
 *  P0-2 — Al listar trataba la respuesta como un array, cuando el backend
 *         devuelve DocumentListResponse ({documents, total_count}), así que
 *         setDocuments recibía un objeto y la lista nunca podía renderizar
 *         (además de romper documents.some/.reduce).
 *
 * El test clave es el de la cabecera Authorization del listado: es el que
 * faltaba y el que habría cazado P0-1.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../setup';
import { KnowledgeBasePanel } from '../../src/components/agents/KnowledgeBasePanel';

// El token viaja por authHeaders() -> getAuthToken(), que hace
// `await import("firebase/auth")`. vi.mock también intercepta el import dinámico.
vi.mock('firebase/auth', () => ({
    getAuth: vi.fn(() => ({
        currentUser: {
            getIdToken: vi.fn(() => Promise.resolve('mock-token')),
        },
    })),
}));

const AGENT_ID = 'cto-1';
const LIST_URL = `http://localhost:8000/api/v1/agents/${AGENT_ID}/documents`;
const DELETE_URL = `http://localhost:8000/api/v1/agents/${AGENT_ID}/documents/:fileId`;

const doc = (overrides: Record<string, unknown> = {}) => ({
    id: 'doc-1',
    filename: 'informe.pdf',
    file_size: 2048,
    // 'completed' a propósito: con pending/processing el panel arranca un
    // setInterval de polling que ensuciaría el test.
    status: 'completed',
    chunks_count: 12,
    created_at: '2026-07-30T10:00:00Z',
    ...overrides,
});

/** Respuesta con la forma real del backend: DocumentListResponse. */
const listResponse = (documents: unknown[]) =>
    HttpResponse.json({ documents, total_count: documents.length });

describe('KnowledgeBasePanel — regresión P0 (b7452be)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ---------------------------------------------------------------------
    // P0-1: autenticación
    // ---------------------------------------------------------------------

    it('envía Authorization: Bearer en la petición de listado (P0-1)', async () => {
        let authHeader: string | null | undefined;

        server.use(
            http.get(LIST_URL, ({ request }) => {
                authHeader = request.headers.get('Authorization');
                return listResponse([doc()]);
            }),
        );

        render(<KnowledgeBasePanel agentId={AGENT_ID} />);

        await waitFor(() => expect(authHeader).toBeDefined());
        expect(authHeader).toBe('Bearer mock-token');
    });

    it('no deja el panel en error cuando el backend acepta la petición autenticada', async () => {
        server.use(http.get(LIST_URL, () => listResponse([doc()])));

        render(<KnowledgeBasePanel agentId={AGENT_ID} />);

        expect(await screen.findByText('informe.pdf')).toBeInTheDocument();
        // Sin token el endpoint respondía 401 y el panel pintaba el error.
        expect(screen.queryByText(/Error fetching documents/i)).not.toBeInTheDocument();
    });

    it('propaga el error al usuario si el listado responde 401', async () => {
        server.use(
            http.get(LIST_URL, () =>
                HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 }),
            ),
        );

        render(<KnowledgeBasePanel agentId={AGENT_ID} />);

        expect(await screen.findByText(/Error fetching documents: 401/i)).toBeInTheDocument();
    });

    // ---------------------------------------------------------------------
    // P0-2: forma de la respuesta
    // ---------------------------------------------------------------------

    it('renderiza los documentos de {documents, total_count} (P0-2)', async () => {
        server.use(
            http.get(LIST_URL, () =>
                listResponse([
                    doc({ id: 'doc-1', filename: 'informe.pdf', chunks_count: 12 }),
                    doc({ id: 'doc-2', filename: 'contrato.docx', file_size: 4096, chunks_count: 7 }),
                ]),
            ),
        );

        render(<KnowledgeBasePanel agentId={AGENT_ID} />);

        expect(await screen.findByText('informe.pdf')).toBeInTheDocument();
        expect(screen.getByText('contrato.docx')).toBeInTheDocument();

        // El resumen deriva de documents.length / .reduce: con el bug, documents
        // era un objeto y estas agregaciones ni se podían calcular.
        expect(screen.getByText('2 DOCUMENTOS INDEXADOS')).toBeInTheDocument();
        expect(screen.getByText('19')).toBeInTheDocument(); // 12 + 7 chunks
    });

    it.each([
        ['un array pelado (contrato antiguo)', [doc()]],
        ['null', null],
        ['un objeto sin la clave documents', { total_count: 3 }],
        ['documents con un tipo que no es array', { documents: { 0: doc() }, total_count: 1 }],
    ])('no revienta si la respuesta tiene forma inesperada: %s', async (_label, body) => {
        server.use(http.get(LIST_URL, () => HttpResponse.json(body)));

        render(<KnowledgeBasePanel agentId={AGENT_ID} />);

        // Degrada a lista vacía en lugar de romper el render.
        expect(await screen.findByText('Sin documentos')).toBeInTheDocument();
        expect(screen.queryByText('informe.pdf')).not.toBeInTheDocument();
    });

    // ---------------------------------------------------------------------
    // Borrado autenticado
    // ---------------------------------------------------------------------

    it('borra llamando al endpoint autenticado y quita la fila (P0-1)', async () => {
        let deleteAuth: string | null | undefined;
        let deletedId: string | undefined;

        server.use(
            http.get(LIST_URL, () =>
                listResponse([
                    doc({ id: 'doc-1', filename: 'informe.pdf' }),
                    doc({ id: 'doc-2', filename: 'contrato.docx' }),
                ]),
            ),
            http.delete(DELETE_URL, ({ request, params }) => {
                deleteAuth = request.headers.get('Authorization');
                deletedId = params.fileId as string;
                return new HttpResponse(null, { status: 204 });
            }),
        );

        render(<KnowledgeBasePanel agentId={AGENT_ID} />);
        await screen.findByText('informe.pdf');

        // El botón nombra el objeto (§11): `Eliminar el documento «X»`. Antes
        // su única etiqueta era el `title`, que §9.6 prohíbe y que en táctil no
        // aparece nunca.
        const buttons = screen.getAllByRole('button', { name: /^Eliminar el documento/ });
        expect(buttons).toHaveLength(2);
        fireEvent.click(buttons[0]);

        await waitFor(() => expect(deletedId).toBe('doc-1'));
        expect(deleteAuth).toBe('Bearer mock-token');

        // La fila desaparece de la lista.
        await waitFor(() =>
            expect(screen.queryByText('informe.pdf')).not.toBeInTheDocument(),
        );
        expect(screen.getByText('contrato.docx')).toBeInTheDocument();
    });

    it('mantiene la fila si el borrado falla', async () => {
        server.use(
            http.get(LIST_URL, () => listResponse([doc({ filename: 'informe.pdf' })])),
            http.delete(DELETE_URL, () =>
                HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 }),
            ),
        );
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

        render(<KnowledgeBasePanel agentId={AGENT_ID} />);
        await screen.findByText('informe.pdf');

        fireEvent.click(screen.getByRole('button', { name: 'Eliminar el documento informe.pdf' }));

        await waitFor(() => expect(consoleError).toHaveBeenCalled());
        // No hay borrado optimista: si el backend rechaza, la fila sigue.
        expect(screen.getByText('informe.pdf')).toBeInTheDocument();

        consoleError.mockRestore();
    });

    it('no pinta el botón de borrar en modo readOnly', async () => {
        server.use(http.get(LIST_URL, () => listResponse([doc({ filename: 'informe.pdf' })])));

        render(<KnowledgeBasePanel agentId={AGENT_ID} readOnly />);
        await screen.findByText('informe.pdf');

        expect(screen.queryByRole('button', { name: /^Eliminar el documento/ })).not.toBeInTheDocument();
    });

    // ---------------------------------------------------------------------
    // Subida autenticada (el tercer endpoint de P0-1)
    // ---------------------------------------------------------------------

    it('envía Authorization: Bearer al subir un documento (P0-1)', async () => {
        let uploadAuth: string | null | undefined;
        let uploadContentType: string | null | undefined;

        server.use(
            http.get(LIST_URL, () => listResponse([])),
            http.post(LIST_URL, ({ request }) => {
                uploadAuth = request.headers.get('Authorization');
                uploadContentType = request.headers.get('Content-Type');
                return HttpResponse.json({ id: 'doc-new' }, { status: 201 });
            }),
        );

        const { container } = render(<KnowledgeBasePanel agentId={AGENT_ID} />);
        await screen.findByText('Sin documentos');

        const input = container.querySelector('input[type="file"]') as HTMLInputElement;
        const file = new File(['contenido'], 'nuevo.pdf', { type: 'application/pdf' });
        fireEvent.change(input, { target: { files: [file] } });

        await waitFor(() => expect(uploadAuth).toBeDefined());
        expect(uploadAuth).toBe('Bearer mock-token');
        // El Content-Type NO se fija a mano: lo pone el navegador con el
        // boundary de multipart. Fijarlo rompería la subida.
        expect(uploadContentType).toMatch(/^multipart\/form-data; boundary=/);
    });
});
