#!/usr/bin/env node
/**
 * Comprueba que el build de la landing salió con su base puesta.
 *
 *     node scripts/comprobar-base.mjs        # tras `vite build`
 *
 * ── Por qué esto es un paso de CI y no un test ───────────────────────────────
 * Necesita `dist/`, y en este proyecto `vite build` NO se ejecuta en local
 * (regla del propietario): se ejecuta en CI y en el despliegue. Así que la
 * primera vez que la base de verdad existe es aquí. Un test de vitest no puede
 * mirarla porque no hay nada que mirar hasta que alguien construye.
 *
 * ── Qué falla si esto no está ────────────────────────────────────────────────
 * La landing se sirve en la RAÍZ del dominio y sus assets bajo `/landing/`. Esa
 * separación la hace `base` en vite.config.ts, y la aplica Vite a las URLs que
 * escribe él: las de `index.html` y las de `public/` que aparecen en el HTML y
 * en el CSS. Si esa reescritura no ocurriera —o si alguien «arreglara» el HTML
 * escribiendo `/landing/` a mano y Vite la antepusiera otra vez—, el resultado
 * es un documento que pide `/assets/…` (que es del producto) o
 * `/landing/landing/…` (que no existe). En los dos casos la página se sirve sin
 * estilos y sin JavaScript, con 200 en el documento y 404 en todo lo demás: no
 * falla ningún build y no hay error en ningún log.
 *
 * Por eso este script MIDE y enseña lo que ha encontrado, en vez de responder
 * «pasa».
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const RAIZ = path.resolve(import.meta.dirname, '..');
const DIST = path.join(RAIZ, 'dist');
const BASE = '/landing/';

if (!fs.existsSync(DIST)) {
  console.error(`No hay dist/ en ${RAIZ}. Este script va DESPUÉS de \`vite build\`.`);
  process.exit(1);
}

const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');

/** Las URLs absolutas de recurso del documento: src, href y las del CSS. */
const urls = [...html.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1]);

const hojas = fs
  .readdirSync(path.join(DIST, 'assets'))
  .filter((f) => f.endsWith('.css'))
  .map((f) => fs.readFileSync(path.join(DIST, 'assets', f), 'utf8'));
const urlsCss = hojas.flatMap((css) => [...css.matchAll(/url\((\/[^)]*)\)/g)].map((m) => m[1]));

const todas = [...urls, ...urlsCss];

console.log(`dist/index.html: ${urls.length} URLs absolutas`);
for (const u of urls) console.log(`  ${u}`);
console.log(`CSS emitido (${hojas.length} hoja(s)): ${urlsCss.length} URLs absolutas`);
for (const u of urlsCss) console.log(`  ${u}`);

const problemas = [];

if (todas.length === 0) {
  problemas.push('no hay ni una URL absoluta: el documento no carga nada, o el formato cambió');
}

for (const u of todas) {
  if (u.includes(`${BASE}landing/`)) {
    problemas.push(`base duplicada: ${u} — alguien escribió la base a mano y Vite la repitió`);
  } else if (!u.startsWith(BASE)) {
    problemas.push(`fuera de la base: ${u} — colisiona con los assets del producto`);
  }
}

// Las fuentes se declaran en el CSS y se precargan en el HTML. Si el CSS
// perdiera la base, la página se pintaría con la tipografía de respaldo y
// nadie lo vería fallar.
if (!urlsCss.some((u) => u.startsWith(`${BASE}fonts/`))) {
  problemas.push(`el CSS no referencia ninguna fuente bajo ${BASE}fonts/`);
}

if (problemas.length > 0) {
  console.error(`\n${problemas.length} problema(s) con la base del build:\n`);
  for (const p of problemas) console.error(`  · ${p}`);
  console.error(
    '\nLa base sale de `base` en vite.config.ts y tiene que coincidir con el' +
      '\nCOPY del Dockerfile y con el try_files de nginx. No se escribe a mano' +
      '\nen index.html: en `pnpm dev` el servidor la antepone otra vez.',
  );
  process.exit(1);
}

console.log(`\nTodas las URLs cuelgan de ${BASE} ✓`);
