/**
 * El contrato de despliegue de la landing DENTRO del servicio del producto.
 *
 * Sustituye al antiguo `cabecerasDeSeguridad.test.ts`, que vigilaba el
 * `nginx.conf` de un servicio propio que ya no existe. Las cabeceras las vigila
 * ahora `frontend/tests/lib/cabecerasDeSeguridad.test.ts`, que es donde vive el
 * fichero. Lo que se comprueba aquí es lo otro, que no vigilaba nadie:
 *
 * LA MISMA VERDAD ESCRITA EN TRES SITIOS. La ruta `/landing/` aparece en
 *   1. `vite.config.ts` como `base` (dónde escribe Vite los assets con hash),
 *   2. el `COPY` del Dockerfile (dónde acaban físicamente en la imagen),
 *   3. el `try_files` de nginx (dónde los busca el servidor).
 * Si una de las tres se mueve y las otras no, la página se sirve sin estilos y
 * sin JavaScript. No falla ningún build, no hay error en ningún log: sale un
 * documento desnudo. Es exactamente el fallo que este proyecto no puede
 * permitirse descubrir en producción, porque el build de verdad sólo ocurre
 * allí y en CI.
 *
 * Los ficheros están fuera de esta carpeta a propósito: son del servicio, y el
 * servicio es del producto. Se miran desde aquí porque la constante que los ata
 * (`BASE_LANDING`) sí es de la landing.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import configuracion from '../vite.config';
import { BASE_LANDING } from '../src/config';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
/** `frontend/`: el contexto de build del servicio de Railway. */
const SERVICIO = join(RAIZ, '..');
const leerDelServicio = (nombre: string) => readFileSync(join(SERVICIO, nombre), 'utf8');

const DOCKERFILE = leerDelServicio('Dockerfile');
const DOCKERIGNORE = leerDelServicio('.dockerignore');

const CONFIGS: Record<string, string> = {
  'nginx.conf': leerDelServicio('nginx.conf'),
  'nginx.conf.template': leerDelServicio('nginx.conf.template'),
};

/** `/landing/` → `landing` — la carpeta, sin las barras de la URL. */
const CARPETA = BASE_LANDING.replace(/^\/|\/$/g, '');

describe('la base de Vite y la ruta física dicen lo mismo', () => {
  it('vite.config.ts declara la base de la landing', () => {
    expect(configuracion.base).toBe(BASE_LANDING);
  });

  it('la base NO es la raíz: los assets del producto se llaman igual', () => {
    // Con `base: '/'`, `dist/assets/index-<hash>.js` de la landing y el del
    // producto compiten por la misma carpeta de nginx. El que se copie el
    // segundo gana, y el otro deja de existir.
    expect(BASE_LANDING).not.toBe('/');
    expect(BASE_LANDING.startsWith('/') && BASE_LANDING.endsWith('/')).toBe(true);
  });

  it('el Dockerfile copia el dist de la landing donde la base dice', () => {
    expect(DOCKERFILE).toContain(
      `COPY --from=build /app/landing/dist /usr/share/nginx/html/${CARPETA}`,
    );
  });
});

