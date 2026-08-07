import type { ReactNode } from 'react';

/**
 * Tabla de documento con su propio contenedor de desplazamiento — DESIGN §9.7
 * y §12.12.
 *
 * F4: `.doc-prose table` es `inline-size:100%` sin envoltorio, así que una tabla
 * de cuatro columnas reventaba la hoja del acta: a 390px se veían 2 de 4
 * columnas y 138px de contenido quedaban fuera de vista **sin ninguna señal de
 * que existieran**. §4.2 es explícita: la medida real es el ancho disponible y
 * nunca se fuerza con desbordamiento; §9.7 prescribe literalmente el remedio:
 * «contenedor propio con `overflow-x: auto` **y** `tabindex="0"` +
 * `role="region"` + `aria-label` para que se pueda desplazar con teclado».
 *
 * El `tabIndex` es lo que hace que la tabla exista para quien no usa ratón: un
 * contenedor desplazable sin foco es contenido inalcanzable.
 */
export function DocTable({ children }: { children?: ReactNode }) {
    return (
        <div
            role="region"
            aria-label="Tabla, desplazable en horizontal"
            tabIndex={0}
            className="doc-table-scroll"
        >
            <table>{children}</table>
        </div>
    );
}
