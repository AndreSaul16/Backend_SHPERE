#!/usr/bin/env node
/**
 * Presupuesto de arranque (tarea 4.12 de PLAN_REFACTOR_FRONTEND_V3).
 *
 *     node scripts/check-bundle-budget.mjs           # exit 1 si se pasa
 *     node scripts/check-bundle-budget.mjs --json    # además, salida legible por máquina
 *
 * ── Qué mide, y por qué así ─────────────────────────────────────────────────
 * El presupuesto del plan es «entry ≤ 220 KB gzip, CSS ≤ 45 KB gzip». Pero
 * «entry» en el sentido literal de Vite NO es lo que el usuario descarga aquí:
 * `src/main.tsx` importa `./App` de forma DINÁMICA a propósito (para poder
 * capturar un fallo de arranque y pintar `<StartupError>` en vez de una página
 * en blanco). O sea que el chunk de entrada de Vite son cuatro módulos y el
 * peso de verdad vive en el trozo de `App`, que se pide inmediatamente después
 * y sin el cual no hay aplicación.
 *
 * Medir sólo el chunk de entrada daría un número precioso y falso. Así que lo
 * que se presupuesta es el CAMINO CRÍTICO DE ARRANQUE:
 *
 *   entrada  +  todos sus imports ESTÁTICOS (transitivos)
 *            +  los import() que el arranque hace SIEMPRE (`ARRANQUE_DINAMICO`)
 *               y, a su vez, los estáticos de ésos.
 *
 * Lo que NO entra, que es justo lo que las tareas 4.1, 4.2 y 4.5 sacaron: las
 * trece rutas, los cinco visores de artefacto, el asistente de creación y las
 * cinco secciones de ajustes. Si alguien las devuelve al arranque, este número
 * sube y el job falla — que es el único mecanismo que impide que el trabajo de
 * esta fase se deshaga solo en seis meses.
 *
 * ── Por qué hace falta el manifiesto ────────────────────────────────────────
 * `dist/index.html` sólo lleva la entrada y sus `modulepreload`. El grafo real
 * (qué chunk importa a cuál, estática o dinámicamente) está en
 * `dist/.vite/manifest.json`, que `vite.config.ts` activa con `build.manifest`.
 *
 * No se compila nada aquí: este script LEE `dist/`. Quien compila es el job de
 * CI, en el paso anterior.
 */
import { gzipSync } from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const RAIZ = path.resolve(import.meta.dirname, '..');
const DIST = path.join(RAIZ, 'dist');
const MANIFIESTO = path.join(DIST, '.vite', 'manifest.json');

/** Presupuesto, en bytes gzip. El plan los da en KB de 1024. */
const PRESUPUESTO = {
    js: 220 * 1024,
    css: 45 * 1024,
};

/**
 * Los `import()` que el arranque hace SIEMPRE, con su motivo.
 *
 * Cada línea de aquí es una excepción al presupuesto por rutas, así que se
 * añade una sólo si el módulo se pide de verdad en toda carga en frío. Si la
 * lista crece sin motivo, el presupuesto deja de significar nada.
 */
const ARRANQUE_DINAMICO = {
    'src/App.tsx':
        '`main.tsx` lo pide nada más arrancar; el import() es para poder capturar '
        + 'un fallo de carga y pintar <StartupError>, no para diferirlo.',
};

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

function fallar(mensaje) {
    console.error(`\n✖ ${mensaje}\n`);
    process.exit(1);
}

if (!fs.existsSync(MANIFIESTO)) {
    fallar(
        `No existe ${path.relative(RAIZ, MANIFIESTO)}.\n`
        + '  El presupuesto se mide sobre un build de producción. En CI, este paso va\n'
        + '  DESPUÉS de `npm run build`. En local no se compila a propósito.\n'
        + '  Si el fichero falta tras compilar, comprueba que `build.manifest` sigue\n'
        + '  activo en vite.config.ts.'
    );
}

const manifiesto = JSON.parse(fs.readFileSync(MANIFIESTO, 'utf8'));

const entradas = Object.entries(manifiesto).filter(([, c]) => c.isEntry);
if (entradas.length === 0) fallar('El manifiesto no declara ninguna entrada (`isEntry`).');

// ── El cierre del arranque ──────────────────────────────────────────────────
const enElArranque = new Set();
const porQue = new Map();   // clave del manifiesto → cómo llegó

