/**
 * Las juntas programadas se guardan en UTC. Aquí se traducen a la hora del
 * reloj de quien las lee (D69/D70).
 *
 * Dos defectos, uno encima del otro:
 *
 * **D70** — «cada Lunes a las 9:00 UTC» era todo lo que la pantalla decía. En
 * Madrid en verano eso son las 11:00; en Ciudad de México, las 3 de la
 * madrugada. Quien programa una junta la programa para SU mañana, y el único
 * número que veía era otro.
 *
 * **D69** — la lista de días empezaba en lunes (`["Lunes", …][0]`) mientras
 * `cron` y `Date.getDay()` de JavaScript numeran empezando en domingo. Elegir
 * «Lunes» mandaba un `0`, y un `0` es domingo: un día entero de desfase.
 * Aquí `DIAS` está indexado como lo indexan `cron` y JavaScript, y hay un test
 * que lo fija.
 *
 * ADVERTENCIA para quien venga detrás: la convención del BACKEND no se ha
 * podido comprobar —`/me/scheduled-boards` no aparece en el repositorio del
 * backend accesible desde aquí—. Se ha adoptado la de `cron`/JS porque es la
 * que el propio hallazgo D69 nombra como correcta. Si el backend resulta usar
 * la de Python (`weekday()`, 0 = lunes), lo que hay que cambiar es este
 * fichero y su test, y nada más: nadie más numera días.
 */

/** Domingo = 0, como `cron` y como `Date.prototype.getDay()`. */
export const DIAS = [
    'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado',
] as const;

/**
 * Un domingo cualquiera a las 00:00 UTC. Sirve de origen para convertir un
 * par (día de la semana, hora UTC) a hora local sin arrastrar una fecha real:
 * el 7 de enero de 2024 fue domingo.
 */
const DOMINGO_DE_REFERENCIA = Date.UTC(2024, 0, 7);

export interface MomentoLocal {
    /** 0-23 en el huso del navegador. */
    hora: number;
    /** Domingo = 0, ya corregido si el cambio de huso cruza la medianoche. */
    dia: number;
    /** ¿La conversión ha movido el día? Lo que hace que D70 importe. */
    cambiaDeDia: boolean;
}

/**
 * Convierte (día UTC, hora UTC) al reloj local.
 *
 * @param diaUtc  Domingo = 0. Si se omite, se usa el domingo de referencia y
 *                sólo el campo `hora` del resultado tiene sentido.
 */
export function aHoraLocal(horaUtc: number, diaUtc = 0): MomentoLocal {
    const d = new Date(DOMINGO_DE_REFERENCIA);
    d.setUTCDate(d.getUTCDate() + diaUtc);
    d.setUTCHours(horaUtc, 0, 0, 0);
    return {
        hora: d.getHours(),
        dia: d.getDay(),
        cambiaDeDia: d.getDay() !== ((diaUtc % 7) + 7) % 7,
    };
}

/** `9` → `«09:00»`. */
export function dosDigitos(hora: number): string {
    return `${String(hora).padStart(2, '0')}:00`;
}

/**
 * La frase que se lee: la hora de tu reloj primero, la de UTC entre
 * paréntesis, porque es la que el servidor guarda y la que hay que teclear
 * para cambiarla.
 *
 * `cada Lunes a las 11:00 (09:00 UTC)`
 * `cada día a las 11:00 (09:00 UTC)`
 */
export function describeCadencia(
    cadencia: 'daily' | 'weekly' | string,
    horaUtc: number,
    diaUtc: number | null | undefined,
): string {
    if (cadencia === 'daily') {
        const { hora } = aHoraLocal(horaUtc);
        return `cada día a las ${dosDigitos(hora)} (${dosDigitos(horaUtc)} UTC)`;
    }
    const utc = diaUtc ?? 0;
    const { hora, dia } = aHoraLocal(horaUtc, utc);
    return `cada ${DIAS[dia]} a las ${dosDigitos(hora)} (${DIAS[utc]} ${dosDigitos(horaUtc)} UTC)`;
}

/** El nombre del huso del navegador, para decir de qué reloj hablamos. */
export function husoLocal(): string {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'tu huso horario';
    } catch {
        return 'tu huso horario';
    }
}
