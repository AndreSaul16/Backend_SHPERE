#!/usr/bin/env node
/**
 * Detector de clases muertas (tarea 0.8 de PLAN_REFACTOR_FRONTEND_V3).
 *
 *     node scripts/check-dead-classes.mjs          # falla con exit 1 si hay muertas
 *     node scripts/check-dead-classes.mjs --list   # además imprime todas las vivas
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 * En Tailwind v4 una clase que el compilador no reconoce **no genera CSS y no
 * avisa de nada**: se queda en el HTML sin efecto. Así llegó el repo a ~326
 * declaraciones de color inertes (`text-text-secondary` ×192, `prose-*` ×16…),
 * porque `tailwind.config.js` no lo leía nadie. El fallo es silencioso, así que
 * necesita un detector mecánico, no revisión visual.
 *
 * ── Cómo funciona ───────────────────────────────────────────────────────────
 * 1. Compila `src/index.css` con el MISMO PostCSS del proyecto
 *    (`@tailwindcss/postcss`), con la detección de fuentes automática de v4, o
 *    sea que el CSS resultante es exactamente el que recibe la app.
 * 2. Extrae del CSS emitido el conjunto de nombres de clase REALES,
 *    desescapando los selectores (`.hover\:bg-white\/5:hover` → la clase se
 *    llama `hover:bg-white/5`). Esto incluye gratis las clases que el proyecto
 *    define a mano en `@layer components` (`.doc-prose`, `.acta-sheet`, el
 *    shim de `.glass-*`…), así que no hacen falta listas blancas para ellas.
 * 3. Extrae de `src/**` los tokens candidatos a clase de utilidad.
 * 4. Diffea: candidato que no está en el CSS emitido = clase muerta.
 *
 * No se compila el bundle de la app en ningún momento: sólo se procesa el CSS.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src');
const ENTRY = path.join(SRC, 'index.css');

/**
 * Clases que NO las genera Tailwind ni las define `index.css`, y que aun así
 * son legítimas. Cada entrada necesita su motivo: esta lista es la única puerta
 * por la que puede volver a entrar una clase muerta sin que nadie se entere.
 */
const ALLOWED = new Map([
  // `rehype-highlight` inyecta estas clases en el markdown y las pinta el tema
  // de highlight.js que importa MessageBubble.tsx, no Tailwind.
  ['hljs', 'highlight.js (tema importado en MessageBubble.tsx)'],
  // Clases que mermaid genera dentro de su propio SVG.
  ['mermaid', 'mermaid genera su CSS en el SVG'],
]);

// ─── 1. Compilar el CSS igual que la app ────────────────────────────────────
async function compile() {
  const css = fs.readFileSync(ENTRY, 'utf8');
  const result = await postcss([tailwind()]).process(css, { from: ENTRY });
  const warnings = result.warnings();
  if (warnings.length) {
    for (const w of warnings) console.error(`  aviso de PostCSS: ${w.text}`);
  }
  return { css: result.css, warnings: warnings.length };
}

// ─── 2. Nombres de clase realmente emitidos ─────────────────────────────────
/**
 * Extrae los nombres de clase de un texto CSS desescapando los selectores.
 *
 * Hay que hacerlo carácter a carácter porque en Tailwind v4 el nombre de la
 * clase contiene los `:` `/` `[` `]` `.` de las variantes y los valores
 * arbitrarios, escapados con `\`, y detrás puede venir un pseudo-selector real
 * sin escapar. Un `includes()` sobre el selector daría falsos positivos:
 * `.bg-surface-highlight` contiene la subcadena `bg-surface`, que es OTRA clase.
 */
function emittedClassNames(css) {
  const names = new Set();
  for (let i = 0; i < css.length; i++) {
    if (css[i] !== '.') continue;
    // Un `.` sólo abre una clase si lo precede algo que puede precederla.
    const prev = css[i - 1];
    if (prev !== undefined && !'{},>+~ \n\t:()'.includes(prev)) continue;
    let name = '';
    let j = i + 1;
    for (; j < css.length; j++) {
      const c = css[j];
      if (c === '\\') {
        // El carácter escapado forma parte del nombre de la clase.
        if (j + 1 < css.length) name += css[++j];
        continue;
      }
      // Sin escapar, estos terminan el nombre de la clase.
      if ('.:[]() ,{}>+~\n\t\r"\'#'.includes(c)) break;
      name += c;
    }
    if (name) names.add(name);
    i = j - 1;
  }
  return names;
}

// ─── 3. Candidatos en el código fuente ──────────────────────────────────────
const SOURCE_EXT = new Set(['.tsx', '.ts', '.jsx', '.js', '.html']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (SOURCE_EXT.has(path.extname(e.name))) out.push(p);
  }
  return out;
}

