#!/usr/bin/env node
/**
 * Verifica de forma determinista que package.json y package-lock.json están
 * sincronizados. Existe porque `npm ci` NO es un detector fiable de este
 * problema: solo falla si ninguna entrada del lock satisface el rango. Una
 * dependencia declarada en package.json pero ausente de
 * packages[""].dependencies pasa desapercibida mientras exista una entrada
 * `node_modules/<nombre>` compatible metida ahí por una dependencia transitiva
 * (exactamente el caso de `dompurify`, que llegaba por `mermaid`).
 *
 * Comprueba, para cada dependencia y devDependencia de package.json:
 *   1. que aparece en packages[""].dependencies / .devDependencies del lock
 *      con el MISMO rango declarado, y
 *   2. que existe una entrada `node_modules/<nombre>` cuya versión satisface
 *      ese rango.
 *
 * Sin dependencias externas a propósito: importar `semver` desde el node_modules
 * hoisteado sería reintroducir la misma clase de bug que este script vigila.
 *
 * Uso:  node scripts/verify-lock-sync.mjs
 * Salida: exit 0 si todo cuadra, exit 1 con el detalle de cada fallo.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// --- semver mínimo (comparación + rangos ^ ~ = >= exacto), con prerelease ---

function parseVersion(v) {
    const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(v.trim());
    if (!m) return null;
    return {
        major: Number(m[1]),
        minor: Number(m[2]),
        patch: Number(m[3]),
        pre: m[4] ? m[4].split('.') : [],
    };
}

function comparePre(a, b) {
    // Sin prerelease > con prerelease (1.0.0 > 1.0.0-beta.1)
    if (a.length === 0 && b.length === 0) return 0;
    if (a.length === 0) return 1;
    if (b.length === 0) return -1;
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const x = a[i];
        const y = b[i];
        if (x === undefined) return -1;
        if (y === undefined) return 1;
        const xn = /^\d+$/.test(x);
        const yn = /^\d+$/.test(y);
        if (xn && yn) {
            const d = Number(x) - Number(y);
            if (d !== 0) return d < 0 ? -1 : 1;
        } else if (xn !== yn) {
            return xn ? -1 : 1; // numérico < alfanumérico
        } else if (x !== y) {
            return x < y ? -1 : 1;
        }
    }
    return 0;
}

function compare(a, b) {
    for (const k of ['major', 'minor', 'patch']) {
        if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1;
    }
    return comparePre(a.pre, b.pre);
}

/** Límite superior exclusivo de ^ y ~ */
function upperBound(range, v) {
    if (range === '^') {
        if (v.major > 0) return { major: v.major + 1, minor: 0, patch: 0, pre: ['0'] };
        if (v.minor > 0) return { major: 0, minor: v.minor + 1, patch: 0, pre: ['0'] };
        return { major: 0, minor: 0, patch: v.patch + 1, pre: ['0'] };
    }
    // ~x.y.z  ->  < x.(y+1).0
    return { major: v.major, minor: v.minor + 1, patch: 0, pre: ['0'] };
}

/**
 * Soporta los operadores realmente presentes en este package.json:
 * exacto, ^, ~, >=. Devuelve null si el rango no se reconoce (se reporta
 * como fallo explícito en vez de darse por bueno en silencio).
 */
function satisfies(version, range) {
    const v = parseVersion(version);
    if (!v) return null;
    const r = range.trim();

    if (/^\d/.test(r)) {
        const t = parseVersion(r);
        return t ? compare(v, t) === 0 : null;
    }
    if (r.startsWith('^') || r.startsWith('~')) {
        const op = r[0];
        const t = parseVersion(r.slice(1));
        if (!t) return null;
        return compare(v, t) >= 0 && compare(v, upperBound(op, t)) < 0;
    }
    if (r.startsWith('>=')) {
        const t = parseVersion(r.slice(2));
        return t ? compare(v, t) >= 0 : null;
    }
    return null;
}

// --- Verificación ---

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));

const failures = [];
const checks = [];

if (!lock.packages || typeof lock.packages !== 'object') {
    failures.push(`package-lock.json sin sección "packages" (lockfileVersion ${lock.lockfileVersion})`);
}

const lockRoot = lock.packages?.[''] ?? {};

for (const section of ['dependencies', 'devDependencies']) {
    const declared = pkg[section] ?? {};
    for (const [name, range] of Object.entries(declared)) {
        const lockRange = lockRoot[section]?.[name];

        // 1. Presente en packages[""] con el mismo rango
        if (lockRange === undefined) {
            failures.push(`[${section}] ${name}: declarado en package.json pero AUSENTE de packages[""].${section} del lock`);
            continue;
        }
        if (lockRange !== range) {
            failures.push(`[${section}] ${name}: rango distinto — package.json "${range}" vs lock "${lockRange}"`);
            continue;
        }

        // 2. Existe entrada node_modules/<nombre> con versión que satisface
        const entry = lock.packages[`node_modules/${name}`];
        if (!entry) {
            failures.push(`[${section}] ${name}: sin entrada "node_modules/${name}" en el lock`);
            continue;
        }
        if (!entry.version) {
            failures.push(`[${section}] ${name}: entrada "node_modules/${name}" sin campo version`);
            continue;
        }
        const ok = satisfies(entry.version, range);
        if (ok === null) {
            failures.push(`[${section}] ${name}: no se pudo evaluar "${entry.version}" contra el rango "${range}"`);
            continue;
        }
        if (!ok) {
            failures.push(`[${section}] ${name}: la versión del lock ${entry.version} NO satisface "${range}"`);
            continue;
        }
        checks.push(`${name}@${range} -> node_modules/${name}@${entry.version}`);
    }
}

// Dirección inversa: nada extra en packages[""] que no esté en package.json
for (const section of ['dependencies', 'devDependencies']) {
    for (const name of Object.keys(lockRoot[section] ?? {})) {
        if (!(pkg[section] ?? {})[name]) {
            failures.push(`[${section}] ${name}: está en packages[""].${section} del lock pero NO en package.json`);
        }
    }
}

const total =
    Object.keys(pkg.dependencies ?? {}).length + Object.keys(pkg.devDependencies ?? {}).length;

console.log(`lockfileVersion: ${lock.lockfileVersion}`);
console.log(`dependencias declaradas: ${total} (${Object.keys(pkg.dependencies ?? {}).length} prod + ${Object.keys(pkg.devDependencies ?? {}).length} dev)`);
console.log(`verificadas OK: ${checks.length}`);

if (failures.length > 0) {
    console.error(`\nFALLOS (${failures.length}):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
}

console.log('\nOK: package.json y package-lock.json están sincronizados.');
process.exit(0);
