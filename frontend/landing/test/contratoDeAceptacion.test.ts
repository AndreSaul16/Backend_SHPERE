/**
 * El contrato de aceptación de DIRECCION.md §8, puntos mecánicos 1–11.
 *
 * Patrón de la casa: el contrato se defiende con un test, no con memoria. Cada
 * `it` de aquí es uno de los greps del checklist, ejecutado sobre los mismos
 * ficheros que auditaría un revisor (`src/` + `index.html`), y cuando falla
 * imprime fichero, línea y texto — no un «esperaba 0, recibí 3».
 *
 * Los puntos 12–22 no son mecánicos (miden con navegador, Lighthouse o lectura
 * humana) y por eso no viven aquí.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

interface Fuente {
  ruta: string;
  texto: string;
}

function recorrer(directorio: string): string[] {
  const encontrados: string[] = [];
  for (const entrada of readdirSync(directorio)) {
    const completa = join(directorio, entrada);
    if (statSync(completa).isDirectory()) encontrados.push(...recorrer(completa));
    else encontrados.push(completa);
  }
  return encontrados;
}

function cargar(...rutas: string[]): Fuente[] {
  return rutas.flatMap((ruta) => {
    const absolutas = statSync(ruta).isDirectory() ? recorrer(ruta) : [ruta];
    return absolutas.map((absoluta) => ({
      ruta: relative(RAIZ, absoluta),
      texto: readFileSync(absoluta, 'utf8'),
    }));
  });
}

/** Devuelve `fichero:línea: texto` por cada coincidencia, para que el fallo enseñe el delito. */
function coincidencias(fuentes: Fuente[], patron: RegExp): string[] {
  const hallazgos: string[] = [];
  for (const fuente of fuentes) {
    fuente.texto.split('\n').forEach((linea, indice) => {
      if (new RegExp(patron.source, patron.flags.replace('g', '')).test(linea)) {
        hallazgos.push(`${fuente.ruta}:${indice + 1}: ${linea.trim()}`);
      }
    });
  }
  return hallazgos;
}

const INDEX_HTML = join(RAIZ, 'index.html');
const SRC = join(RAIZ, 'src');
const SRC_STYLES = join(RAIZ, 'src', 'styles');
const SRC_MOTION = join(RAIZ, 'src', 'motion');
const CONFIG = join(RAIZ, 'src', 'config.ts');

const TODO = cargar(SRC, INDEX_HTML);

