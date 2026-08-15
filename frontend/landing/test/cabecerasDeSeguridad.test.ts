/**
 * Las cabeceras de seguridad tienen que LLEGAR al documento.
 *
 * EL GOTCHA QUE ESTE TEST EXISTE PARA IMPEDIR (auditado en el producto)
 * `add_header` NO se hereda del bloque `server` en un `location` que declare su
 * propio `add_header`: nginx reemplaza el juego entero, no lo fusiona. En
 * `Frontend_SPHERE` las cuatro cabeceras estaban puestas a nivel de server,
 * pero el location del documento declaraba su Cache-Control — y con él se llevó
 * por delante las cuatro. La aplicación ENTERA se sirvió sin ninguna cabecera
 * de seguridad. No hay error, no hay aviso: simplemente no llegan.
 *
 * Esto no se puede probar arrancando nginx desde los tests, así que se prueba
 * sobre el fichero. Es una guarda estructural y lo dice de frente: lo que
 * garantiza es que nadie añada un `add_header` a un `location` y se lleve por
 * delante el resto sin enterarse.
 *
 * El juego de cabeceras NO está escrito aquí: se DEDUCE del bloque `server`.
 * Escrito a mano, este test envejecería en cuanto alguien añadiera una cabecera
 * nueva al server —que es justo el momento en que el gotcha muerde— y pasaría
 * en verde mientras los locations la pierden.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = readFileSync(join(RAIZ, 'nginx.conf'), 'utf8');
const DOCKERFILE = readFileSync(join(RAIZ, 'Dockerfile'), 'utf8');

interface Bloque {
  encabezado: string;
  cuerpo: string;
}

/**
 * Los bloques `location … { … }`, casando llaves para respetar el anidamiento.
 *
 * La apertura se ancla a principio de línea a propósito: este mismo fichero
 * explica el gotcha en prosa, y un patrón suelto casaba la palabra «location»
 * dentro de un comentario y se tragaba hasta la siguiente llave, dejando el
 * análisis en nada. Los comentarios empiezan por `#`, así que no cuelan.
 */
