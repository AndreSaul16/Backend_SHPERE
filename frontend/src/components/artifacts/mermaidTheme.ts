/**
 * El tema de los diagramas Mermaid y la numeración de los intentos de dibujo.
 *
 * Vive fuera de `MermaidDiagram.tsx` porque es estado de MÓDULO —el tema con el
 * que se inicializó mermaid, el contador de ids— y porque un fichero de
 * componente que además exporta funciones rompe el refresco en caliente de Vite.
 */
import mermaid from 'mermaid';

/**
 * DESIGN §10: «`themeVariables` se deriva de los tokens leyendo
 * `getComputedStyle(document.documentElement)`, nunca con hex literales — hoy
 * `MermaidDiagram.tsx:11-22` tiene 11 hex clavados, así que un cambio de paleta
 * arreglaría la app y dejaría todos los diagramas en la paleta antigua».
 *
 * Y eso es exactamente lo que había pasado: los diagramas seguían en cian
 * `#00F5D4` y morado `#9D85FF` cuando el resto del producto ya era paño y
 * latón. Leyendo la variable, el diagrama sigue al tema — incluido el claro —
 * sin tocar este fichero.
 */
function token(name: string, fallback: string): string {
    if (typeof window === 'undefined' || !document.documentElement) return fallback;
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (!value) return fallback;
    return aHex(value) ?? fallback;
}

/**
 * ── Y por qué hace falta convertir ──────────────────────────────────────────
 *
 * Mermaid deriva media paleta de la que se le pasa (aclara, oscurece, calcula
 * contrastes) con `khroma`, que sólo entiende hex, `rgb()` y `hsl()`. Toda la
 * paleta de SPHERE está en `oklch()`, así que `mermaid.initialize` lanzaba
 * literalmente `Error: Unsupported color format: "oklch(0.232 0.023 158)"`.
 *
 * Lo que pasaba entonces: la excepción salía de `initialize`, se comía el
 * `catch` del dibujo y el diagrama daba «el texto no es Mermaid válido» — con
 * un texto perfectamente válido. En DESARROLLO no se veía, porque el doble
 * montaje de StrictMode reintentaba, encontraba el tema «ya aplicado» y
 * dibujaba con la paleta POR DEFECTO de mermaid: de ahí los nodos lila y
 * blancos del informe visual. En producción, con un solo montaje, todo diagrama
 * fallaba siempre.
 *
 * Así que los tokens se convierten a hex aquí, que es donde se sabe por qué.
 */

/** ¿Ya es un color que khroma entiende? Entonces pasa tal cual. */
const YA_SOPORTADO = /^(#|rgba?\(|hsla?\()/i;

/**
 * OKLCH → hex de sRGB. La fórmula es la de CSS Color 4 (Björn Ottosson):
 * OKLCh → OKLab → LMS → sRGB lineal → sRGB con su gamma.
 *
 * La alfa se ignora a propósito: los tokens que consume el diagrama son
 * opacos, y un color semitransparente en un `themeVariables` que mermaid usa
 * para calcular contrastes daría resultados peores que redondearlo.
 */
export function aHex(color: string): string | null {
    const limpio = color.trim();
    if (YA_SOPORTADO.test(limpio)) return limpio;

    const m = /^oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+)(?:deg)?/i.exec(limpio);
    if (!m) return null;

    const pct = (v: string, escala: number) =>
        v.endsWith('%') ? (parseFloat(v) / 100) * escala : parseFloat(v);
    const L = pct(m[1], 1);
    const C = pct(m[2], 0.4);
    const H = (parseFloat(m[3]) * Math.PI) / 180;
    if (!Number.isFinite(L) || !Number.isFinite(C) || !Number.isFinite(H)) return null;

    const a = C * Math.cos(H);
    const b = C * Math.sin(H);

    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const ss = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;

    const lineal = [
        +4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * ss,
        -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * ss,
        -0.0041960863 * l - 0.7034186147 * mm + 1.7076147010 * ss,
    ];

    const canal = (v: number) => {
        const g = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
        const n = Math.round(Math.min(1, Math.max(0, g)) * 255);
        return n.toString(16).padStart(2, '0');
    };
    return `#${lineal.map(canal).join('')}`;
}

/**
 * D29 — `initialize()` en cada cambio de tema, no una sola vez por vida de la
 * pestaña.
 *
 * La versión anterior tenía un `temaAplicado = true` que ya no se soltaba
 * nunca: el diagrama se quedaba con los tokens del tema que hubiera al abrir el
 * primer artefacto y cambiar `data-theme` no lo recoloreaba. Un tema claro con
 * los nodos pintados para el oscuro es peor que no tener tema claro.
 *
 * Se recuerda el tema con el que se inicializó y se reinicializa cuando cambia,
 * porque `mermaid.initialize` es idempotente y barato comparado con el render.
 */
let temaAplicado: string | null = null;
export function aplicarTemaMermaid(tema: string) {
    if (temaAplicado === tema) return;
    // Se marca DESPUÉS de que `initialize` haya salido bien. Marcarlo antes es
    // lo que convertía un fallo de configuración en un diagrama que se dibujaba
    // con la paleta equivocada al segundo intento y en un error irrecuperable
    // al primero.
    mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'dark',
        themeVariables: {
            primaryColor: token('--surface-2', '#142119'),
            primaryTextColor: token('--content', '#EEEDE8'),
            primaryBorderColor: token('--accent', '#D7A94F'),
            lineColor: token('--accent', '#D7A94F'),
            secondaryColor: token('--surface-1', '#0D1811'),
            tertiaryColor: token('--surface-3', '#1C2A21'),
            background: 'transparent',
            mainBkg: token('--surface-2', '#142119'),
            nodeBorder: token('--accent', '#D7A94F'),
            clusterBkg: token('--surface-1', '#0D1811'),
            titleColor: token('--content-strong', '#FBFAF7'),
            edgeLabelBackground: token('--surface-0', '#060F09'),
        },
        fontFamily: '"JetBrains Mono", monospace',
    });
    temaAplicado = tema;
}

/** Qué tema está pintando la app ahora mismo. `null` = el de por defecto. */
export function temaActual(): string {
    if (typeof document === 'undefined') return 'default';
    return document.documentElement.dataset.theme ?? 'default';
}

/** Reinicio para las pruebas. */
export function __resetTemaMermaid(): void {
    temaAplicado = null;
}

/**
 * Cada intento de dibujo estrena id.
 *
 * `mermaid.render(id, …)` monta un elemento temporal con ese id para medir el
 * texto y, cuando el diagrama no parsea, ese elemento se queda huérfano en el
 * documento. Con el id derivado del artefacto —que no cambia—, el siguiente
 * intento chocaba con el cadáver del anterior y fallaba también: corregir el
 * texto del diagrama no lo arreglaba nunca. Ése era el «error irrecuperable».
 */
let secuenciaDibujo = 0;

/** El id del siguiente intento de dibujo. Nunca se repite. */
export function siguienteIdDeDibujo(): string {
    return `mermaid-${(secuenciaDibujo += 1)}`;
}
