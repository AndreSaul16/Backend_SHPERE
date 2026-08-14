/**
 * La aritmética de la Pluma del Acta — DESIGN §8.8.
 *
 * «Un trazo de pluma que avanza con cada chunk recibido y se reinicia, como una
 * línea manuscrita que llena renglones.»
 *
 * Vive aparte del componente por dos razones. La primera es la regla
 * `react-refresh/only-export-components`, que no deja que un fichero de
 * componente exporte además constantes. La segunda importa más: esto es la
 * única pieza con aritmética del efecto, y probarla sin DOM es lo que mantiene
 * defendida la propiedad que de verdad se contrata — que el avance es una
 * función del NÚMERO DE TROZOS RECIBIDOS y de nada más. Ni del tiempo, ni del
 * tamaño del texto, ni de una estimación de cuánto falta: de los trozos que han
 * llegado de verdad.
 */

/**
 * Cuántos trozos llenan un renglón.
 *
 * Doce es un número elegido, no medido, y no puede medirse: el backend no dice
 * cuántos trozos va a mandar ni cuánto ocupa cada uno, así que no existe el
 * «cuánto falta» que haría de esto una barra de progreso. Y ése es justamente
 * el motivo de que la pluma llene RENGLONES en vez de completar un porcentaje:
 * un renglón que se llena y vuelve a empezar dice «se está escribiendo», que es
 * verdad, mientras que una barra al 60% diría «queda el 40%», que sería mentira.
 */
export const CHUNKS_POR_RENGLON = 12;

/**
 * Dónde está el trazo, de 0 a 1.
 *
 * `completa` gana sobre todo lo demás: cerrado el artefacto, la regla se llena
 * entera y da paso al sello (§8.3), diga lo que diga el renglón a medias.
 */
export function avanceDeLaPluma(chunks: number, completa: boolean): number {
    if (completa) return 1;
    if (chunks <= 0) return 0;
    // `(n-1) % k + 1` y no `n % k`: con el resto pelado, el trozo que JUSTO
    // termina el renglón daría 0, o sea que el renglón se completaría sin verse
    // nunca lleno. Así el duodécimo trozo llena la línea y el decimotercero la
    // empieza de nuevo.
    return (((chunks - 1) % CHUNKS_POR_RENGLON) + 1) / CHUNKS_POR_RENGLON;
}
