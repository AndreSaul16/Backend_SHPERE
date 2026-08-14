import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useNavegacionConTransicion } from '../../src/hooks/useNavegacionConTransicion';
import { EnlaceConTransicion } from '../../src/components/shared/EnlaceConTransicion';

/**
 * Viveza-1 · §8.10 «El Cambio de Sala» — navegar no parpadea.
 *
 * ADVERTENCIA VERIFICADA CONTRA EL FUENTE INSTALADO (react-router 7.13.0).
 * §8.10 dice «React Router 7 soporta `<Link viewTransition>`», y es cierto
 * SÓLO con un data router. Esta app monta `<BrowserRouter>` (`main.tsx:47`),
 * y ahí la cadena es:
 *
 *   `<Link viewTransition>` → `useLinkClickHandler` → `useNavigate()`
 *   → `useNavigateUnstable()` → `navigator.push(path, state, options)`
 *
 * `navigator.push` es un `history` pelado: recibe `viewTransition` dentro de
 * `options` y **no lo mira**. La llamada a `document.startViewTransition` sólo
 * existe en la rama del data router (donde `useNavigate` resuelve a
 * `useNavigateStable`), y `useViewTransitionState` ni siquiera arranca sin
 * `RouterProvider`: hace `invariant(vtContext != null)`.
 *
 * O sea: con `<BrowserRouter>` el prop `viewTransition` es un NO-OP silencioso.
 * Migrar el router queda fuera de alcance, así que la transición la abre este
 * hook. jsdom no implementa `startViewTransition`, y ESE es justo el caso del
 * `@supports` de §8.10: sin soporte, navegación directa y corte limpio — el
 * comportamiento de hoy, cero regresión.
 */

type DocumentoConTransicion = Document & {
    startViewTransition?: (cb: () => void) => { finished: Promise<void> };
};

const doc = document as DocumentoConTransicion;

function Sonda() {
    const navegar = useNavegacionConTransicion();
    return (
        <button type="button" onClick={() => navegar('/ajustes')}>
            Ir a ajustes
        </button>
    );
}

function Ruta() {
    const { pathname } = useLocation();
    return <span data-testid="ruta">{pathname}</span>;
}

const montar = (ui: React.ReactNode) =>
    render(
        <MemoryRouter initialEntries={['/chat']}>
            {ui}
            <Ruta />
            <Routes>
                <Route path="/chat" element={<span>sala del chat</span>} />
                <Route path="/ajustes" element={<span>sala de ajustes</span>} />
            </Routes>
        </MemoryRouter>,
    );

afterEach(() => {
    delete doc.startViewTransition;
});

describe('§8.10 — la navegación abre una transición cuando el navegador la tiene', () => {
    it('sin soporte navega directo: corte limpio, que es lo de hoy', async () => {
        // jsdom no implementa la API. Es el caso del `@supports`.
        expect(doc.startViewTransition).toBeUndefined();
        const user = userEvent.setup();
        montar(<Sonda />);

        await user.click(screen.getByRole('button', { name: 'Ir a ajustes' }));

        expect(screen.getByTestId('ruta')).toHaveTextContent('/ajustes');
        expect(screen.getByText('sala de ajustes')).toBeInTheDocument();
    });

    it('con soporte, la navegación ocurre DENTRO de la transición', async () => {
        // El doble ejecuta la retrollamada, que es lo que hace el navegador de
        // verdad: si el hook no la usara, la ruta cambiaría igual y este test
        // no distinguiría nada. Por eso se comprueba que la ruta AÚN NO ha
        // cambiado antes de ejecutarla.
        let retrollamada: (() => void) | null = null;
        const startViewTransition = vi.fn((cb: () => void) => {
            retrollamada = cb;
            return { finished: Promise.resolve() };
        });
        doc.startViewTransition = startViewTransition;

        const user = userEvent.setup();
        montar(<Sonda />);

        await user.click(screen.getByRole('button', { name: 'Ir a ajustes' }));

        expect(startViewTransition).toHaveBeenCalledTimes(1);
        // La navegación está en manos del navegador todavía.
        expect(screen.getByTestId('ruta')).toHaveTextContent('/chat');

        // El navegador ejecuta la retrollamada por su cuenta; en el test hay
        // que meterla en `act` para que React entregue el commit al DOM.
        act(() => retrollamada!());

        expect(screen.getByTestId('ruta')).toHaveTextContent('/ajustes');
    });
});

describe('§8.10 — el enlace de sala sigue siendo un enlace', () => {
    it('navega con transición al pulsarlo', async () => {
        const startViewTransition = vi.fn((cb: () => void) => {
            cb();
            return { finished: Promise.resolve() };
        });
        doc.startViewTransition = startViewTransition;

        const user = userEvent.setup();
        montar(<EnlaceConTransicion to="/ajustes">Ajustes</EnlaceConTransicion>);

        await user.click(screen.getByRole('link', { name: 'Ajustes' }));

        expect(startViewTransition).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('ruta')).toHaveTextContent('/ajustes');
    });

    it('conserva el href, para que abrir en otra pestaña siga funcionando', () => {
        montar(<EnlaceConTransicion to="/ajustes">Ajustes</EnlaceConTransicion>);

        expect(screen.getByRole('link', { name: 'Ajustes' })).toHaveAttribute('href', '/ajustes');
    });

    it('no secuestra el ctrl+clic: eso es «abrir en otra pestaña», no navegar', async () => {
        const startViewTransition = vi.fn((cb: () => void) => {
            cb();
            return { finished: Promise.resolve() };
        });
        doc.startViewTransition = startViewTransition;

        const user = userEvent.setup();
        montar(<EnlaceConTransicion to="/ajustes">Ajustes</EnlaceConTransicion>);

        await user.keyboard('{Control>}');
        await user.click(screen.getByRole('link', { name: 'Ajustes' }));
        await user.keyboard('{/Control}');

        expect(startViewTransition).not.toHaveBeenCalled();
        // Y la sala no ha cambiado bajo los pies de quien pedía otra pestaña.
        expect(screen.getByTestId('ruta')).toHaveTextContent('/chat');
    });
});

describe('§8.10 — el contrato de la transición vive en `index.css`', () => {
    const css = readFileSync(resolve(__dirname, '../../src/index.css'), 'utf8');

    it('se declara dentro de un @supports: sin soporte, corte limpio', () => {
        expect(css).toMatch(/@supports\s*\(view-transition-name:\s*none\)/);
    });

    it('las instantáneas usan los tokens de §7, no valores inventados', () => {
        expect(css).toContain('::view-transition-old(root)');
        expect(css).toContain('::view-transition-new(root)');
        expect(css).toMatch(/var\(--duration-panel\)/);
        expect(css).toMatch(/var\(--ease-settle\)/);
    });

    it('con movimiento reducido no hay recorrido (§7.6)', () => {
        // §8.10: «Reduced-motion: `::view-transition-group { animation: none }`
        // — corte directo».
        const desde = css.indexOf('::view-transition-group');
        expect(desde, 'falta la regla de movimiento reducido').toBeGreaterThan(-1);
        expect(css.slice(desde, desde + 120)).toMatch(/animation:\s*none/);
    });
});
