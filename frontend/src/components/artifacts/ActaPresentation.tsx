/**
 * Modo presentación del acta — PLAN §6 Q1 (tarea 5.8).
 *
 * Por qué existe: el usuario de SPHERE **presenta esa decisión a alguien** —a
 * su socio, a su consejo real, a un inversor—, y hoy tiene que copiar el
 * markdown a Google Slides. Esto convierte el acta en el artefacto que sale de
 * la aplicación y entra en una reunión.
 *
 * Decisiones que no son obvias:
 *
 * - **Pantalla completa es una mejora, no el mecanismo.** Se pide
 *   `requestFullscreen()` porque es lo que hace que la proyección se vea sin el
 *   navegador alrededor, pero si el navegador lo niega —Safari en iOS no lo da
 *   para elementos cualesquiera— la presentación funciona igual sobre una capa
 *   fija. Colgar la función de una API opcional la habría dejado inexistente en
 *   media flota móvil.
 * - **Es un diálogo modal de verdad.** `role="dialog"` + `aria-modal`, foco
 *   dentro, `Escape` sale y el foco vuelve al disparador. Una capa a pantalla
 *   completa sin eso deja al lector de pantalla leyendo la aplicación de detrás
 *   mientras se proyecta otra cosa.
 * - **El movimiento es un desvanecido y nada más** (§7.4): una presentación con
 *   transiciones de diapositiva compite con lo que se está contando, y a la
 *   tercera cansa. Con `prefers-reduced-motion` no hay ni eso.
 * - **Se puede pasar de diapositiva sin teclado**: dos botones grandes y el
 *   gesto de tocar la mitad derecha/izquierda no existen aquí, pero los botones
 *   sí —a 390px son el único camino, y una presentación que sólo avanza con ←/→
 *   no se puede dar desde un móvil.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useChatStore } from '@/store/useChatStore';
import { DisagreementBar } from '@/components/chat/DisagreementBar';
import { gradoDeDesacuerdo } from '@/components/chat/desacuerdo';
import { partirEnDiapositivas } from '@/utils/actaDiapositivas';
import { conMovimiento, CURVA, DURACION } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface ActaPresentationProps {
    open: boolean;
    onClose: () => void;
    title: string;
    content: string;
}

export function ActaPresentation({ open, onClose, title, content }: ActaPresentationProps) {
    const [indice, setIndice] = useState(0);
    const capaRef = useRef<HTMLDivElement>(null);
    const reducido = useReducedMotion();

    const votes = useChatStore((s) => s.boardSession?.votes);
    const tally = useChatStore((s) => s.boardSession?.tally);

    const diapositivas = useMemo(
        () => partirEnDiapositivas(content, title),
        [content, title],
    );

    const total = diapositivas.length;
    const actual = diapositivas[Math.min(indice, total - 1)];

    const ir = useCallback(
        (delta: number) => setIndice((i) => Math.min(total - 1, Math.max(0, i + delta))),
        [total],
    );

    /* Pantalla completa y foco. Se piden juntos porque son la misma acción para
       el usuario: «esto pasa a ser lo único que hay en pantalla». */
    useEffect(() => {
        if (!open) return;
        const disparador = document.activeElement as HTMLElement | null;
        const capa = capaRef.current;
        capa?.focus();
        // El rechazo se traga: `requestFullscreen` lanza si el gesto del usuario
        // no cuenta como activación, y eso NO es un fallo que contarle a nadie
        // — la presentación ya está en pantalla.
        void capa?.requestFullscreen?.().catch(() => {});
        return () => {
            if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
            if (disparador && document.contains(disparador)) disparador.focus();
        };
    }, [open]);

    // Abrir siempre empieza por la portada: retomar por donde se dejó tiene
    // sentido en un lector, no en una presentación que se va a dar entera.
    const [abiertaAntes, setAbiertaAntes] = useState(open);
    if (open !== abiertaAntes) {
        setAbiertaAntes(open);
        if (open) setIndice(0);
    }

    /**
     * El teclado va en `document` y en captura, como el de `<Modal>` y por el
     * mismo motivo: mientras se pasan diapositivas el foco puede estar en el
     * botón «Siguiente», y un manejador colgado del contenedor dejaría de ver
     * la barra espaciadora en cuanto el navegador la trate como «pulsa el
     * botón enfocado». Además la presentación es modal, así que no hay nada
     * más que pueda querer estas teclas.
     */
    useEffect(() => {
        if (!open) return;
        const alTeclear = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
            if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); ir(1); return; }
            if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); ir(-1); return; }
            if (e.key === 'Home') { e.preventDefault(); setIndice(0); return; }
            if (e.key === 'End') { e.preventDefault(); setIndice(total - 1); }
        };
        document.addEventListener('keydown', alTeclear, true);
        return () => document.removeEventListener('keydown', alTeclear, true);
    }, [open, onClose, ir, total]);

    // Salir de pantalla completa con la tecla del navegador (F11, o el gesto de
    // iOS) tiene que cerrar la presentación: si no queda una capa que ya no
    // ocupa la pantalla y de la que no está claro cómo se sale.
    //
    // El testigo distingue «nunca llegó a haber pantalla completa» —el caso de
    // Safari, donde cerrar aquí sería cerrar la presentación nada más abrirla—
    // de «la había y se ha salido».
    const huboPantallaCompleta = useRef(false);
    useEffect(() => {
        if (!open) {
            huboPantallaCompleta.current = false;
            return;
        }
        const alCambiar = () => {
            if (document.fullscreenElement) {
                huboPantallaCompleta.current = true;
            } else if (huboPantallaCompleta.current) {
                huboPantallaCompleta.current = false;
                onClose();
            }
        };
        document.addEventListener('fullscreenchange', alCambiar);
        return () => document.removeEventListener('fullscreenchange', alCambiar);
    }, [open, onClose]);

    if (!open || !actual) return null;

    const grado = gradoDeDesacuerdo(votes);

    return (
        <div
            ref={capaRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Presentación: ${title}`}
            tabIndex={-1}
            className="fixed inset-0 z-[120] flex flex-col bg-surface-0 outline-none"
            data-testid="presentacion-acta"
        >
            {/* Barra superior: dónde estamos y cómo se sale. Siempre visible —
                una salida que hay que descubrir moviendo el ratón no es una
                salida en una sala con proyector. */}
            <div className="flex items-center justify-between border-b border-stroke-hairline px-4 py-3 sm:px-8">
                <p className="text-micro uppercase tracking-wide text-content-quiet tnum">
                    {indice + 1} de {total}
                </p>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Salir de la presentación"
                    className="flex h-11 w-11 items-center justify-center rounded-sm text-content-muted hover:bg-stroke-hairline hover:text-content-strong"
                >
                    <X className="h-5 w-5" aria-hidden="true" />
                </button>
            </div>

            {/* La diapositiva. `key` en el índice para que el desvanecido
                ocurra al cambiar; nada más se mueve (§7.4). */}
            <motion.div
                key={actual.id}
                initial={reducido ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={conMovimiento(reducido, { duration: DURACION.reveal, ease: CURVA.settle })}
                className="flex-1 overflow-y-auto px-4 py-8 sm:px-8"
            >
                <div className="mx-auto max-w-3xl">
                    <h1
                        className={cn(
                            'font-semibold tracking-tight text-content-strong',
                            actual.tipo === 'portada' ? 'text-3xl sm:text-5xl' : 'text-2xl sm:text-4xl',
                        )}
                    >
                        {actual.titulo}
                    </h1>

                    {actual.tipo === 'recuento' ? (
                        <div className="mt-8 space-y-6">
                            <p className="text-xl text-content sm:text-2xl">{grado.etiqueta}</p>
                            <DisagreementBar votes={votes} />
                            <dl className="grid grid-cols-3 gap-4 text-center">
                                {([
                                    ['A favor', grado.recuento.SI],
                                    ['Condicional', grado.recuento.CONDICIONAL],
                                    ['En contra', grado.recuento.NO],
                                ] as const).map(([etiqueta, n]) => (
                                    <div key={etiqueta} className="rounded-sm border border-stroke-hairline p-4">
                                        <dt className="text-micro uppercase text-content-muted">{etiqueta}</dt>
                                        <dd className="mt-1 font-mono text-3xl text-content-strong tnum">{n}</dd>
                                    </div>
                                ))}
                            </dl>
                            {grado.total === 0 && !tally && (
                                <p className="text-sm text-content-muted">
                                    Esta junta no dejó votos registrados.
                                </p>
                            )}
                        </div>
                    ) : (
                        actual.cuerpo && (
                            <div className="doc-prose mt-8 text-lg sm:text-xl">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{actual.cuerpo}</ReactMarkdown>
                            </div>
                        )
                    )}
                </div>
            </motion.div>

            {/* Navegación. Botones grandes: a 390px son el único camino, y una
                presentación que sólo avanza con ←/→ no se da desde un móvil. */}
            <div className="flex items-center justify-between gap-4 border-t border-stroke-hairline px-4 py-3 sm:px-8">
                <button
                    type="button"
                    onClick={() => ir(-1)}
                    disabled={indice === 0}
                    className="flex h-11 items-center gap-2 rounded-sm border border-stroke-control px-4 text-sm text-content disabled:border-stroke-hairline disabled:text-content-quiet"
                >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    Anterior
                </button>
                <p className="sr-only" aria-live="polite" aria-atomic="true">
                    Diapositiva {indice + 1} de {total}: {actual.titulo}
                </p>
                <button
                    type="button"
                    onClick={() => ir(1)}
                    disabled={indice === total - 1}
                    className="flex h-11 items-center gap-2 rounded-sm border border-stroke-control px-4 text-sm text-content disabled:border-stroke-hairline disabled:text-content-quiet"
                >
                    Siguiente
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
            </div>
        </div>
    );
}