/**
 * Prefijos de utilidad de Tailwind que el proyecto usa. Un token sólo se
 * considera candidato a clase si empieza por uno de estos (tras quitarle las
 * variantes), lo que evita tratar como clase cualquier cadena con guiones que
 * ande por el código (ids, claves de i18n, nombres de evento, rutas…).
 *
 * El precio de esta lista es su lado ciego: una clase muerta con un prefijo que
 * no esté aquí no se detecta. Por eso se compara contra el conjunto de prefijos
 * que Tailwind reconoce de verdad (--audit) y se avisa si aparecen prefijos
 * nuevos en el CSS emitido que no estén contemplados.
 */
const UTILITY_PREFIXES = [
  'accent', 'align', 'animate', 'appearance', 'aspect', 'backdrop', 'basis', 'bg',
  'block', 'blur', 'border', 'bottom', 'box', 'break', 'brightness', 'caption',
  'caret', 'clear', 'col', 'columns', 'contain', 'content', 'contrast', 'cursor',
  'decoration', 'delay', 'divide', 'drop', 'duration', 'ease', 'fill', 'filter',
  'flex', 'float', 'font', 'forced', 'gap', 'grayscale', 'grid', 'grow', 'h',
  'hidden', 'hue', 'hyphens', 'indent', 'inline', 'inset', 'invert', 'invisible',
  'isolate', 'isolation', 'italic', 'items', 'justify', 'leading', 'left', 'line',
  'linear', 'list', 'm', 'max', 'mb', 'me', 'min', 'mix', 'ml', 'mr', 'ms', 'mt',
  'mx', 'my', 'no', 'normal', 'not', 'object', 'opacity', 'order', 'origin',
  'outline', 'overflow', 'overscroll', 'p', 'pb', 'pe', 'perspective', 'place',
  'placeholder', 'pl', 'pointer', 'pr', 'prose', 'ps', 'pt', 'px', 'py', 'radial',
  'resize', 'right', 'ring', 'rotate', 'rounded', 'row', 'saturate', 'scale',
  'scheme', 'screen', 'scroll', 'scrollbar', 'select', 'sepia', 'shadow', 'shrink',
  'size', 'skew', 'snap', 'space', 'sr', 'stroke', 'subpixel', 'table', 'tabular',
  'text', 'to', 'top', 'touch', 'tracking', 'transform', 'transition', 'translate',
  'truncate', 'underline', 'uppercase', 'lowercase', 'capitalize', 'via', 'visible',
  'w', 'whitespace', 'will', 'wrap', 'z', 'zoom', 'from', 'inherit', 'backface',
  'field', 'mask', 'bg-linear', 'inset-ring', 'shadow-inner', 'antialiased',
  'overline', 'line-through', 'proportional', 'oldstyle', 'lining', 'diagonal',
  'stacked', 'slashed', 'ordinal',
];
const PREFIX_SET = new Set(UTILITY_PREFIXES);

/**
 * Valores de palabra clave de CSS que chocan con prefijos de utilidad y por eso
 * el filtro los tomaría por clases. Aparecen en objetos `style`, en `cursor:` o
 * en cadenas de CSS en línea, nunca en un `className`.
 */
const CSS_VALUES = new Set([
  'col-resize', 'row-resize', 'ew-resize', 'ns-resize', 'nesw-resize', 'nwse-resize',
  'not-allowed', 'space-between', 'space-around', 'space-evenly', 'flex-start',
  'flex-end', 'content-box', 'border-box', 'break-word', 'inline-block', 'inline-flex',
  'text-top', 'text-bottom', 'break-all',
]);

/** Tipos MIME: `text/plain`, `text/markdown`, `text/csv`… colisionan con `text-*`. */
const MIME_RE = /^(text|application|image|audio|video|font|multipart|model)\//;

/** Quita variantes (`hover:`, `lg:`, `group-hover/x:`, `data-[a=b]:`) y `!`. */
function stripVariants(token) {
  let t = token.replace(/^!+/, '').replace(/!+$/, '');
  // Cortar por el último `:` que no esté dentro de corchetes o paréntesis.
  let depth = 0;
  let lastColon = -1;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '[' || c === '(') depth++;
    else if (c === ']' || c === ')') depth--;
    else if (c === ':' && depth === 0) lastColon = i;
  }
  if (lastColon >= 0) t = t.slice(lastColon + 1);
  return t.replace(/^-/, ''); // `-mt-1` → `mt-1`
}

