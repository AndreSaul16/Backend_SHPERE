/**
 * Los tiempos del reproductor de debate — PLAN §6 Q7 (tarea 5.10).
 *
 * Viven aparte del componente por la regla `react-refresh/only-export-components`
 * —un fichero de componente no puede exportar además constantes— y porque el
 * único trozo del reproductor que se puede probar sin montar nada es
 * precisamente cuánto dura cada turno.
 */

/** Las tres velocidades que pide Q7. */
export const VELOCIDADES = [1, 2, 8] as const;
export type Velocidad = (typeof VELOCIDADES)[number];

/**
 * Milisegundos por carácter a 1×, y los topes por turno.
 *
 * La duración sale de la LONGITUD y no de un valor fijo: un turno de tres
 * líneas y otro de veinte no tardan lo mismo en leerse, y con un tiempo
 * constante el replay se lee como un pase de diapositivas en vez de como un
 * debate. Los topes existen para los dos extremos: un «De acuerdo.» que
 * pasaría desapercibido y un turno kilométrico que dejaría la reproducción
 * clavada medio minuto.
 */
const MS_POR_CARACTER = 22;
const MINIMO_MS = 700;
const MAXIMO_MS = 6000;

export function duracionDeTurno(contenido: string, velocidad: Velocidad): number {
    const base = Math.min(MAXIMO_MS, Math.max(MINIMO_MS, contenido.length * MS_POR_CARACTER));
    return Math.round(base / velocidad);
}
