/**
 * Búsqueda difusa sobre listas cortas — PLAN §6 Q4.
 *
 * Sin dependencias a propósito: lo que hay que buscar son las sesiones del
 * historial, cinco directores, cinco secciones de ajustes y un puñado de
 * acciones. Son decenas de cadenas, no miles: un índice invertido aquí sería
 * más código del que ahorra.
 *
 * Dos reglas que sí importan:
 *
 * - **Se ignoran los acentos.** «análisis» tiene que encontrarse escribiendo
 *   «analisis», que es como se teclea con prisa. Es el mismo criterio que ya
 *   usa el buscador del historial (D10).
 * - **La coincidencia es por subsecuencia**, o sea que «prc» encuentra
 *   «Estrategia de PReCios». Pero la puntuación premia lo contiguo y lo que
 *   empieza palabra, para que escribir «pre» no ponga primero un resultado
 *   donde las tres letras están desperdigadas.
 */

export function normalizar(v: string): string {
    return v.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

/**
 * Puntúa una candidata contra la consulta. `null` si no coincide.
 * Más alto es mejor.
 */
export function puntuar(texto: string, consulta: string): number | null {
    const t = normalizar(texto);
    const q = normalizar(consulta);
    if (q.length === 0) return 0;

    // Coincidencia literal: siempre gana, y más si abre la cadena.
    const literal = t.indexOf(q);
    if (literal === 0) return 1000 - t.length;
    if (literal > 0) return 800 - literal - t.length / 10;

    let i = 0;
    let puntos = 0;
    let anterior = -1;
    for (let c = 0; c < t.length && i < q.length; c++) {
        if (t[c] !== q[i]) continue;
        // Contiguo con la letra anterior: la consulta es un trozo de palabra.
        if (anterior === c - 1) puntos += 12;
        // Empieza palabra: «gtm» sobre «Go-To-Market».
        else if (c === 0 || t[c - 1] === ' ' || t[c - 1] === '-') puntos += 8;
        else puntos += 2;
        anterior = c;
        i++;
    }
    if (i < q.length) return null;
    // Penaliza lo largo: entre dos que casan, gana la cadena más ceñida.
    return puntos - t.length / 20;
}

export interface Puntuado<T> {
    item: T;
    puntos: number;
}

/**
 * Filtra y ordena. Con la consulta vacía devuelve la lista tal cual, que es lo
 * que hace útil abrir la paleta sin escribir nada: enseña lo reciente.
 */
export function filtrarDifuso<T>(
    items: T[],
    consulta: string,
    clave: (item: T) => string,
): T[] {
    if (!consulta.trim()) return items;
    const puntuados: Puntuado<T>[] = [];
    for (const item of items) {
        const puntos = puntuar(clave(item), consulta);
        if (puntos !== null) puntuados.push({ item, puntos });
    }
    // `sort` estable en todos los motores desde ES2019: a igualdad de puntos se
    // conserva el orden de entrada, que para las sesiones es el cronológico.
    return puntuados.sort((a, b) => b.puntos - a.puntos).map((p) => p.item);
}
