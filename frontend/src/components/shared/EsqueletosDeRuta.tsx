/**
 * Los esqueletos de espera de las rutas perezosas (tarea 4.1, riesgo R3).
 *
 * R3 del plan dice, literalmente: «Un `<Suspense>` por ruta con el skeleton del
 * **layout de esa ruta**, nunca un spinner centrado». El motivo no es estético:
 * un disco girando a media pantalla borra la estructura que el usuario ya tenía
 * delante y hace que la navegación se lea como una recarga. Un esqueleto con la
 * forma de lo que viene reserva el sitio, así que cuando llega el módulo no hay
 * salto de layout (CLS) y la espera se lee como «esto ya está llegando».
 *
 * Todos usan `.skeleton` de `index.css` (§9.12): barrido de `--stroke-hairline`
 * sobre el relleno de e2, 1400ms, y **quieto** con `prefers-reduced-motion` —
 * la forma sola ya es la información.
 *
 * Todos llevan `role="status"` con nombre accesible: quien no ve la pantalla
 * necesita saber que hay algo en curso, y es lo que evita el silencio de varios
 * segundos en una conexión lenta.
 */

/** Una barra gris del ancho que se le diga. El ladrillo de todo lo de abajo. */
function Barra({ className }: { className: string }) {
    return <div className={`skeleton rounded-xs ${className}`} aria-hidden="true" />;
}

/**
 * El chat: cabecera de 80px, turnos alternos y el compositor.
 * Es la ruta `/` y `/chat/:sessionId`, o sea la primera pantalla del producto.
 */
export function EsqueletoDeChat() {
    return (
        <div className="flex h-full flex-col" role="status" aria-label="Abriendo la junta">
            <div className="flex h-20 items-center gap-4 border-b border-stroke-hairline bg-surface-1 pl-14 pr-6 lg:pl-8">
                <div className="skeleton h-11 w-11 rounded-sm" aria-hidden="true" />
                <div className="space-y-2">
                    <Barra className="h-4 w-40" />
                    <Barra className="h-3 w-24" />
                </div>
            </div>
            <div className="flex-1 space-y-8 overflow-hidden px-4 py-6 sm:p-6">
                <div className="mx-auto max-w-4xl space-y-8">
                    {[0, 1, 2].map((i) => (
                        <div key={i} className={i % 2 === 1 ? 'flex justify-end' : 'flex justify-start'}>
                            <div className="w-full space-y-2 sm:w-4/5">
                                <Barra className="h-3 w-24" />
                                <Barra className="h-16 w-full rounded-md" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="p-6">
                <div className="mx-auto max-w-4xl">
                    <Barra className="h-14 w-full rounded-md" />
                </div>
            </div>
        </div>
    );
}

/**
 * Las páginas con cabecera fija y contenido en columna: ajustes, perfil,
 * facturación, admin, el detalle de agente y los ajustes de la conversación.
 */
export function EsqueletoDePagina() {
    return (
        <div className="flex h-full flex-col" role="status" aria-label="Abriendo la página">
            <div className="flex h-14 items-center gap-3 border-b border-stroke-hairline bg-surface-0 pl-14 pr-6 sm:h-16 lg:pl-6">
                <div className="skeleton h-8 w-8 rounded-sm" aria-hidden="true" />
                <Barra className="h-4 w-44" />
            </div>
            <div className="flex-1 overflow-hidden p-4 sm:p-6 md:p-8">
                <div className="mx-auto max-w-3xl space-y-6">
                    {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="space-y-2">
                            <Barra className="h-3 w-32" />
                            <Barra className="h-11 w-full rounded-sm" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

/**
 * Las tres pantallas de entrada. Copia la geometría de `AuthShell`: wordmark,
 * filete y tarjeta de ancho `max-w-md`.
 */
export function EsqueletoDeAutenticacion() {
    return (
        <div
            className="flex min-h-dvh flex-col justify-center px-4 py-10"
            role="status"
            aria-label="Cargando"
        >
            <div className="mx-auto w-full max-w-md">
                <div className="mb-8 flex flex-col items-center">
                    <Barra className="h-8 w-40" />
                    <span aria-hidden="true" className="mt-3 block h-px w-10 bg-accent" />
                </div>
                <div className="space-y-4 rounded-md border border-stroke-edge bg-surface-2 p-5 shadow-e2 sm:p-6">
                    <Barra className="h-5 w-32" />
                    <Barra className="h-11 w-full rounded-sm" />
                    <Barra className="h-11 w-full rounded-sm" />
                    <Barra className="h-11 w-full rounded-sm" />
                </div>
            </div>
        </div>
    );
}

/**
 * La conversación compartida: es la cara pública del producto y se lee sobre
 * papel, así que el esqueleto también reserva la hoja.
 */
export function EsqueletoDeDocumento() {
    return (
        <div className="min-h-dvh px-4 py-10" role="status" aria-label="Abriendo la conversación">
            <div className="mx-auto w-full max-w-3xl space-y-4">
                <Barra className="h-6 w-56" />
                <div className="acta-sheet space-y-3 p-6 sm:p-8">
                    <Barra className="h-4 w-3/4" />
                    <Barra className="h-4 w-full" />
                    <Barra className="h-4 w-5/6" />
                    <Barra className="h-4 w-2/3" />
                </div>
            </div>
        </div>
    );
}
