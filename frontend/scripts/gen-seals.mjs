#!/usr/bin/env node
/**
 * Generador OFFLINE de los activos del Sello (DESIGN §8.3, tarea 2.2).
 *
 * Por qué existe este fichero y no un `<filter>` en la app:
 *
 *   §8.3 pide un tampón de anilina cuya sangría de tinta parezca real. La
 *   receta original era `feTurbulence` + `feDisplacementMap` en runtime. La
 *   auditoría v3 lo rechazó: con tráfico mayoritario móvil, ese filtro cuesta
 *   4-8 ms de pintado en gama media Y NO COMPRA NADA, porque la sangría es
 *   textura ESTÁTICA — lo único que se anima es el aterrizaje. Así que el
 *   turbulence se ejecuta AQUÍ, una vez, en mi máquina, y lo que viaja al
 *   navegador es geometría ya horneada de ~3 KB.
 *
 * El ruido es el mismo concepto que `feTurbulence` (Perlin sumado por octavas)
 * pero evaluado sobre el ÁNGULO, no sobre el plano: así el contorno cierra sin
 * costura. Cada octava es una suma de senos con fase pseudoaleatoria de
 * frecuencia entera, que es periódica en 2π por construcción.
 *
 * Determinista: misma semilla → mismo fichero. Se puede volver a ejecutar y el
 * `git diff` sale vacío.
 *
 *   node scripts/gen-seals.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const DESTINO = resolve(AQUI, '..', 'public', 'seals');

/** PRNG determinista (mulberry32). */
function prng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Ruido periódico en θ por octavas — el equivalente de `feTurbulence` con
 * `numOctaves` sobre una circunferencia. Devuelve una función θ → [-1, 1].
 */
function ruidoAngular(rand, octavas, frecuenciaBase) {
    const capas = [];
    for (let o = 0; o < octavas; o++) {
        capas.push({
            k: frecuenciaBase * 2 ** o,
            fase: rand() * Math.PI * 2,
            amp: 1 / 2 ** o,
            // Una segunda armónica desfasada rompe la simetría del seno puro:
            // sin ella el contorno parece una flor, no un borde de tinta.
            k2: frecuenciaBase * 2 ** o + 1,
            fase2: rand() * Math.PI * 2,
        });
    }
    const total = capas.reduce((s, c) => s + c.amp, 0);
    return (t) => {
        let v = 0;
        for (const c of capas) {
            v += c.amp * (0.65 * Math.sin(c.k * t + c.fase) + 0.35 * Math.sin(c.k2 * t + c.fase2));
        }
        return v / total;
    };
}

const n = (x) => {
    const r = Math.round(x * 10) / 10;
    return Object.is(r, -0) ? '0' : String(r);
};

/** Contorno cerrado de radio `radio` desplazado por `ruido` con amplitud `amp`. */
function contorno(cx, cy, radio, ruido, amp, pasos) {
    const d = [];
    for (let i = 0; i < pasos; i++) {
        const t = (i / pasos) * Math.PI * 2;
        const r = radio + ruido(t) * amp;
        const x = cx + Math.cos(t) * r;
        const y = cy + Math.sin(t) * r;
        d.push(`${i === 0 ? 'M' : 'L'}${n(x)} ${n(y)}`);
    }
    d.push('Z');
    return d.join('');
}

/**
 * Banda anular con los dos cantos comidos por la tinta. `fill-rule="evenodd"`
 * convierte el contorno interior en hueco.
 */
function banda(rand, { cx, cy, radio, grosor, amp, pasos = 84 }) {
    const fuera = ruidoAngular(rand, 4, 5);
    const dentro = ruidoAngular(rand, 4, 6);
    return (
        contorno(cx, cy, radio + grosor / 2, fuera, amp, pasos) +
        contorno(cx, cy, radio - grosor / 2, dentro, amp, pasos)
    );
}

/**
 * La marca del centro: la mesa de la junta con sus cinco asientos, vista de
 * frente. Media elipse MACIZA abajo (el tablero) y cinco asientos en arco
 * encima. La primera versión dibujaba el tablero como un arco hueco y los
 * asientos por fuera: a 96px eso leía como una cara —dos ojos y una boca—, que
 * es exactamente lo que un sello de certificación no puede parecer.
 */
