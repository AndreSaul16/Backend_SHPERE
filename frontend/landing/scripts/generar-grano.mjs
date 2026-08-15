/**
 * Generador one-off del grano del paño — DIRECCION.md §4.2 / DESIGN.md §8.5.
 *
 * Produce `public/textures/baize-128.webp`: un tile de 128×128, monocromo,
 * ≤ 3 KB, que se pinta con `background-repeat: repeat` y
 * `background-blend-mode: overlay` sobre `--baize-950`.
 *
 * POR QUÉ ESTE SCRIPT Y NO UNA DEPENDENCIA
 * `sharp` traería ~50 MB de binarios para una ejecución única. El entorno ya
 * tiene `ffmpeg` con `libwebp`, así que el script escribe un PPM (P6: cabecera
 * de texto + RGB crudo, cero dependencias) y deja que ffmpeg lo codifique.
 * El asset resultante se commitea; este fichero solo existe para poder
 * reproducirlo bit a bit.
 *
 * CÓMO SE MANTIENE POR DEBAJO DE 3 KB
 * El ruido blanco puro es incompresible (~8 bits/px = 16 KB a 128×128). Aquí el
 * grano tiene dos capas, y las dos están diseñadas para comprimir:
 *   1. Fibra de baja frecuencia: rejilla 8×8 interpolada con suavizado de
 *      Hermite y envuelta en los bordes (el tile cose sin costura). Muy
 *      correlacionada espacialmente → los predictores de WebP la comen.
 *   2. Grano fino cuantizado a 3 niveles. Cuantizar es lo que hunde la entropía
 *      sin que el ojo lo note a una desviación de ±6 sobre 128.
 * El punto medio es 128 exacto: en `overlay`, 128 es la identidad, así que la
 * amplitud de la desviación ES la opacidad efectiva del efecto (~4%).
 *
 * POR QUÉ WEBP CON PÉRDIDA Y NO SIN PÉRDIDA — medido, no supuesto
 * Se probaron las dos vías con este mismo tile. VP8L (sin pérdida) toca suelo
 * en ~4.4-5.5 KB por mucho que se cuantice la salida: el grano es, por
 * definición, lo que no se deja predecir. VP8 con `-quality 85` da 1.962 B
 * conservando sd 4,27 sobre los 4,72 de la fuente (el 90 % del grano). Como la
 * textura se mezcla al ~4 % sobre paño oscuro, ese 10 % de pérdida no es
 * observable y el techo de §4.2 sí es vinculante. Aviso de trampa: `-preset`
 * (icon/text/...) ANULA `-lossless 1` en silencio y devuelve un VP8 de 356 B
 * con la mitad del grano — por eso aquí no se usa ningún preset.
 *
 * Determinista: mulberry32 con semilla fija. Misma entrada → mismo fichero.
 *
 * Uso:  pnpm grano
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = join(RAIZ, 'public', 'textures', 'baize-128.webp');
const TMP = join(RAIZ, 'scripts', '.tmp');

const LADO = 128;
const SEMILLA = 0x5be11a; // «sello» en hex-hablado; fijada para reproducibilidad
const CENTRO = 128; // identidad del blend `overlay`
const REJILLA = 8; // celdas de la fibra de baja frecuencia
const AMP_FIBRA = 5; // ±5 niveles
const AMP_GRANO = 6; // ±6 niveles
const NIVELES_GRANO = 3; // cuantización del grano fino
const CALIDAD = 85; // VP8 con pérdida; ver la nota de cabecera
const TECHO_BYTES = 3072; // §4.2: ≤ 3 KB

/** PRNG determinista de 32 bits (mulberry32). */
function mulberry32(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Suavizado de Hermite: bordes con derivada nula, sin aristas en la rejilla. */
const suave = (t) => t * t * (3 - 2 * t);

/**
 * Ruido de valor sobre una rejilla periódica. El módulo en los índices es lo
 * que hace que el tile case consigo mismo por los cuatro lados.
 */
function fibra(aleatorio) {
  const nodos = new Float64Array(REJILLA * REJILLA);
  for (let i = 0; i < nodos.length; i += 1) nodos[i] = aleatorio() * 2 - 1;

  const en = (gx, gy) => nodos[(gy % REJILLA) * REJILLA + (gx % REJILLA)];
  const campo = new Float64Array(LADO * LADO);
  const paso = LADO / REJILLA;

  for (let y = 0; y < LADO; y += 1) {
    for (let x = 0; x < LADO; x += 1) {
      const gx = Math.floor(x / paso);
      const gy = Math.floor(y / paso);
      const tx = suave((x - gx * paso) / paso);
      const ty = suave((y - gy * paso) / paso);
      const arriba = en(gx, gy) * (1 - tx) + en(gx + 1, gy) * tx;
      const abajo = en(gx, gy + 1) * (1 - tx) + en(gx + 1, gy + 1) * tx;
      campo[y * LADO + x] = arriba * (1 - ty) + abajo * ty;
    }
  }
  return campo;
}

function generarPixeles() {
  const aleatorio = mulberry32(SEMILLA);
  const campo = fibra(aleatorio);
  const gris = new Uint8Array(LADO * LADO);
  const escalon = (2 * AMP_GRANO) / (NIVELES_GRANO - 1);

  for (let i = 0; i < gris.length; i += 1) {
    const nivel = Math.round(aleatorio() * (NIVELES_GRANO - 1));
    const grano = -AMP_GRANO + nivel * escalon;
    const valor = CENTRO + campo[i] * AMP_FIBRA + grano;
    gris[i] = Math.max(0, Math.min(255, Math.round(valor)));
  }
  return gris;
}

/** PPM binario (P6). Formato trivial que ffmpeg lee sin ambigüedad. */
function escribirPPM(ruta, gris) {
  const cabecera = Buffer.from(`P6\n${LADO} ${LADO}\n255\n`, 'ascii');
  const cuerpo = Buffer.allocUnsafe(gris.length * 3);
  for (let i = 0; i < gris.length; i += 1) {
    cuerpo[i * 3] = gris[i];
    cuerpo[i * 3 + 1] = gris[i];
    cuerpo[i * 3 + 2] = gris[i];
  }
  writeFileSync(ruta, Buffer.concat([cabecera, cuerpo]));
}

/**
 * Comprueba que el tile cose consigo mismo: la diferencia media entre las
 * columnas/filas opuestas (la costura al repetir) debe ser del mismo orden que
 * la diferencia entre dos columnas/filas contiguas del interior. Si la costura
 * fuese mayor, se vería una rejilla al tilear.
 */
function medirCostura(gris) {
  const en = (x, y) => gris[y * LADO + x];
  const medio = (a, b, vertical) => {
    let suma = 0;
    for (let i = 0; i < LADO; i += 1) {
      suma += Math.abs(vertical ? en(i, a) - en(i, b) : en(a, i) - en(b, i));
    }
    return suma / LADO;
  };
  return {
    costuraX: medio(LADO - 1, 0, false),
    interiorX: medio(63, 64, false),
    costuraY: medio(LADO - 1, 0, true),
    interiorY: medio(63, 64, true),
  };
}

function main() {
  mkdirSync(TMP, { recursive: true });
  mkdirSync(dirname(SALIDA), { recursive: true });

  const gris = generarPixeles();
  const ppm = join(TMP, 'grano.ppm');
  escribirPPM(ppm, gris);

  execFileSync(
    'ffmpeg',
    ['-y', '-loglevel', 'error', '-i', ppm, '-c:v', 'libwebp',
      '-quality', String(CALIDAD), '-compression_level', '6', SALIDA],
    { stdio: 'inherit' },
  );

  rmSync(TMP, { recursive: true, force: true });

  const c = medirCostura(gris);
  console.log(
    `costura: X ${c.costuraX.toFixed(2)} vs interior ${c.interiorX.toFixed(2)} · ` +
    `Y ${c.costuraY.toFixed(2)} vs interior ${c.interiorY.toFixed(2)}`,
  );

  const bytes = readFileSync(SALIDA).length;
  console.log(`baize-128.webp — ${bytes} B (techo ${TECHO_BYTES} B)`);
  if (bytes > TECHO_BYTES) {
    console.error('El tile supera el techo de §4.2. Baja CALIDAD o NIVELES_GRANO.');
    process.exit(1);
  }
}

main();
