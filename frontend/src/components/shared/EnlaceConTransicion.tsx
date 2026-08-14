import { Link, type LinkProps } from 'react-router-dom';
import { useNavegacionConTransicion } from '@/hooks/useNavegacionConTransicion';

/**
 * Un enlace del shell que cambia de sala con transición (§8.10).
 *
 * Sigue siendo un `<a>` de verdad con su `href`: el clic primario lo
 * interceptamos para abrir la transición, y **todo lo demás se deja pasar** —
 * ctrl/cmd+clic (otra pestaña), shift+clic (otra ventana), botón central,
 * `target="_blank"` y el menú contextual siguen funcionando como en cualquier
 * enlace. Un enlace que sólo obedece al clic izquierdo no es un enlace, es un
 * botón disfrazado.
 *
 * Sin soporte de la API, `useNavegacionConTransicion` navega directo: el corte
 * de hoy, sin regresión.
 */
export function EnlaceConTransicion({ to, onClick, children, ...resto }: LinkProps) {
    const navegar = useNavegacionConTransicion();

    return (
        <Link
            to={to}
            onClick={(evento) => {
                onClick?.(evento);
                if (evento.defaultPrevented) return;
                // `button !== 0` cubre el clic central (abrir en pestaña nueva).
                if (evento.button !== 0) return;
                if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return;
                if (resto.target && resto.target !== '_self') return;

                evento.preventDefault();
                navegar(to, { replace: resto.replace, state: resto.state });
            }}
            {...resto}
        >
            {children}
        </Link>
    );
}
