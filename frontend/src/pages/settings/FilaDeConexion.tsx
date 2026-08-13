/**
 * 6.8 — una fila del acordeón de Conexiones.
 *
 * Patrón de la APG: la cabecera es un `<button>` dentro de un encabezado, con
 * `aria-expanded` y `aria-controls`, y el panel es una `region` etiquetada por
 * ella. El estado NO se comunica sólo por el ángulo del galón (principio P5):
 * el rótulo —«Conectado», «Sin configurar»— es texto, y el galón acompaña.
 *
 * El estado de apertura NO vive aquí: llega en `control` desde
 * `ConnectionsSettings`, porque la regla es «un solo servicio abierto en toda
 * la página» y las filas se reparten entre dos mitades distintas.
 */
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { ControlDeAcordeon } from '@/pages/settings/conexionesAcordeon';

export interface FilaDeConexionProps {
    id: string;
    control: ControlDeAcordeon;
    icono: ReactNode;
    titulo: string;
    descripcion?: string;
    /** Rótulo del estado. Texto, no color: es la respuesta a «¿está puesto?». */
    estado: { texto: string; tono: 'ok' | 'medio' | 'pendiente' };
    children: ReactNode;
}

const TONOS = {
    ok: 'border-success/40 bg-success/12 text-success',
    medio: 'border-info/40 bg-info/12 text-info',
    pendiente: 'border-stroke-edge bg-surface-inset text-content-muted',
} as const;

export function FilaDeConexion({
    id,
    control,
    icono,
    titulo,
    descripcion,
    estado,
    children,
}: FilaDeConexionProps) {
    const abierto = control.abierto === id;
    const idPanel = `conexion-panel-${id}`;
    const idCabecera = `conexion-cabecera-${id}`;

    return (
        <div className="overflow-hidden rounded-md border border-stroke-edge bg-surface-2">
            <h3>
                <button
                    type="button"
                    id={idCabecera}
                    aria-expanded={abierto}
                    aria-controls={idPanel}
                    onClick={() => control.alternar(id)}
                    className={cn(
                        'flex w-full items-center gap-3 px-4 py-3 text-start transition-colors',
                        'hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-(--focus-ring)',
                        abierto && 'bg-surface-1',
                    )}
                >
                    <span className="shrink-0 text-content-muted">{icono}</span>
                    <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-content-strong">{titulo}</span>
                        {descripcion && (
                            <span className="mt-0.5 line-clamp-1 block text-xs text-content-muted">
                                {descripcion}
                            </span>
                        )}
                    </span>
                    <span
                        className={cn(
                            'shrink-0 rounded-xs border px-2 py-0.5 text-micro uppercase',
                            TONOS[estado.tono],
                        )}
                    >
                        {estado.texto}
                    </span>
                    <ChevronDown
                        aria-hidden="true"
                        className={cn(
                            'h-4 w-4 shrink-0 text-content-quiet transition-transform duration-(--duration-tap)',
                            abierto && 'rotate-180',
                        )}
                    />
                </button>
            </h3>
            {abierto && (
                <div
                    id={idPanel}
                    role="region"
                    aria-labelledby={idCabecera}
                    className="space-y-4 border-t border-stroke-hairline p-4 sm:p-5"
                >
                    {children}
                </div>
            )}
        </div>
    );
}
