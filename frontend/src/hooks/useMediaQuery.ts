import { useEffect, useState } from 'react';

/**
 * Una consulta de medios como estado de React.
 *
 * Existe porque dos efectos de firma cambian de FORMA, no de estilo, al pasar
 * de móvil a escritorio: el Palco se despliega a la Sala (§8.1) y el Canto se
 * ensancha al gutter (§8.4). Las posiciones del arco se calculan en JS, así que
 * el componente necesita saber en qué mundo está — y no vale mirarlo una vez:
 * girar el teléfono o arrastrar la ventana tiene que recolocar los asientos.
 *
 * El valor inicial se resuelve con un inicializador perezoso de `useState`, no
 * leyendo nada en el render (`react-hooks/refs`), y se vuelve a sincronizar
 * dentro del efecto por si la consulta cambió entre el primer render y el
 * montaje.
 *
 * `matchMedia` puede no existir (jsdom antiguo): sin él se devuelve `false`, o
 * sea el caso base — que en este sistema es móvil, y móvil es la experiencia
 * completa (§4.3).
 */
export function useMediaQuery(consulta: string): boolean {
    const [coincide, setCoincide] = useState(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
        return window.matchMedia(consulta).matches;
    });

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
        const mql = window.matchMedia(consulta);
        const alCambiar = () => setCoincide(mql.matches);
        alCambiar();
        mql.addEventListener('change', alCambiar);
        return () => mql.removeEventListener('change', alCambiar);
    }, [consulta]);

    return coincide;
}
