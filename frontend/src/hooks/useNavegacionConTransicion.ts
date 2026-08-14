import { useCallback } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate, type NavigateOptions, type To } from 'react-router-dom';

/**
 * §8.10 «El Cambio de Sala» — navegar no parpadea.
 *
 * ── Por qué un hook propio y no `<Link viewTransition>` ─────────────────────
 *
 * §8.10 dice «React Router 7 soporta `<Link viewTransition>`». Es cierto, pero
 * SÓLO con un data router, y esta app monta `<BrowserRouter>` (`main.tsx:47`).
 * Verificado sobre el fuente instalado (react-router 7.13.0):
 *
 *   `<Link viewTransition>` → `useLinkClickHandler` → `useNavigate()`
 *   → `useNavigateUnstable()` → `navigator.push(path, options.state, options)`
 *
 * `navigator.push` es el `history` pelado: recibe `viewTransition` dentro de
 * `options` y no lo mira nunca. `document.startViewTransition` sólo se llama en
 * la rama del data router —donde `useNavigate` resuelve a `useNavigateStable`—
 * y `useViewTransitionState` ni arranca sin `RouterProvider`: hace
 * `invariant(vtContext != null, '… must be used within RouterProvider')`.
 *
 * O sea: con `<BrowserRouter>`, `viewTransition` es un **no-op silencioso**.
 * Migrar a `createBrowserRouter` es un cambio de arquitectura del router y
 * queda fuera del alcance de este ciclo, así que la transición se abre aquí.
 *
 * ── Degradación ────────────────────────────────────────────────────────────
 *
 * Si el navegador no trae la API —Firefox, Safari viejo, y jsdom en los
 * tests—, se navega directo: corte limpio, que es exactamente el
 * comportamiento de hoy. Es la mitad en JS del `@supports` que §8.10 pide, y
 * por eso no hay regresión posible donde no hay soporte.
 *
 * ── Por qué `flushSync` ────────────────────────────────────────────────────
 *
 * La API saca la instantánea del estado ANTERIOR, ejecuta la retrollamada y
 * saca la del estado NUEVO. React 19 agrupa las actualizaciones y las aplica
 * fuera de este turno, así que sin `flushSync` la retrollamada terminaría con
 * el DOM todavía sin tocar: las dos instantáneas serían idénticas y la
 * transición no se vería. Es lo mismo que hace React Router por dentro en la
 * rama del data router.
 */
export function useNavegacionConTransicion() {
    const navigate = useNavigate();

    return useCallback(
        (to: To, options?: NavigateOptions) => {
            const doc = document as Document & {
                startViewTransition?: (cb: () => void) => unknown;
            };

            if (typeof doc.startViewTransition !== 'function') {
                navigate(to, options);
                return;
            }

            doc.startViewTransition(() => {
                flushSync(() => navigate(to, options));
            });
        },
        [navigate],
    );
}