describe('el Dockerfile del servicio construye la landing', () => {
  it('instala con pnpm y el lockfile congelado', () => {
    expect(DOCKERFILE).toContain('corepack enable');
    expect(DOCKERFILE).toMatch(/pnpm install --frozen-lockfile/);
    expect(DOCKERFILE).toMatch(/RUN pnpm build/);
  });

  it('copia pnpm-workspace.yaml, sin el cual esbuild no coloca su binario', () => {
    // pnpm 11 ya no lee la clave "pnpm" de package.json: `allowBuilds: esbuild`
    // vive ahí. Sin el fichero, `vite build` muere en el arranque.
    expect(DOCKERFILE).toMatch(/COPY .*landing\/pnpm-workspace\.yaml/);
  });

  it('los manifiestos se copian ANTES que la fuente, para que la capa se reutilice', () => {
    // Sobre INSTRUCCIONES, no sobre el texto del fichero: los comentarios de
    // arriba citan `COPY . .` para explicar por qué el orden importa, y un
    // `indexOf` sobre el fichero entero encontraba la cita antes que la
    // instrucción. El test decía que el orden estaba mal cuando estaba bien.
    const instrucciones = DOCKERFILE.split('\n')
      .map((linea) => linea.trim())
      .filter((linea) => linea.length > 0 && !linea.startsWith('#'));

    const donde = (patron: RegExp) => instrucciones.findIndex((linea) => patron.test(linea));

    const manifiestos = donde(/^COPY .*landing\/pnpm-lock\.yaml/);
    const instalacion = donde(/^RUN pnpm install --frozen-lockfile$/);
    const fuente = donde(/^COPY \. \.$/);

    expect(manifiestos, 'no se copian los manifiestos de la landing').toBeGreaterThan(-1);
    expect(instalacion, 'la instalación va antes que los manifiestos').toBeGreaterThan(
      manifiestos,
    );
    expect(fuente, 'la fuente entra antes de instalar: la capa no se reutiliza nunca')
      .toBeGreaterThan(instalacion);
  });

  it('la imagen de build le vale a pnpm, que pide node >= 22.13', () => {
    // `packageManager` fija pnpm 11.7.0 y su `engines.node` es >= 22.13. Con
    // node:20-alpine, corepack se planta antes de instalar nada.
    const etiqueta = /FROM node:(\d+)-alpine AS build/.exec(DOCKERFILE)?.[1];
    expect(etiqueta, 'el Dockerfile ya no declara una imagen de node').toBeDefined();
    expect(Number(etiqueta)).toBeGreaterThanOrEqual(22);
  });

  it('.dockerignore deja fuera el node_modules y el dist de la landing', () => {
    // Un patrón sin barra casa contra la ruta COMPLETA relativa al contexto,
    // así que `node_modules` a secas sólo excluye el de la raíz. Sin estas dos
    // líneas, el `COPY . .` mete los binarios de esbuild de la máquina de
    // desarrollo encima de los que instaló pnpm en la imagen.
    expect(DOCKERIGNORE).toMatch(new RegExp(`^${CARPETA}/node_modules$`, 'm'));
    expect(DOCKERIGNORE).toMatch(new RegExp(`^${CARPETA}/dist$`, 'm'));
  });
});

describe('nginx sirve la landing en la raíz del dominio', () => {
  it.each(Object.keys(CONFIGS))('%s: la raíz nombra el documento de la landing', (nombre) => {
    expect(CONFIGS[nombre]).toMatch(
      new RegExp(`try_files\\s+/${CARPETA}/index\\.html\\s+=404;`),
    );
  });

  it.each(Object.keys(CONFIGS))('%s: la subruta redirige a la raíz', (nombre) => {
    // El documento vive en una sola URL. La subruta es de los assets.
    expect(CONFIGS[nombre]).toMatch(new RegExp(`location ~ \\^/${CARPETA}[^\\n]*\\{`));
    expect(CONFIGS[nombre]).toMatch(/return 301 \/;/);
  });

  it.each(Object.keys(CONFIGS))(
    '%s: el fallback de la SPA del producto sigue intacto',
    (nombre) => {
      // La landing se añade, no repara: cualquier ruta que no sea la raíz
      // tiene que seguir llegando a la aplicación.
      expect(CONFIGS[nombre]).toMatch(/try_files \$uri \$uri\/ \/index\.html;/);
    },
  );
});

describe('el servicio standalone ya no existe', () => {
  it('la landing no conserva su propio Dockerfile, nginx.conf ni railway.toml', () => {
    // Serían una segunda fuente de verdad, muerta y creíble: el sitio donde
    // alguien arreglaría un problema de despliegue sin que sirviera de nada.
    for (const huerfano of ['Dockerfile', 'nginx.conf', 'railway.toml', '.dockerignore']) {
      expect(() => readFileSync(join(RAIZ, huerfano), 'utf8'), `sigue habiendo ${huerfano}`)
        .toThrow();
    }
  });

  it('robots.txt y sitemap.xml se han ido con el dominio, no están en public/', () => {
    // Bajo una subruta serían inertes; y la raíz del dominio ya no es sólo de
    // la landing. Viven en `frontend/public/` y los vigila `seo.test.ts`.
    for (const declaracion of ['robots.txt', 'sitemap.xml']) {
      expect(() => readFileSync(join(RAIZ, 'public', declaracion), 'utf8')).toThrow();
      expect(() => readFileSync(join(SERVICIO, 'public', declaracion), 'utf8')).not.toThrow();
    }
  });
});