const recorrer = (clave, motivo) => {
    if (enElArranque.has(clave)) return;
    const chunk = manifiesto[clave];
    if (!chunk) return;
    enElArranque.add(clave);
    porQue.set(clave, motivo);
    for (const dep of chunk.imports ?? []) recorrer(dep, `estático desde ${clave}`);
    for (const dep of chunk.dynamicImports ?? []) {
        if (dep in ARRANQUE_DINAMICO) recorrer(dep, `dinámico de arranque: ${ARRANQUE_DINAMICO[dep]}`);
    }
};

for (const [clave] of entradas) recorrer(clave, 'entrada');

// ── Pesar ───────────────────────────────────────────────────────────────────
const pesar = (relativo) => {
    const abs = path.join(DIST, relativo);
    if (!fs.existsSync(abs)) fallar(`El manifiesto cita ${relativo} pero no está en dist/.`);
    const bruto = fs.readFileSync(abs);
    return { crudo: bruto.length, gzip: gzipSync(bruto, { level: 9 }).length };
};

const js = [];
const css = new Map();   // el mismo CSS lo pueden citar varios chunks

for (const clave of enElArranque) {
    const chunk = manifiesto[clave];
    js.push({ clave, archivo: chunk.file, motivo: porQue.get(clave), ...pesar(chunk.file) });
    for (const hoja of chunk.css ?? []) if (!css.has(hoja)) css.set(hoja, pesar(hoja));
}

/**
 * El CSS de esta aplicación es UNO (`src/index.css`, importado desde
 * `main.tsx`), pero un chunk de ruta podría traer el suyo. El presupuesto de
 * §13 es del sistema de tokens entero, así que se pesa TODO el CSS emitido y no
 * sólo el del arranque: un CSS que baja con una ruta sigue siendo CSS que el
 * usuario descarga, y partirlo no es una forma legítima de pasar la puerta.
 */
const todoElCss = new Map(css);
for (const chunk of Object.values(manifiesto)) {
    for (const hoja of chunk.css ?? []) if (!todoElCss.has(hoja)) todoElCss.set(hoja, pesar(hoja));
}

const totalJs = js.reduce((s, f) => s + f.gzip, 0);
const totalCss = [...todoElCss.values()].reduce((s, f) => s + f.gzip, 0);

// ── Informe ─────────────────────────────────────────────────────────────────
console.log('\nCamino crítico de arranque (JS):');
for (const f of js.sort((a, b) => b.gzip - a.gzip)) {
    console.log(`  ${kb(f.gzip).padStart(9)} gzip  ${f.archivo}`);
    console.log(`  ${''.padStart(9)}        ↳ ${f.clave} — ${f.motivo}`);
}
console.log('\nCSS emitido:');
for (const [hoja, p] of todoElCss) console.log(`  ${kb(p.gzip).padStart(9)} gzip  ${hoja}`);

const filas = [
    ['JS de arranque', totalJs, PRESUPUESTO.js],
    ['CSS', totalCss, PRESUPUESTO.css],
];

console.log('\nPresupuesto:');
let excedido = false;
for (const [nombre, real, techo] of filas) {
    const ok = real <= techo;
    if (!ok) excedido = true;
    const pct = ((real / techo) * 100).toFixed(0);
    console.log(`  ${ok ? '✓' : '✖'} ${nombre.padEnd(16)} ${kb(real).padStart(9)} / ${kb(techo)} gzip  (${pct}%)`);
}

if (process.argv.includes('--json')) {
    console.log('\n' + JSON.stringify({
        js_gzip: totalJs, js_budget: PRESUPUESTO.js,
        css_gzip: totalCss, css_budget: PRESUPUESTO.css,
        chunks: js.map(({ archivo, gzip, clave }) => ({ archivo, gzip, clave })),
    }, null, 2));
}

if (excedido) {
    fallar(
        'Presupuesto de arranque superado.\n'
        + '  Antes de subir el techo: mira la lista de arriba y comprueba si algo que\n'
        + '  debería viajar con su ruta ha vuelto al arranque. Las tareas 4.1, 4.2 y\n'
        + '  4.5 sacaron las trece rutas, los cinco visores, el asistente de creación y\n'
        + '  las cinco secciones de ajustes. Un `import` estático nuevo en App.tsx o en\n'
        + '  un fichero que cuelgue de él es la causa habitual.'
    );
}

console.log('\n✓ Dentro de presupuesto.\n');
