import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../setup';
import { ActaActions } from '../../src/components/artifacts/ActaActions';
import { claveDeActa, cargarHechos } from '../../src/utils/actaPasos';

/**
 * Q6 (próximos pasos marcables) y D52 (memo del parseo + `localStorage` que no
 * es de fiar), tareas 2.6 y 2.7.
 */

/**
 * El parser real, envuelto en un contador. Es la única forma honesta de
 * comprobar el `useMemo`: espiar el módulo ya importado no intercepta nada,
 * porque el componente tiene su propio enlace al binding.
 */
const { conteoParseo } = vi.hoisted(() => ({ conteoParseo: { n: 0 } }));
vi.mock('../../src/utils/actaParser', async (importOriginal) => {
    const real = await importOriginal<typeof import('../../src/utils/actaParser')>();
    return {
        ...real,
        parseProximosPasos: (md: string) => {
            conteoParseo.n++;
            return real.parseProximosPasos(md);
        },
    };
});

const ACTA = `# Acta de la junta

## Acuerdos

Se pospone el lanzamiento.

## Próximos pasos

- Cerrar la ronda antes de octubre
- Contratar a dos comerciales
- Revisar el precio con el CFO
`;

const PASOS = [
    'Cerrar la ronda antes de octubre',
    'Contratar a dos comerciales',
    'Revisar el precio con el CFO',
];

const CLAVE = claveDeActa('Acta de la junta', PASOS);
const REPO_KEY = 'sphere_last_github_repo';

beforeEach(() => localStorage.clear());
afterEach(() => {
    cleanup();
    localStorage.clear();
});

describe('Q6 — los próximos pasos son una lista con estado', () => {
    it('saca una casilla por acción y el recuento de hechas', () => {
        render(<ActaActions title="Acta de la junta" content={ACTA} />);
        expect(screen.getAllByRole('checkbox')).toHaveLength(3);
        expect(screen.getByText('0 de 3 hechos')).toBeTruthy();
    });

    it('marcar un paso sobrevive a la recarga', async () => {
        const user = userEvent.setup();
        const { unmount } = render(<ActaActions title="Acta de la junta" content={ACTA} />);
        await user.click(screen.getByRole('checkbox', { name: /Cerrar la ronda/ }));
        expect(screen.getByText('1 de 3 hechos')).toBeTruthy();
        expect(cargarHechos(CLAVE).has('Cerrar la ronda antes de octubre')).toBe(true);

        // Recarga: componente nuevo, mismo almacén.
        unmount();
        render(<ActaActions title="Acta de la junta" content={ACTA} />);
        expect((screen.getByRole('checkbox', { name: /Cerrar la ronda/ }) as HTMLInputElement).checked).toBe(true);
        expect(screen.getByText('1 de 3 hechos')).toBeTruthy();
    });

    it('«GitHub» de una fila crea UN issue, el de esa fila, y la da por hecha', async () => {
        localStorage.setItem(REPO_KEY, JSON.stringify({ owner: 'paintec', repo: 'sphere' }));
        const enviados: unknown[] = [];
        server.use(
            http.post('*/me/exports/github-issues', async ({ request }) => {
                const body = (await request.json()) as { issues: { title: string }[] };
                enviados.push(body.issues);
                return HttpResponse.json({
                    created: [{ title: body.issues[0].title, url: 'https://github.com/paintec/sphere/issues/7' }],
                    errors: [],
                });
            })
        );

        const user = userEvent.setup();
        render(<ActaActions title="Acta de la junta" content={ACTA} />);
        await user.click(screen.getByRole('button', { name: /Crear issue en GitHub para «Contratar a dos comerciales»/ }));

        await waitFor(() => expect(enviados).toHaveLength(1));
        expect(enviados[0]).toEqual([{ title: 'Contratar a dos comerciales', body: '' }]);
        expect(await screen.findByText(/Issue creado para «Contratar a dos comerciales»/)).toBeTruthy();
        expect((screen.getByRole('checkbox', { name: /Contratar a dos comerciales/ }) as HTMLInputElement).checked).toBe(true);
    });

    it('sin repositorio guardado pide el repositorio en vez de fallar', async () => {
        const user = userEvent.setup();
        render(<ActaActions title="Acta de la junta" content={ACTA} />);
        await user.click(screen.getByRole('button', { name: /Crear issue en GitHub para «Cerrar la ronda/ }));
        expect(screen.getByLabelText('owner')).toBeTruthy();
        expect(screen.getByLabelText('repo')).toBeTruthy();
    });

    it('un acta sin «Próximos pasos» no enseña lista vacía', () => {
        render(<ActaActions title="Acta de la junta" content="# Acta\n\nSin acuerdos." />);
        expect(screen.queryByRole('checkbox')).toBeNull();
    });
});

