/**
 * Tema de la interfaz — tarea 6.11, cierra D61. DESIGN §2.6 (papel), §13.
 *
 * El contrato de tokens trae el tema claro completo desde la fase 0
 * (`[data-theme="light"]` en `index.css`), pero **nadie ponía el atributo**: el
 * bloque llevaba cinco fases siendo CSS muerto y el `<select>` de Ajustes
 * ofrecía «Claro» y «Sistema» sin que ninguna de las dos hiciera nada. Eso es
 * D61: una opción que miente.
 *
 * Tres estados y no dos, porque son tres cosas distintas:
 *
 *   - `dark`   — quiero paño, decida lo que decida el sistema.
 *   - `light`  — quiero papel, decida lo que decida el sistema.
 *   - `system` — que lo decida el sistema, y que **cambie conmigo** cuando el
 *                móvil pase a modo noche a las ocho de la tarde.
 *
 * `system` es el valor de partida. No es neutralidad: es que el usuario ya ha
 * tomado esa decisión una vez, en su sistema operativo, y volver a preguntarla
 * es no haberla escuchado.
 *
 * **Dónde vive.** En dos sitios a la vez, y a propósito:
 *
 *   - `localStorage`, que es la autoridad al arrancar. Es lo único que se puede
 *     leer ANTES del primer pintado; sin eso hay un fogonazo de paño en una
 *     pantalla que iba a ser de papel, y al revés, en cada carga.
 *   - `ui_preferences.theme` del perfil, que ya existía en el backend, para que
 *     una sesión en un aparato nuevo herede la última elección de la cuenta en
 *     vez de empezar de cero.
 *
 * La regla de precedencia es la del arranque: manda lo local, y el perfil sólo
 * se adopta cuando aquí no hay nada. Un aparato compartido no debe reescribirle
 * el tema al portátil de al lado.
 *
 * Todo acceso a `localStorage` va envuelto: en Safari privado existe y LANZA al
 * escribir (mismo motivo que en `densidad.ts` y `useDraft`).
 */

export type Tema = 'system' | 'dark' | 'light';
/** Lo que de verdad se pinta. `system` se resuelve a uno de estos dos. */
export type TemaEfectivo = 'dark' | 'light';

export const CLAVE_TEMA = 'sphere:tema';
export const TEMA_POR_DEFECTO: Tema = 'system';

/** `baize-950` y `paper-100`: el color de la barra del navegador en móvil. */
const COLOR_DE_BARRA: Record<TemaEfectivo, string> = {
    dark: '#060F09',
    light: '#F2EDE3',
};

export function esTema(v: unknown): v is Tema {
    return v === 'system' || v === 'dark' || v === 'light';
}

/** Lo guardado en ESTE aparato, o `null` si no hay nada (o hay basura). */
export function leerTemaGuardado(): Tema | null {
    try {
        const guardado = window.localStorage.getItem(CLAVE_TEMA);
        return esTema(guardado) ? guardado : null;
    } catch {
        return null;
    }
}

export function leerTema(): Tema {
    return leerTemaGuardado() ?? TEMA_POR_DEFECTO;
}

/** ¿Qué prefiere el sistema? Sin `matchMedia` (jsdom viejo, algún WebView), oscuro. */
export function preferenciaDelSistema(): TemaEfectivo {
    try {
        return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    } catch {
        return 'dark';
    }
}

/** El tema que toca pintar ahora mismo. */
export function temaEfectivo(tema: Tema = leerTema()): TemaEfectivo {
    return tema === 'system' ? preferenciaDelSistema() : tema;
}

/**
 * Pinta el tema en el elemento raíz.
 *
 * Se escribe SIEMPRE el atributo, también para el oscuro, aunque el `dark` del
 * CSS esté definido como «no ser claro» y funcionaría sin él. Dos razones: la
 * regla `html[data-theme="light"]{color-scheme:light}` necesita su pareja para
 * que el navegador pinte de su color las barras de scroll y los controles
 * nativos, y un atributo siempre presente convierte «¿en qué tema estoy?» en
 * una sola pregunta al DOM en vez de en dos.
 */
function pintar(efectivo: TemaEfectivo): void {
    document.documentElement.setAttribute('data-theme', efectivo);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', COLOR_DE_BARRA[efectivo]);
}

/** Fija el tema, lo recuerda en este aparato y lo pinta. */
export function aplicarTema(tema: Tema): void {
    pintar(temaEfectivo(tema));
    try {
        window.localStorage.setItem(CLAVE_TEMA, tema);
    } catch {
        /* Sin almacenamiento: vale para esta sesión y ya. */
    }
}

/**
 * Adopta la elección de la cuenta, pero sólo si este aparato no tiene la suya.
 *
 * Se llama cuando llega el perfil del backend. Sin la comprobación, entrar en
 * Ajustes te cambiaría el tema del portátil por el que elegiste en el móvil.
 */
export function adoptarTemaDelPerfil(tema: unknown): void {
    if (!esTema(tema)) return;
    if (leerTemaGuardado() !== null) return;
    aplicarTema(tema);
}

/**
 * Se llama una vez al arrancar, ANTES del primer pintado.
 *
 * Devuelve la función de baja del oyente de `prefers-color-scheme`: en `system`
 * el tema tiene que seguir al sistema en caliente, sin recargar. El oyente vive
 * siempre (no sólo en `system`) porque cambiar entre modos no debe suponer
 * montar y desmontar suscripciones; la comprobación se hace al disparar.
 */
export function inicializarTema(): () => void {
    pintar(temaEfectivo());

    let consulta: MediaQueryList | null = null;
    try {
        consulta = window.matchMedia?.('(prefers-color-scheme: light)') ?? null;
    } catch {
        consulta = null;
    }
    if (!consulta) return () => { /* sin matchMedia no hay a qué seguir */ };

    const alCambiar = () => {
        // Sólo `system` sigue al sistema. Quien ha elegido explícitamente no
        // quiere que el reloj del móvil le cambie la pantalla.
        if (leerTema() === 'system') pintar(preferenciaDelSistema());
    };

    consulta.addEventListener('change', alCambiar);
    return () => consulta.removeEventListener('change', alCambiar);
}
