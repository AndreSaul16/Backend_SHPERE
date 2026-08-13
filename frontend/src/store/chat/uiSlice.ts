/**
 * Interruptores de chrome: el cajón lateral y el modal de agentes.
 *
 * No pertenecen a ningún dominio y `resetState` NO los toca a propósito —
 * cerrar sesión no debe reorganizar la ventana que el usuario tenía abierta.
 */
import type { ChatSet, UiSlice } from './types';

/**
 * Estado inicial de la barra lateral.
 *
 * Nacía en `true` siempre, y eso sólo es correcto en `lg+`, donde la barra es
 * FIJA y «abierta» significa «visible en su columna». Por debajo de `lg` es un
 * cajón sobre velo (§9.13), así que nacer abierta hacía que en móvil el usuario
 * aterrizara en el menú —con la aplicación entera tapada— en TODAS las rutas.
 * Con tráfico mayoritario móvil (§4.3) eso es la primera pantalla del producto.
 *
 * `lg` = 64rem = 1024px (§4.3). Se lee `innerWidth` y no `matchMedia` porque el
 * breakpoint que importa es el mismo que Tailwind aplica al layout, y así el
 * estado del store y la clase `lg:` no pueden discrepar.
 */
export const initialSidebarOpen = (): boolean =>
    typeof window === 'undefined' || window.innerWidth >= 1024;

export const createUiSlice = (set: ChatSet): UiSlice => ({
    isAgentModalOpen: false,
    isSidebarOpen: initialSidebarOpen(),

    toggleSidebar: (open) => set((state) => ({
        isSidebarOpen: open !== undefined ? open : !state.isSidebarOpen
    })),

    toggleAgentModal: (open) => set((state) => ({
        isAgentModalOpen: open !== undefined ? open : !state.isAgentModalOpen
    })),
});
