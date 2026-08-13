/**
 * Diff por palabras — PLAN §6 Q12 (tarea 5.11).
 *
 * Dos versiones de una respuesta de junta son dos textos largos que se parecen
 * mucho: lo que el usuario quiere ver es QUÉ cambió, no leerlas enteras dos
 * veces. Un diff por líneas no sirve —un párrafo reescrito es una sola línea
 * distinta, o sea «todo cambió»—, así que la unidad es la palabra.
 *
 * El algoritmo es la subsecuencia común más larga con programación dinámica.
 * Es O(n·m) en tiempo y memoria, y por eso hay un tope: dos turnos de junta son
 * unos cientos de palabras cada uno —el caso normal, ~200×200 = 40.000 celdas,
 * inmediato—, pero un turno degenerado de diez mil palabras haría cien millones
 * y congelaría la pestaña. Pasado el tope se dice que son demasiado largos y se
 * ofrecen enteros, que informa igual y no bloquea nada.
 *
 * Sin dependencias a propósito: `diff`/`jsdiff` son 30 KB para una función que
 * aquí cabe en cuarenta líneas y sólo se usa en un sitio.
 */

export type TipoDeTrozo = 'igual' | 'anadido' | 'quitado';

export interface Trozo {
    tipo: TipoDeTrozo;
    texto: string;
}

/** Palabras máximas por lado. Ver la cabecera para el porqué del número. */
export const TOPE_DE_PALABRAS = 1200;

/** Parte conservando los espacios, para poder reconstruir el texto tal cual. */
function enPalabras(texto: string): string[] {
    return texto.split(/(\s+)/).filter((t) => t !== '');
}

/**
 * Compara dos textos y devuelve los trozos en orden.
 * Devuelve `null` si son demasiado largos para compararlos sin bloquear.
 */
export function diffPorPalabras(antes: string, despues: string): Trozo[] | null {
    const a = enPalabras(antes);
    const b = enPalabras(despues);
    if (a.length > TOPE_DE_PALABRAS || b.length > TOPE_DE_PALABRAS) return null;

    // Tabla de longitudes de la subsecuencia común más larga.
    const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
        new Array<number>(b.length + 1).fill(0),
    );
    for (let i = a.length - 1; i >= 0; i--) {
        for (let j = b.length - 1; j >= 0; j--) {
            lcs[i][j] = a[i] === b[j]
                ? lcs[i + 1][j + 1] + 1
                : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
        }
    }

    const trozos: Trozo[] = [];
    // Los trozos contiguos del mismo tipo se funden: un diff que pinta palabra
    // a palabra con su propio fondo es ilegible.
    const empujar = (tipo: TipoDeTrozo, texto: string) => {
        const ultimo = trozos[trozos.length - 1];
        if (ultimo && ultimo.tipo === tipo) ultimo.texto += texto;
        else trozos.push({ tipo, texto });
    };

    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) {
            empujar('igual', a[i]);
            i++; j++;
        } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
            empujar('quitado', a[i]);
            i++;
        } else {
            empujar('anadido', b[j]);
            j++;
        }
    }
    while (i < a.length) empujar('quitado', a[i++]);
    while (j < b.length) empujar('anadido', b[j++]);

    return trozos;
}

/** Cuántas palabras cambiaron, para poder resumirlo en una línea. */
export function resumenDeCambios(trozos: Trozo[]): { anadidas: number; quitadas: number } {
    const contar = (t: Trozo) => t.texto.trim().split(/\s+/).filter(Boolean).length;
    let anadidas = 0;
    let quitadas = 0;
    for (const trozo of trozos) {
        if (trozo.tipo === 'anadido') anadidas += contar(trozo);
        else if (trozo.tipo === 'quitado') quitadas += contar(trozo);
    }
    return { anadidas, quitadas };
}