describe('D52 — el acta no se re-parsea en cada tecla, y el almacén no es de fiar', () => {
    it('teclear en owner/repo no vuelve a parsear el acta', async () => {
        const user = userEvent.setup();
        conteoParseo.n = 0;
        render(<ActaActions title="Acta de la junta" content={ACTA} />);
        const antes = conteoParseo.n;
        expect(antes).toBeGreaterThan(0); // se parsea, claro: una vez

        await user.click(screen.getByRole('button', { name: /Crear issues en GitHub/ }));
        await user.type(screen.getByLabelText('owner'), 'paintec');
        await user.type(screen.getByLabelText('repo'), 'sphere');

        // Recorrer un acta línea a línea con cada tecla, en el hilo del teclado,
        // para responder siempre lo mismo.
        expect(conteoParseo.n).toBe(antes);
    });

    it('un `localStorage` corrupto no tumba el panel', () => {
        for (const basura of ['null', '42', '"paintec"', '{"owner":123,"repo":null}', '{no json']) {
            localStorage.setItem(REPO_KEY, basura);
            expect(() =>
                render(<ActaActions title="Acta de la junta" content={ACTA} />)
            ).not.toThrow();
            cleanup();
        }
    });

    it('unas marcas corruptas se leen como «nada marcado»', () => {
        localStorage.setItem(CLAVE, '{"hecho":true}');
        render(<ActaActions title="Acta de la junta" content={ACTA} />);
        expect(screen.getByText('0 de 3 hechos')).toBeTruthy();
    });
});

/**
 * lanzamiento-p0 · AD-004 — los títulos a la vista antes de tocar el repositorio.
 *
 * El diálogo de confirmación decía «Se crearán 6 issues en el repositorio
 * indicado.» y ese número era TODO lo que el usuario aprobaba. Con el parser
 * ampliado (AD-003) eso deja de ser un detalle de presentación: la regla de
 * párrafo puede convertir una línea suelta del acta en un issue del repositorio
 * de un cliente, y el único sitio donde eso se ve antes de que ocurra es aquí.
 *
 * Las aserciones van ACOTADAS al diálogo (`within`). El componente ya pinta la
 * lista de pasos fuera de él, así que una búsqueda global pasaría sin que el
 * diálogo enseñe nada: sería un verde que no prueba lo que dice probar.
 */
const ACTA_6 = `# Acta de la junta

## Próximos pasos

- Migrar el índice a Postgres
- Cerrar la ronda antes de octubre
- Contratar a dos comerciales
- Revisar el precio con el CFO
- Abrir oficina en Lisboa
- Renegociar el contrato del proveedor
`;

const LOS_6 = [
    'Migrar el índice a Postgres',
    'Cerrar la ronda antes de octubre',
    'Contratar a dos comerciales',
    'Revisar el precio con el CFO',
    'Abrir oficina en Lisboa',
    'Renegociar el contrato del proveedor',
];

describe('AD-004 — el diálogo enseña los títulos, no un número', () => {
    const abrirDialogo = async () => {
        const user = userEvent.setup();
        render(<ActaActions title="Acta de la junta" content={ACTA_6} />);
        await user.click(screen.getByRole('button', { name: /Crear issues en GitHub/ }));
        return screen.getByRole('group', { name: /Crear issues en GitHub/i });
    };

    it('los 6 títulos se leen dentro del diálogo, literales, antes de confirmar', async () => {
        const dialogo = await abrirDialogo();

        for (const titulo of LOS_6) {
            expect(within(dialogo).getByText(titulo)).toBeTruthy();
        }
    });

    it('el recuento anunciado coincide con los títulos listados', async () => {
        const dialogo = await abrirDialogo();

        expect(within(dialogo).getByText(/6 issues/)).toBeTruthy();
        // El número sale del mismo array que los títulos: no puede divergir.
        const listados = within(dialogo).getAllByRole('listitem');
        expect(listados).toHaveLength(6);
        expect(listados.map((li) => li.textContent?.trim())).toEqual(LOS_6);
    });

    it('sin próximos pasos no se ofrece crear nada y se explica por qué', async () => {
        const user = userEvent.setup();
        render(<ActaActions title="Acta de la junta" content="# Acta\n\nSin acuerdos." />);
        await user.click(screen.getByRole('button', { name: /Crear issues en GitHub/ }));

        expect(screen.getByText(/No se encontró la sección/)).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Crear issues' })).toBeNull();
    });
});
