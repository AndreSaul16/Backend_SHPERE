/**
 * 6.13 — esqueletos de sección, para las esperas cuya forma SÍ se conoce.
 *
 * §9.12 parte las esperas en dos: si la forma del contenido se conoce, un
 * esqueleto con esa forma; si no se conoce, un giro. Seis secciones de Ajustes
 * y el paso de plantillas del asistente resolvían la suya con
 * `<p>Cargando...</p>` — que no es ni una cosa ni la otra: no dice cuánto falta,
 * no reserva el sitio (así que al llegar los datos la página pega un salto) y
 * encima llega en el idioma equivocado de puntuación, con tres puntos sueltos.
 *
 * Los tres que hay aquí cubren las tres formas reales que se repiten en la app.
 * No se inventa un cuarto: un esqueleto que no se parece a lo que va a llegar
 * es peor que un giro, porque promete una cosa y entrega otra.
 *
 * Todos llevan `role="status"` con su etiqueta: la espera tiene que existir
 * también para quien no la ve, y el bloque gris por sí solo no dice nada.
 * `aria-hidden` en las piezas evita que un lector recite quince divs vacíos.
 */
import { cn } from '@/lib/utils';

export interface EsqueletoProps {
    /** Qué se está esperando. Va al `aria-label` del `role="status"`. */
    etiqueta: string;
    className?: string;
}

/** Etiqueta + control, repetido. La forma de casi todo Ajustes. */
export function EsqueletoDeFormulario({
    etiqueta,
    filas = 3,
    className,
}: EsqueletoProps & { filas?: number }) {
    return (
        <div className={cn('space-y-6', className)} role="status" aria-label={etiqueta}>
            {Array.from({ length: filas }, (_, i) => (
                <div key={i} className="space-y-2" aria-hidden="true">
                    <div className="skeleton h-3 w-32 rounded-xs" />
                    <div className="skeleton h-11 w-full rounded-sm" />
                </div>
            ))}
        </div>
    );
}

/** Tarjetas apiladas con glifo, título y frase. Listas de servicios, agentes. */
export function EsqueletoDeTarjetas({
    etiqueta,
    filas = 3,
    className,
}: EsqueletoProps & { filas?: number }) {
    return (
        <div className={cn('space-y-2', className)} role="status" aria-label={etiqueta}>
            {Array.from({ length: filas }, (_, i) => (
                <div
                    key={i}
                    aria-hidden="true"
                    className="flex items-center gap-3 rounded-md border border-stroke-hairline p-4"
                >
                    <div className="skeleton h-9 w-9 shrink-0 rounded-sm" />
                    <div className="min-w-0 flex-1 space-y-2">
                        <div className="skeleton h-3 w-32 rounded-xs" />
                        <div className="skeleton h-2.5 w-52 max-w-full rounded-xs" />
                    </div>
                </div>
            ))}
        </div>
    );
}

/** Filas cortas de una lista sencilla: contactos, miembros. */
export function EsqueletoDeFilas({
    etiqueta,
    filas = 3,
    className,
}: EsqueletoProps & { filas?: number }) {
    return (
        <div className={cn('space-y-2', className)} role="status" aria-label={etiqueta}>
            {Array.from({ length: filas }, (_, i) => (
                <div
                    key={i}
                    aria-hidden="true"
                    className="flex items-center justify-between gap-3 rounded-sm border border-stroke-hairline p-3"
                >
                    <div className="skeleton h-3 w-40 max-w-[60%] rounded-xs" />
                    <div className="skeleton h-7 w-7 shrink-0 rounded-sm" />
                </div>
            ))}
        </div>
    );
}