function bloquesDeLocation(config: string): Bloque[] {
  const bloques: Bloque[] = [];
  const apertura = /^[ \t]*location[^{\n]*\{/gm;
  let coincidencia: RegExpExecArray | null;

  while ((coincidencia = apertura.exec(config)) !== null) {
    const inicioCuerpo = coincidencia.index + coincidencia[0].length;
    let profundidad = 1;
    let i = inicioCuerpo;
    while (i < config.length && profundidad > 0) {
      if (config[i] === '{') profundidad += 1;
      else if (config[i] === '}') profundidad -= 1;
      i += 1;
    }
    bloques.push({
      encabezado: coincidencia[0].replace(/\s*\{$/, '').trim().replace(/\s+/g, ' '),
      cuerpo: config.slice(inicioCuerpo, i - 1),
    });
  }
  return bloques;
}

/** Las líneas `add_header` de un trozo de configuración, normalizadas. */
function cabeceras(fragmento: string): string[] {
  return fragmento
    .split('\n')
    .map((linea) => linea.trim())
    .filter((linea) => linea.startsWith('add_header') && !linea.startsWith('#'))
    .map((linea) => linea.replace(/\s+/g, ' '));
}

/** El nombre de la cabecera de una línea `add_header Nombre "valor" always;`. */
const nombreDe = (linea: string): string => linea.split(' ')[1] ?? linea;

const LOCATIONS = bloquesDeLocation(CONFIG);

/**
 * El nivel `server`: la configuración sin los cuerpos de los locations. Lo que
 * queda son las cabeceras que TODO location con `add_header` debe repetir.
 */
const NIVEL_SERVER = LOCATIONS.reduce((texto, bloque) => texto.replace(bloque.cuerpo, ''), CONFIG);
const DEL_SERVER = cabeceras(NIVEL_SERVER);

describe('nginx.conf — el juego de cabeceras de seguridad', () => {
  it('el bloque server declara las cabeceras que se esperan de una landing', () => {
    expect(DEL_SERVER.map(nombreDe).sort()).toEqual([
      'Cross-Origin-Opener-Policy',
      'Permissions-Policy',
      'Referrer-Policy',
      'X-Content-Type-Options',
      'X-Frame-Options',
    ]);
    expect(DEL_SERVER).toContain('add_header X-Frame-Options "DENY" always;');
    expect(DEL_SERVER).toContain('add_header X-Content-Type-Options "nosniff" always;');
    // `same-origin` a secas: esta página no abre popups de acceso que
    // necesiten conservar el `opener`, al contrario que el frontend del producto.
    expect(DEL_SERVER).toContain('add_header Cross-Origin-Opener-Policy "same-origin" always;');
  });

  it('todo location que declare add_header repite el juego COMPLETO del server', () => {
    const conCabeceras = LOCATIONS.filter((bloque) => cabeceras(bloque.cuerpo).length > 0);

    // Si no hubiera ninguno, este test no probaría nada: el gotcha sólo muerde
    // cuando un location declara su propio add_header.
    expect(conCabeceras.length, 'ningún location declara cabeceras: el test sería vacuo')
      .toBeGreaterThan(0);

    for (const bloque of conCabeceras) {
      const suyas = cabeceras(bloque.cuerpo);
      for (const delServer of DEL_SERVER) {
        expect(
          suyas,
          `«${bloque.encabezado}» declara add_header y pierde ${nombreDe(delServer)}: ` +
            'nginx reemplaza el juego entero, no lo fusiona',
        ).toContain(delServer);
      }
    }
  });

  it('el documento se sirve con todas ellas y sin caché', () => {
    const documento = LOCATIONS.find((bloque) => bloque.encabezado.includes('/index.html'));
    expect(documento, 'ya no hay location para el documento').toBeDefined();

    for (const delServer of DEL_SERVER) {
      expect(cabeceras(documento!.cuerpo)).toContain(delServer);
    }
    expect(documento!.cuerpo).toMatch(/Cache-Control "no-store/);
  });
});

describe('nginx.conf — caché', () => {
  it('sólo /assets/ es inmutable: es lo único que Vite nombra con hash', () => {
    const inmutables = LOCATIONS.filter((bloque) => bloque.cuerpo.includes('immutable'));
    expect(inmutables.map((bloque) => bloque.encabezado)).toEqual(['location /assets/']);
    expect(inmutables[0]?.cuerpo).toMatch(/expires 1y/);
  });

  it('lo que sale de public/ no se marca inmutable: conserva su nombre sin hash', () => {
    // og.png, favicons, fuentes, grano, robots y sitemap se sirven por aquí.
    // Marcarlos inmutables un año dejaría a los visitantes con la versión vieja
    // después de regenerar la tarjeta social o cambiar el dominio.
    const resto = LOCATIONS.find((bloque) => bloque.encabezado === 'location /');
    expect(resto, 'ya no hay location de respaldo').toBeDefined();
    expect(resto!.cuerpo).not.toContain('immutable');
    expect(resto!.cuerpo).toMatch(/max-age=86400/);
  });

  it('las rutas inventadas dan 404, no la portada: los soft-404 penalizan', () => {
    const resto = LOCATIONS.find((bloque) => bloque.encabezado === 'location /');
    expect(resto!.cuerpo).toMatch(/try_files \$uri \$uri\/ =404;/);
  });
});

describe('el puerto y la sustitución de plantilla', () => {
  it('nginx escucha en ${PORT}, que es lo que Railway inyecta', () => {
    expect(CONFIG).toMatch(/listen \$\{PORT\};/);
  });

  it('el Dockerfile sirve este fichero como plantilla y acota el envsubst a PORT', () => {
    expect(DOCKERFILE).toContain('COPY nginx.conf /etc/nginx/templates/default.conf.template');

    // Comprobado ejecutando el mismo envsubst que el entrypoint de nginx:alpine:
    // sin filtro, la lista de sustitución la forman TODAS las variables de
    // entorno del contenedor, y una que se llame `uri` convierte
    // «try_files $uri $uri/ =404;» en «try_files  / =404;» sin decir nada.
    expect(DOCKERFILE).toMatch(/ENV NGINX_ENVSUBST_FILTER="\^PORT\\\$"/);
  });
});