describe('DIRECCION.md §8 — checklist mecánico', () => {
  it('1 · cero backdrop-blur / backdrop-filter (no hay glassmorphism, ni la excepción del velo)', () => {
    expect(coincidencias(TODO, /backdrop-(blur|filter)/i)).toEqual([]);
  });

  it('2 · cero radios grandes: solo 2/4/8/12px', () => {
    expect(coincidencias(TODO, /rounded-(2xl|3xl)|rounded-\[[0-9]+px\]/i)).toEqual([]);
  });

  it('3 · cero tipografía por debajo del suelo de 12px', () => {
    expect(coincidencias(TODO, /text-\[(8|9|10|11)px\]/)).toEqual([]);
  });

  it('4 · cero fuentes remotas: nada de Google Fonts ni @import de http', () => {
    expect(coincidencias(TODO, /fonts\.googleapis|@import url\(http/i)).toEqual([]);
  });

  it('5 · solo Literata y Archivo: ninguna tipografía fuera del dúo', () => {
    const fuentes = cargar(SRC_STYLES, INDEX_HTML);
    expect(coincidencias(fuentes, /\b(inter|roboto|poppins|space grotesk|jakarta)\b/i)).toEqual([]);
  });

  it('6 · cero imports de GSAP prohibidos (ScrollSmoother, Observer)', () => {
    expect(coincidencias(cargar(SRC), /scrollsmoother|observer/i)).toEqual([]);
  });

  it('7 · el único gradiente de la página es el radial de la lámpara', () => {
    expect(coincidencias(TODO, /linear-gradient/i)).toEqual([]);
    // Y el radial existe: si desapareciera, la lámpara se habría perdido en silencio.
    expect(coincidencias(cargar(SRC_STYLES), /radial-gradient/i).length).toBe(1);
  });

  it('8 · ningún tween anima propiedades fuera de las permitidas', () => {
    expect(coincidencias(cargar(SRC_MOTION), /tween.*(width|height|top:|left:|margin)/i)).toEqual([]);
  });

  it('9 · un solo lang="es" y un solo h1', () => {
    const html = readFileSync(INDEX_HTML, 'utf8').split('\n');
    expect(html.filter((linea) => linea.includes('lang="es"')).length).toBe(1);
    expect(html.filter((linea) => linea.includes('<h1')).length).toBe(1);
  });

  it('10 · cero prueba social inventada (testimonios, contadores, estrellas)', () => {
    expect(coincidencias(TODO, /testimoni|clientes felices|usuarios activos|★|4\.[0-9]\/5/i)).toEqual([]);
  });

  it('11 · la ruta de registro no aparece fuera de config.ts', () => {
    const fueraDeConfig = TODO.filter((fuente) => join(RAIZ, fuente.ruta) !== CONFIG);
    expect(coincidencias(fueraDeConfig, /register\?/)).toEqual([]);
    expect(coincidencias(fueraDeConfig, /\/register/)).toEqual([]);
  });

  it('12 · una sola dependencia de ejecución: gsap', () => {
    // `tsc --noEmit` y ESLint son los otros dos tercios del punto 12 y viven en
    // `pnpm typecheck` / `pnpm lint`. Lo que no vigilaba nadie era esto: las
    // dependencias de DESARROLLO pueden crecer (tooling), las de ejecución no.
    const paquete = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(paquete.dependencies)).toEqual(['gsap']);
  });

  it('21 · la anilina es del sello y de nadie más', () => {
    // §8.21: el sello usa --aniline-500 y ningún otro elemento gasta anilina.
    // Si aparece en el HTML o en un módulo, alguien ha teñido algo que no debía.
    const fueraDeLaHoja = TODO.filter((fuente) => !fuente.ruta.endsWith('index.css'));
    expect(coincidencias(fueraDeLaHoja, /aniline/i)).toEqual([]);

    const hoja = readFileSync(join(SRC_STYLES, 'index.css'), 'utf8');
    const consumidores = hoja
      .split('\n')
      .map((linea) => linea.trim())
      .filter((linea) => /var\(--aniline/.test(linea))
      // Fuera la fontanería de tokens: definir la escala y exportarla al tema
      // de Tailwind no es GASTAR anilina, es tenerla disponible.
      .filter((linea) => !/^--(color-)?aniline-\d+:/.test(linea));

    // Lo que queda tiene que ser el sello, su gemelo en reposo de S11 y el
    // token semántico `--certify`, que es el que usa el propio sello.
    expect(consumidores.length, 'nadie gasta anilina: ¿ha desaparecido el sello?')
      .toBeGreaterThan(0);
    expect(consumidores.filter((linea) => !/--certify|\.sello/.test(linea))).toEqual([]);
  });

  it('22 · ningún negro puro: el campo es paño, no ausencia de luz', () => {
    expect(coincidencias(TODO, /#000\b|#000000|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)/i)).toEqual([]);
    // Y el campo por defecto sigue siendo el paño, con su capítulo en papel.
    const hoja = readFileSync(join(SRC_STYLES, 'index.css'), 'utf8');
    expect(hoja).toMatch(/background-color:\s*var\(--baize-950\)/);
    expect(hoja).toMatch(/background-color:\s*var\(--paper-100\)/);
  });
});

describe('DIRECCION.md §2.14 — los CTA de registro', () => {
  const html = readFileSync(INDEX_HTML, 'utf8');

  it('index.html usa los marcadores de posición, uno por cada utm_content permitido', () => {
    for (const posicion of ['NAV', 'HERO', 'PRECIOS', 'CIERRE']) {
      expect(html).toContain(`%CTA_${posicion}%`);
    }
  });

  it('no queda ningún marcador sin declarar en el plugin de Vite', () => {
    const marcadoresEnHtml = new Set(html.match(/%[A-Z_]+%/g) ?? []);
    const viteConfig = readFileSync(join(RAIZ, 'vite.config.ts'), 'utf8');
    for (const marcador of marcadoresEnHtml) {
      expect(viteConfig, `${marcador} aparece en index.html pero no lo sustituye nadie`)
        .toContain(`'${marcador}'`);
    }
  });

  it('el login no lleva UTM: quien entra ya es usuario', () => {
    const config = readFileSync(CONFIG, 'utf8');
    expect(config).toMatch(/URL_LOGIN\s*=\s*`\$\{APP_URL\}\/login`/);
    expect(config).not.toMatch(/login\?utm/);
  });
});

describe('D4 — sin JavaScript la página vende igual', () => {
  it('ni el HTML ni el CSS esconden contenido con opacity: 0', () => {
    const fuentes = cargar(SRC_STYLES, INDEX_HTML);
    expect(coincidencias(fuentes, /opacity:\s*0\s*[;}]/)).toEqual([]);
    expect(coincidencias(fuentes, /\bopacity-0\b/)).toEqual([]);
  });

  it('el acordeón de preguntas es <details> nativo, no un div con estado en JS', () => {
    const html = readFileSync(INDEX_HTML, 'utf8');
    expect((html.match(/<details class="faq__entrada"/g) ?? []).length).toBe(6);
    expect((html.match(/<summary class="faq__pregunta"/g) ?? []).length).toBe(6);
  });
});
