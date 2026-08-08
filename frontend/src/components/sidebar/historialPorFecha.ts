import type { ChatSession } from '@/types';

/**
 * El historial agrupado por fecha (tarea 3.6).
 *
 * La lista era plana y cada fila repetía su fecha completa debajo del título:
 * con veinte juntas, veinte fechas idénticas y ninguna forma de ver de un
 * vistazo qué es de hoy. Agrupar mueve la fecha del ruido al encabezado y deja
 * el título solo en la fila.
 *
 * Vive en su propio módulo porque es lógica pura y con test propio, y porque la
 * regla `react-refresh/only-export-components` no deja exportar funciones desde
 * un fichero de componente.
 */
export interface GrupoDeHistorial {
    clave: string;
    etiqueta: string;
    sesiones: ChatSession[];
}

const DIA = 86_400_000;

/** Medianoche local del día de `d`: comparar por día, no por instante. */
function aMedianoche(d: Date): number {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Reparte las juntas en cubos por antigüedad, del más reciente al más antiguo.
 * Los cubos vacíos no salen: un encabezado sin filas debajo es una promesa
 * incumplida.
 *
 * `ahora` es parámetro para que el test no dependa del reloj de quien lo corre.
 */
export function agruparPorFecha(sesiones: ChatSession[], ahora: Date = new Date()): GrupoDeHistorial[] {
    const hoy = aMedianoche(ahora);
    const cubos: { clave: string; etiqueta: string; desde: number }[] = [
        { clave: 'hoy', etiqueta: 'Hoy', desde: hoy },
        { clave: 'ayer', etiqueta: 'Ayer', desde: hoy - DIA },
        { clave: 'semana', etiqueta: 'Los últimos 7 días', desde: hoy - 7 * DIA },
        { clave: 'mes', etiqueta: 'Los últimos 30 días', desde: hoy - 30 * DIA },
        { clave: 'antes', etiqueta: 'Antes', desde: Number.NEGATIVE_INFINITY },
    ];

    const porClave = new Map<string, ChatSession[]>();
    // De más reciente a más antigua: el orden dentro del grupo también importa.
    const ordenadas = [...sesiones].sort(
        (a, b) => marca(b.created_at) - marca(a.created_at),
    );

    for (const s of ordenadas) {
        const t = marca(s.created_at);
        // Una fecha ilegible no puede tirar la barra lateral entera: cae en
        // «Antes», que es lo único cierto que se puede decir de ella.
        const dia = Number.isFinite(t) ? aMedianoche(new Date(t)) : Number.NEGATIVE_INFINITY;
        const cubo = cubos.find((c) => dia >= c.desde) ?? cubos[cubos.length - 1];
        const lista = porClave.get(cubo.clave);
        if (lista) lista.push(s);
        else porClave.set(cubo.clave, [s]);
    }

    return cubos
        .filter((c) => porClave.has(c.clave))
        .map((c) => ({ clave: c.clave, etiqueta: c.etiqueta, sesiones: porClave.get(c.clave)! }));
}

function marca(fecha: string): number {
    const t = new Date(fecha).getTime();
    return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
}
