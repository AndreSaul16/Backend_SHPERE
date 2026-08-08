/**
 * 6.5 — la barra de guardado adherida.
 *
 * El problema que resuelve es de distancia física: en `ProfileSettings` el
 * botón «Guardar» vivía al final de un formulario de cinco secciones y
 * diecinueve controles. Quien cambiaba la moneda base —tercera sección— tenía
 * que desplazarse hasta abajo para guardar, y si se le olvidaba, el diálogo de
 * salida (D63) le decía «tienes cambios» sin decirle cuántos ni cuáles. En
 * `AgentDetailPage` el botón estaba arriba, o sea el mismo problema al revés.
 *
 * La barra va **adherida al canto inferior** del contenedor con scroll: guardar
 * se puede desde cualquier posición del formulario, que es el criterio. Y dice
 * el número, no el hecho: «3 cambios sin guardar» le dice al usuario que le
 * queda algo por revisar; «hay cambios» no le dice nada que no supiera.
 *
 * §12.6: el recuento vive además en una región `aria-live="polite"` para que la
 * cuenta exista sin verla. Se anuncia el número, no cada pulsación: la región
 * es `atomic` y el texto sólo cambia cuando cambia el recuento.
 */
import { Loader2, Save, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { frasePendiente } from '@/lib/cambiosSinGuardar';
import { cn } from '@/lib/utils';

export interface BarraDeGuardadoProps {
    /** Cuántos campos difieren de lo guardado. 0 = nada pendiente. */
    cambios: number;
    guardando: boolean;
    onGuardar: () => void;
    /** Descartar y volver a lo último guardado. Opcional. */
    onDescartar?: () => void;
    /** Momento del último guardado con éxito, para el acuse. */
    guardadoEn?: number | null;
    /** Qué se guarda, para el texto accesible. Ej.: «tu perfil». */
    objeto: string;
    className?: string;
    'data-testid'?: string;
}

export function BarraDeGuardado({
    cambios,
    guardando,
    onGuardar,
    onDescartar,
    guardadoEn,
    objeto,
    className,
    'data-testid': testId = 'barra-de-guardado',
}: BarraDeGuardadoProps) {
    const pendiente = cambios > 0;
    const acuse = !pendiente && !guardando && guardadoEn != null;

    return (
        <div
            data-testid={testId}
            className={cn(
                // `sticky bottom-0` y no `fixed`: la barra pertenece al
                // formulario, no a la ventana. Con `fixed` tapaba el pie de las
                // páginas que no la tienen y se quedaba flotando sobre los
                // modales.
                // Relleno macizo, no translúcido: §0 descarta el `backdrop-blur`
                // decorativo, y una barra semitransparente sin desenfoque sobre
                // texto que pasa por debajo es ilegible.
                'sticky bottom-0 z-10 -mx-4 mt-6 flex items-center gap-3 border-t border-stroke-edge',
                'bg-surface-1 px-4 py-3 shadow-e2 sm:-mx-6 sm:px-6 md:-mx-8 md:px-8',
                className,
            )}
        >
            <p className="min-w-0 flex-1 text-sm">
                {guardando ? (
                    <span className="text-content-muted">Guardando…</span>
                ) : pendiente ? (
                    <span className="font-medium text-content-strong">{frasePendiente(cambios)}</span>
                ) : acuse ? (
                    <span className="text-success">Guardado</span>
                ) : (
                    <span className="text-content-quiet">Sin cambios pendientes</span>
                )}
            </p>

            {onDescartar && pendiente && !guardando && (
                <Button variant="ghost" size="sm" onClick={onDescartar}>
                    <Undo2 className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden sm:inline">Descartar</span>
                </Button>
            )}

            <Button
                variant="primary"
                size="sm"
                onClick={onGuardar}
                disabled={guardando || !pendiente}
                aria-busy={guardando}
            >
                {guardando ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                    <Save className="h-4 w-4" aria-hidden="true" />
                )}
                Guardar
            </Button>

            <p className="sr-only" aria-live="polite" aria-atomic="true">
                {guardando
                    ? `Guardando ${objeto}…`
                    : pendiente
                        ? `${frasePendiente(cambios)} en ${objeto}.`
                        : acuse
                            ? `${objeto}: guardado.`
                            : ''}
            </p>
        </div>
    );
}