function mesa(rand, cx, cy) {
    const partes = [];
    const ruido = ruidoAngular(rand, 3, 7);
    const anchoTablero = 15.5;
    const altoTablero = 6.6;
    const baseY = cy + 7.2;

    // Tablero: media elipse maciza con el canto mordido por la tinta.
    const N = 44;
    const tablero = [];
    for (let i = 0; i <= N; i++) {
        const t = Math.PI + (i / N) * Math.PI;
        const j = ruido(t) * 0.45;
        tablero.push([
            cx + Math.cos(t) * (anchoTablero + j),
            baseY + Math.sin(t) * (altoTablero + j),
        ]);
    }
    partes.push(
        tablero.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${n(x)} ${n(y)}`).join('') +
        `L${n(cx - anchoTablero)} ${n(baseY)}Z`
    );

    // Cinco asientos — la junta de §2.8 son cinco — en arco por encima.
    for (let i = 0; i < 5; i++) {
        const t = Math.PI + ((i + 0.5) / 5) * Math.PI;
        const x = cx + Math.cos(t) * (anchoTablero - 1.2);
        const y = baseY - 4.4 + Math.sin(t) * 5.4;
        const rr = 1.75 + rand() * 0.3;
        partes.push(
            `M${n(x - rr)} ${n(y)}a${n(rr)} ${n(rr)} 0 1 0 ${n(rr * 2)} 0a${n(rr)} ${n(rr)} 0 1 0 ${n(-rr * 2)} 0Z`
        );
    }
    return partes.join('');
}

/** Salpicaduras de tinta alrededor del canto exterior. */
function salpicaduras(rand, cx, cy, radio, cuantas) {
    const partes = [];
    for (let i = 0; i < cuantas; i++) {
        const t = rand() * Math.PI * 2;
        const r = radio + (rand() - 0.35) * 4.5;
        const x = cx + Math.cos(t) * r;
        const y = cy + Math.sin(t) * r;
        const rr = 0.28 + rand() * 0.62;
        partes.push(
            `M${n(x - rr)} ${n(y)}a${n(rr)} ${n(rr)} 0 1 0 ${n(rr * 2)} 0a${n(rr)} ${n(rr)} 0 1 0 ${n(-rr * 2)} 0Z`
        );
    }
    return partes.join('');
}

/** Claros: donde el tampón no llegó a mojar. Huecos por `evenodd`. */
function claros(rand, cx, cy, radio, cuantos) {
    const partes = [];
    for (let i = 0; i < cuantos; i++) {
        const t = rand() * Math.PI * 2;
        const r = radio + (rand() - 0.5) * 3.4;
        const x = cx + Math.cos(t) * r;
        const y = cy + Math.sin(t) * r;
        const rx = 0.9 + rand() * 1.5;
        const ry = 0.5 + rand() * 0.9;
        partes.push(
            `M${n(x - rx)} ${n(y)}a${n(rx)} ${n(ry)} 0 1 0 ${n(rx * 2)} 0a${n(rx)} ${n(ry)} 0 1 0 ${n(-rx * 2)} 0Z`
        );
    }
    return partes.join('');
}

function sello(semilla) {
    const rand = prng(semilla);
    const cx = 48;
    const cy = 48;

    const d = [
        // Canto exterior: la banda gruesa del tampón.
        banda(rand, { cx, cy, radio: 44.6, grosor: 3.2, amp: 1.15 }),
        salpicaduras(rand, cx, cy, 46.6, 34),
        claros(rand, cx, cy, 44.6, 9),
        // Canto interior: el filete fino que encierra la leyenda.
        banda(rand, { cx, cy, radio: 31.5, grosor: 1.5, amp: 0.75, pasos: 60 }),
        claros(rand, cx, cy, 31.5, 6),
        // La marca.
        mesa(rand, cx, cy),
    ].join('');

    // Negro opaco sobre transparente: como `mask-image` de un <img>, el
    // navegador usa el canal alfa (`mask-mode: match-source` → alpha), así que
    // lo que importa es dónde HAY pintura, no de qué color es.
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96"><path fill="#000" fill-rule="evenodd" d="${d}"/></svg>\n`;
}

mkdirSync(DESTINO, { recursive: true });
// Cuatro sangrados: el que toca se elige por hash del id de sesión, para que
// dos juntas distintas no lleven el mismo tampón (§8.3 «tampón único»).
const SEMILLAS = [0x5e11a1, 0x5e11a2, 0x5e11a3, 0x5e11a4];
SEMILLAS.forEach((semilla, i) => {
    const ruta = resolve(DESTINO, `seal-${i + 1}.svg`);
    const svg = sello(semilla);
    writeFileSync(ruta, svg, 'utf8');
    console.log(`${ruta}  ${(Buffer.byteLength(svg) / 1024).toFixed(1)} KB`);
});