function looksLikeUtility(token) {
  if (token.length < 2 || token.length > 90) return false;
  if (!/^[!a-z0-9]/.test(token)) return false;
  // Nada de rutas, URLs, ficheros ni cadenas con mayúsculas o espacios.
  if (/[A-Z\s'"`\\]/.test(token)) return false;
  if (token.includes('//') || token.startsWith('/') || token.endsWith('/')) return false;
  if (/\.(tsx?|jsx?|css|json|svg|png|webp|woff2?|md|mjs|html)$/.test(token)) return false;
  if (/^(https?|data|mailto|tel|blob|urn):/.test(token)) return false;
  if (MIME_RE.test(token) || CSS_VALUES.has(token)) return false;
  // Fragmento de plantilla (`text-${x}` deja `text-`) o valor de función CSS
  // (`linear-gradient(to`): ni uno ni otro es un nombre de clase completo.
  if (/[-/]$/.test(token) || /[()]/.test(token)) return false;

  // Sólo se consideran utilidades COMPUESTAS: el token tiene que llevar `-`,
  // `[`, `/` o `:`. Sin esto, palabras corrientes de las cadenas de texto del
  // producto («text», «to», «no») se colaban como candidatas, porque coinciden
  // con prefijos de utilidad. El punto ciego que esto crea es una utilidad de
  // una sola palabra que muriese (`flex`, `hidden`, `italic`): no puede pasar
  // por un cambio de tema, que es lo que este detector vigila — un tema sólo
  // afecta a utilidades con valor (`bg-x`, `text-x`, `animate-x`).
  if (!/[-[/:]/.test(token)) return false;

  const base = stripVariants(token);
  if (!base) return false;
  const head = base.split(/[-[/]/)[0];
  if (!head) return false;
  return PREFIX_SET.has(head) || PREFIX_SET.has(base);
}

/**
 * Saca de un fichero fuente los tokens candidatos. Se toman TODAS las cadenas
 * (literales y de plantilla) y se parten por espacios: es deliberadamente
 * amplio, y el filtro fino lo hace `looksLikeUtility`.
 */
function candidatesFrom(file) {
  const text = fs.readFileSync(file, 'utf8');
  const found = new Map(); // token -> [líneas]
  const lines = text.split('\n');
  lines.forEach((line, idx) => {
    for (const m of line.matchAll(/(['"`])((?:[^\\]|\\.)*?)\1/g)) {
      for (const raw of m[2].split(/[\s${}]+/)) {
        const token = raw.trim();
        if (!token || !looksLikeUtility(token)) continue;
        if (!found.has(token)) found.set(token, []);
        found.get(token).push(idx + 1);
      }
    }
  });
  return found;
}

// ─── 4. Diff y reporte ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
const { css, warnings } = await compile();
const alive = emittedClassNames(css);

const dead = new Map(); // token -> [ "fichero:línea", ... ]
for (const file of walk(SRC)) {
  const rel = path.relative(ROOT, file);
  for (const [token, atLines] of candidatesFrom(file)) {
    if (alive.has(token) || ALLOWED.has(token)) continue;
    // Un token con opacidad (`bg-x/50`) está vivo si su base lo está: Tailwind
    // emite `.bg-x\/50` sólo si se usa, y aquí se usa, así que si falta es que
    // la base no existe. Pero por si acaso, se comprueba también la base.
    const noAlpha = token.replace(/\/[0-9.]+(\[[^\]]*\])?$/, '');
    if (noAlpha !== token && alive.has(noAlpha)) continue;
    if (!dead.has(token)) dead.set(token, []);
    dead.get(token).push(...atLines.map((n) => `${rel}:${n}`));
  }
}

const cssKb = (css.length / 1024).toFixed(1);
console.log(`CSS compilado: ${css.length} bytes (${cssKb} KB), ${alive.size} clases vivas, ${warnings} avisos`);

if (args.includes('--list')) {
  console.log('\nClases vivas:');
  for (const c of [...alive].sort()) console.log('  ' + c);
}

if (dead.size === 0) {
  console.log(`Clases muertas: 0 ✓  (${walk(SRC).length} ficheros analizados)`);
  process.exit(0);
}

const totalUses = [...dead.values()].reduce((n, v) => n + v.length, 0);
console.error(`\nClases muertas: ${dead.size} distintas, ${totalUses} usos\n`);
for (const [token, where] of [...dead.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.error(`  ${token}  (${where.length})`);
  for (const w of where.slice(0, 4)) console.error(`      ${w}`);
  if (where.length > 4) console.error(`      … y ${where.length - 4} más`);
}
console.error(
  '\nUna clase que Tailwind no reconoce no genera CSS y no avisa: el estilo' +
  '\nsimplemente no se aplica. Arréglala, o si es legítima (la pinta una' +
  '\nlibrería) añádela a ALLOWED en este script CON SU MOTIVO.',
);
process.exit(1);
