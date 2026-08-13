/**
 * 6.8 — el estado del acordeón de Conexiones y su buscador.
 *
 * Conexiones apila **diez servicios** (cuatro OAuth y seis credenciales de
 * herramienta), cada uno con su formulario desplegado a la vez: la página medía
 * cerca de seis pantallas y para tocar la clave de Instagram había que
 * atravesar GitHub, Notion, Slack, Google, Calendar, LinkedIn y WhatsApp. Y con
 * todo abierto no había forma de ver de un vistazo qué estaba conectado y qué
 * no, que es la única pregunta que la gente trae a esta página.
 *
 * El estado de apertura vive **arriba**, en `ConnectionsSettings`, y no dentro
 * de cada mitad: si cada una llevara el suyo se podría acabar con un servicio
 * OAuth y otro de credenciales abiertos a la vez, que es exactamente lo que el
 * criterio prohíbe («un solo servicio abierto»). Los datos siguen viviendo en
 * cada mitad, que es donde estaban: aquí sólo viajan la apertura y el filtro.
 *
 * Patrón de la APG: cada cabecera es un `<button>` dentro de un encabezado, con
 * `aria-expanded` y `aria-controls`. El estado NO se comunica sólo por el
 * ángulo del galón (P5): el rótulo del estado —«Conectado», «Sin configurar»—
 * es texto, y el galón sólo acompaña.
 */
import { useState } from 'react';

/** Lo que `ConnectionsSettings` pasa a cada mitad. */
export interface ControlDeAcordeon {
    /** Id del único servicio abierto, en toda la página. */
    abierto: string | null;
    /** Abre uno y cierra el que hubiera; si ya estaba abierto, lo cierra. */
    alternar: (id: string) => void;
    /** Texto del buscador, ya normalizado a minúsculas y sin acentos. */
    filtro: string;
}

/**
 * El control efectivo de una mitad.
 *
 * Si `ConnectionsSettings` la compone, manda el control de arriba y la regla de
 * «uno solo abierto» vale para las diez filas. Si la mitad se monta sola —los
 * tests lo hacen, y nada impide que una pantalla futura la reutilice— se
 * gobierna a sí misma en vez de reventar. Es el patrón controlado/no controlado
 * de toda la vida; lo que NO se hace es tener dos estados a la vez.
 */
export function useControlDeAcordeon(externo?: ControlDeAcordeon): ControlDeAcordeon {
    const [abierto, setAbierto] = useState<string | null>(null);
    if (externo) return externo;
    return {
        abierto,
        alternar: (id) => setAbierto((actual) => (actual === id ? null : id)),
        filtro: '',
    };
}

/** Quita acentos y baja a minúsculas: buscar «calendario» debe encontrar «Calendário». */
export function normalizar(texto: string): string {
    return texto
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

/** ¿Este servicio sobrevive al filtro? Sin filtro, todos. */
export function pasaElFiltro(filtro: string, ...campos: (string | undefined)[]): boolean {
    if (!filtro) return true;
    return campos.some((c) => c && normalizar(c).includes(filtro));
}


