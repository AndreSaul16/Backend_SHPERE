#!/usr/bin/env node
/**
 * Puerta de coherencia del precio del debate (lanzamiento-p0 · CS-008).
 *
 *     node scripts/check-product-pricing.mjs   # exit 1 si PRODUCT.md se contradice
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 * `PRODUCT.md` decía dos cosas incompatibles sobre lo mismo. En §Positioning:
 * «si el consejo está de acuerdo pronto, el debate se abrevia y cuesta menos
 * (3 créditos en vez de 5)». En §Operating Context: «cuesta 5, o 3 si el triaje
 * reduce participantes». Sólo la segunda es cierta — el precio lo fija el
 * triaje por número de participantes (`stream.py`,
 * `cost = BOARD_REDUCED_COST if len(participants) <= 2 else BOARD_MEETING_COST`)
 * y el recuento sólo decide si hay réplicas (`board_v2.py`, `route_after_consensus`).
 *
 * Una promesa de precio que el producto no cumple no es un error de redacción:
 * es lo que el cliente cree haber comprado. Y no se puede detectar leyendo,
 * porque el documento crece y las dos frases están a trece líneas de distancia.
 *
 * ── Las dos reglas ──────────────────────────────────────────────────────────
 * 1. PROHIBIDA · ninguna frase puede atar consenso, unanimidad o early-exit al
 *    coste en créditos.
 * 2. OBLIGATORIA · la regla verdadera —el triaje— tiene que seguir ahí.
 *
 * La segunda no es adorno: sin ella, borrar los dos párrafos pasaría la puerta
 * y el documento se quedaría sin decir cuánto cuesta un debate, que es
 * exactamente el agujero que esto viene a tapar.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const PRODUCT = path.join(ROOT, 'PRODUCT.md');
const ETIQUETA = 'check-product-pricing';

/**
 * Regla 1 — el precio atado al consenso.
 *
 * Se busca la coincidencia de dos cosas en la MISMA frase: una noción de
 * consenso y una de precio. Así no salta con «el debate se abrevia» a secas,
 * que es una descripción correcta del mecanismo, ni con «cuesta 5 créditos»,
 * que es la regla verdadera.
 */
const CONSENSO = /(consenso|consejo\s+est[áa]\s+de\s+acuerdo|un[áa]nim\w*|unanimidad|early[-\s]?exit|debate\s+se\s+abrevia|abreviad\w+)/i;
const PRECIO = /(cuesta\s+menos|m[áa]s\s+barat\w+|descuento|abarat\w+|\d+\s*cr[ée]ditos?\s+en\s+vez\s+de\s+\d+|ahorr\w+\s+cr[ée]ditos?)/i;

/** Regla 2 — la regla verdadera, la del triaje. */
const REGLA_DEL_TRIAJE = /triaje\s+reduce\s+participantes/i;

/**
 * Une las líneas de cada párrafo antes de buscar: la frase infractora estaba
 * partida en tres líneas, y buscando línea a línea no la ve nadie.
 */
function parrafosDe(texto) {
    const parrafos = [];
    let actual = null;
    texto.split(/\r?\n/).forEach((linea, i) => {
        if (!linea.trim()) {
            actual = null;
            return;
        }
        if (!actual) {
            actual = { linea: i + 1, texto: linea.trim() };
            parrafos.push(actual);
        } else {
            actual.texto += ' ' + linea.trim();
        }
    });
    return parrafos;
}

function main() {
    if (!fs.existsSync(PRODUCT)) {
        console.error(`${ETIQUETA}: no se encuentra ${PRODUCT}`);
        process.exit(1);
    }
    const texto = fs.readFileSync(PRODUCT, 'utf8');
    const fallos = [];

    // Regla 1 · ninguna frase ata el precio al consenso.
    for (const parrafo of parrafosDe(texto)) {
        // Se busca dentro de cada oración, no del párrafo entero: dos frases
        // vecinas, una sobre el mecanismo y otra sobre el precio del triaje,
        // son correctas y no deben saltar.
        for (const oracion of parrafo.texto.split(/(?<=\.)\s+/)) {
            if (CONSENSO.test(oracion) && PRECIO.test(oracion)) {
                fallos.push(
                    `${ETIQUETA}: PRODUCT.md ata el precio al consenso — «${oracion.trim()}» (línea ${parrafo.linea})`
                );
            }
        }
    }

    // Regla 2 · la regla verdadera sigue escrita.
    if (!REGLA_DEL_TRIAJE.test(texto)) {
        fallos.push(
            `${ETIQUETA}: PRODUCT.md ya no dice quién decide el precio del debate. ` +
            `Tiene que seguir diciendo que cuesta 3 «si el triaje reduce participantes».`
        );
    }

    if (fallos.length > 0) {
        for (const fallo of fallos) console.error(fallo);
        console.error(
            `\n${ETIQUETA}: el precio del debate lo decide el TRIAJE por número de ` +
            `participantes, no el consenso. Ver openspec/changes/lanzamiento-p0 · CS-008.`
        );
        process.exit(1);
    }

    console.log(`${ETIQUETA}: PRODUCT.md dice una sola cosa sobre el precio del debate.`);
}

main();

export { parrafosDe, CONSENSO, PRECIO, REGLA_DEL_TRIAJE };
