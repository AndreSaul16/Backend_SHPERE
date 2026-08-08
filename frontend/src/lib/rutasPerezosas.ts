/**
 * El catálogo de módulos de ruta, en un solo sitio (tarea 4.1 · D17a).
 *
 * Existe para que la PRECARGA y el `React.lazy` de `App.tsx` pidan literalmente
 * el mismo especificador. Si cada uno escribiera su `import('@/pages/...')` por
 * su cuenta, un cambio de ruta en uno y no en el otro dejaría dos trozos con el
 * mismo código y la precarga calentaría el que no se va a usar — un fallo que
 * no rompe nada y por eso no se descubre nunca.
 *
 * Es un `.ts` sin JSX a propósito: aquí no se define ningún componente, sólo
 * funciones que devuelven promesas de módulo. Así el refresco en caliente de
 * Vite sigue funcionando en `App.tsx` y en las páginas.
 *
 * Por qué precargar (riesgo R3 del plan): con las rutas partidas, pulsar
 * «Configuración» en el rail abre una petición de red ANTES de poder pintar
 * nada, y en una conexión lenta eso se ve como un parpadeo de esqueleto. El
 * puntero llega al enlace cientos de milisegundos antes que el clic, y el foco
 * de teclado igual: ese hueco es gratis y es justo el que hace falta.
 */

/** Cada ruta perezosa y cómo se pide su módulo. */
export const MODULOS_DE_RUTA = {
    chat: () => import('@/components/chat/ChatPanel'),
    panelDeArtefactos: () => import('@/components/artifacts/ArtifactPanel'),
    perfil: () => import('@/pages/ProfilePage'),
    ajustesDeConversacion: () => import('@/pages/ChatSettingsPage'),
    detalleDeAgente: () => import('@/pages/AgentDetailPage'),
    ajustes: () => import('@/pages/SettingsPage'),
    facturacion: () => import('@/pages/BillingPage'),
    admin: () => import('@/pages/AdminPage'),
    entrar: () => import('@/pages/LoginPage'),
    registro: () => import('@/pages/RegisterPage'),
    verificarEmail: () => import('@/pages/VerifyEmailPage'),
    conversacionCompartida: () => import('@/pages/SharedSessionPage'),
} as const;

export type RutaPerezosa = keyof typeof MODULOS_DE_RUTA;

/** Las que ya se han pedido: precalentar dos veces no cuesta, pero no aporta. */
const pedidas = new Set<RutaPerezosa>();

/**
 * Calienta el trozo de una ruta sin navegar a ella.
 *
 * Se traga el fallo callando a propósito: esto es una apuesta, no una carga. Si
 * la red falla aquí no hay nada que decirle al usuario —no ha pedido nada— y el
 * navegador lo volverá a intentar cuando pulse de verdad, que es cuando el
 * fallo sí tiene dueño (el `ErrorBoundary` de la ruta).
 */
export function precargarRuta(ruta: RutaPerezosa): void {
    // La guarda no es paranoia de tipos: el rail pinta enlaces a partir de
    // datos del backend, y en runtime no hay tipos. Un nombre que no esté en el
    // catálogo tiene que ser un no-op, no un TypeError dentro de un `onFocus`
    // que tumbaría la navegación por teclado del rail entero.
    const pedir = MODULOS_DE_RUTA[ruta];
    if (typeof pedir !== 'function' || pedidas.has(ruta)) return;
    pedidas.add(ruta);
    void pedir().catch(() => { pedidas.delete(ruta); });
}

/** Los tres atributos que convierten un enlace en un enlace que precarga. */
export function precargaAlApuntar(ruta: RutaPerezosa) {
    return {
        onMouseEnter: () => precargarRuta(ruta),
        // El teclado también: quien tabula por el rail llega al enlace antes de
        // pulsar Intro, y sin esto la navegación por teclado sería la única que
        // paga la espera entera.
        onFocus: () => precargarRuta(ruta),
        // Táctil: `touchstart` llega ~100ms antes que el `click`.
        onTouchStart: () => precargarRuta(ruta),
    };
}

/** Reinicio para las pruebas. */
export function __resetPrecarga(): void {
    pedidas.clear();
}
