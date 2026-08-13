/**
 * El estado de la red, dicho antes de que el usuario se estrelle.
 *
 * Sin esto, quedarse sin cobertura se descubre pulsando «Enviar» y recibiendo
 * un fallo genérico. Con esto, el usuario sabe que el problema es suyo y no del
 * producto, y sabe que su texto sigue guardado.
 *
 * Decisiones de sitio, que aquí son la mitad del trabajo:
 *   · No es un aviso flotante: un `toast` de red se cierra y el usuario sigue
 *     sin red. Esto se queda mientras dure la avería.
 *   · Va arriba y centrado, con `ps-14` en móvil para no taparse con el botón
 *     de menú (`fixed top-3.5 left-4` en `MainLayout`). Un aviso que tapa el
 *     control de navegación es peor que el fallo que anuncia (§ móvil primero).
 *   · La vuelta de la conexión SÍ se dice, y sí se va sola a los 4 s: es una
 *     buena noticia, y una buena noticia que se queda estorba.
 */
import { useEffect, useState } from 'react';
import { CloudOff, Wifi } from 'lucide-react';
import { cn } from '@/lib/utils';

const AVISO_DE_VUELTA_MS = 4000;

/**
 * Tres estados y no dos: «sin novedad» no es lo mismo que «acaba de volver».
 *
 * El estado lo mueven los eventos del navegador, no un efecto que observa un
 * booleano: sólo se dice «conexión restablecida» si antes hubo un `offline`
 * REAL en esta pestaña. Cargar la página con red no es una buena noticia que
 * anunciar, es lo normal.
 */
type EstadoDeRed = 'ok' | 'caida' | 'vuelta';

function estadoInicial(): EstadoDeRed {
    if (typeof navigator === 'undefined') return 'ok';
    return navigator.onLine === false ? 'caida' : 'ok';
}

export function ConnectionBanner() {
    const [estado, setEstado] = useState<EstadoDeRed>(estadoInicial);

    useEffect(() => {
        const bajar = () => setEstado('caida');
        const subir = () => setEstado('vuelta');
        window.addEventListener('offline', bajar);
        window.addEventListener('online', subir);
        return () => {
            window.removeEventListener('offline', bajar);
            window.removeEventListener('online', subir);
        };
    }, []);

    useEffect(() => {
        if (estado !== 'vuelta') return;
        const t = setTimeout(() => setEstado('ok'), AVISO_DE_VUELTA_MS);
        return () => clearTimeout(t);
    }, [estado]);

    if (estado === 'ok') return null;

    const caida = estado === 'caida';

    return (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[150] flex justify-center px-3 ps-14 pt-3 lg:ps-3">
            <p
                role="status"
                data-testid="estado-de-red"
                className={cn(
                    'pointer-events-auto flex max-w-full items-center gap-2 rounded-sm border px-3 py-2 text-xs shadow-e3',
                    caida
                        ? 'border-warning bg-surface-3 text-content-strong'
                        : 'border-success bg-surface-3 text-content-strong',
                )}
            >
                {caida ? (
                    <CloudOff className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                ) : (
                    <Wifi className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                )}
                <span className="min-w-0">
                    {caida ? (
                        <>
                            <span className="font-[550]">Sin conexión.</span>{' '}
                            {/* En móvil la frase larga hacía dos líneas y tapaba
                                la cabecera del chat entera. La versión corta
                                dice lo único que hace falta —que no se pierde
                                nada—; la larga vuelve en cuanto hay sitio. */}
                            <span className="text-content-muted sm:hidden">Tu borrador se guarda.</span>
                            <span className="hidden text-content-muted sm:inline">
                                Puedes seguir escribiendo: tu borrador se guarda y podrás enviarlo al volver.
                            </span>
                        </>
                    ) : (
                        <span className="font-[550]">Conexión restablecida</span>
                    )}
                </span>
            </p>
        </div>
    );
}
