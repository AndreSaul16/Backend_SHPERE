import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * QA-4 · defecto 2 — las cabeceras de seguridad tienen que LLEGAR al documento.
 *
 * El gotcha de nginx que las tiraba a la basura: `add_header` NO se hereda del
 * bloque `server` en un `location` que declare su propio `add_header`. Se
 * reemplaza el juego entero, no se fusiona.
 *
 * Las cuatro cabeceras estaban puestas a nivel de `server`, pero
 * `location = /index.html` declara su `Cache-Control` de «no cachear». Como el
 * SPA sirve `index.html` para CUALQUIER ruta (el `try_files` hace redirección
 * interna y vuelve a casar el location), el documento —el único sitio donde
 * estas cabeceras hacen algo— salía sin ninguna de las cuatro.
 *
 * Esto no se puede probar arrancando nginx desde los tests, así que se prueba
 * sobre el fichero: es una guarda estructural, y lo dice de frente. Lo que
 * garantiza es que nadie vuelva a añadir un `add_header` a un `location` y se
 * lleve por delante las cabeceras sin enterarse.
 *
 * `nginx.conf.template` es el que se despliega (Dockerfile + envsubst en
 * docker-entrypoint.sh); `nginx.conf` es el de local. Se comprueban los dos.
 */

const RAIZ = resolve(__dirname, '..', '..');

const PLANTILLA = readFileSync(resolve(RAIZ, 'nginx.conf.template'), 'utf8');
const LOCAL = readFileSync(resolve(RAIZ, 'nginx.conf'), 'utf8');

const CONFIGS: Record<string, string> = {
    'nginx.conf.template': PLANTILLA,
    'nginx.conf': LOCAL,
};

const CABECERAS_DE_SEGURIDAD = [
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Referrer-Policy',
    'Cross-Origin-Opener-Policy',
];

/**
 * `same-origin-allow-popups` y no `same-origin`: la página ABRE popups de
 * login (Google, GitHub, Microsoft) y necesita conservar la relación `opener`
 * con ellos. Tampoco `unsafe-none`, que es no aislarse de nadie.
 */
const COOP = 'same-origin-allow-popups';

interface Bloque {
    encabezado: string;
    cuerpo: string;
}

/** Los bloques `location … { … }`, casando llaves para respetar el anidamiento. */
function bloquesDeLocation(config: string): Bloque[] {
    const bloques: Bloque[] = [];
    const apertura = /location[^{]*\{/g;
    let m: RegExpExecArray | null;

    while ((m = apertura.exec(config)) !== null) {
        const inicioCuerpo = m.index + m[0].length;
        let profundidad = 1;
        let i = inicioCuerpo;
        while (i < config.length && profundidad > 0) {
            if (config[i] === '{') profundidad++;
            else if (config[i] === '}') profundidad--;
            i++;
        }
        bloques.push({
            encabezado: m[0].replace(/\s*\{$/, '').trim(),
            cuerpo: config.slice(inicioCuerpo, i - 1),
        });
    }

    return bloques;
}

/** Las líneas `add_header` de seguridad, normalizadas y ordenadas. */
function lineasDeSeguridad(config: string): string[] {
    return config
        .split('\n')
        .map((linea) => linea.trim())
        .filter((linea) =>
            CABECERAS_DE_SEGURIDAD.some((c) => linea.startsWith(`add_header ${c}`)),
        )
        .sort();
}

describe('las cabeceras de seguridad llegan al documento', () => {
    it.each(Object.keys(CONFIGS))(
        '%s: el documento (location = /index.html) las lleva todas',
        (nombre) => {
            const documento = bloquesDeLocation(CONFIGS[nombre]).find((b) =>
                b.encabezado.includes('/index.html'),
            );
            expect(documento, `${nombre} ya no tiene el location del documento`).toBeDefined();

            for (const cabecera of CABECERAS_DE_SEGURIDAD) {
                expect(
                    documento!.cuerpo,
                    `${nombre}: el documento sale sin ${cabecera}`,
                ).toContain(cabecera);
            }
        },
    );

    it.each(Object.keys(CONFIGS))(
        '%s: todo location que declare add_header repite el juego completo',
        (nombre) => {
            const config = CONFIGS[nombre];
            const conAddHeader = bloquesDeLocation(config).filter((b) =>
                b.cuerpo.includes('add_header'),
            );

            // Si no hubiera ninguno, el test no probaría nada: el gotcha de
            // nginx sólo muerde cuando un location declara su propio add_header.
            expect(
                conAddHeader.length,
                `${nombre}: ningún location declara add_header`,
            ).toBeGreaterThan(0);

            for (const bloque of conAddHeader) {
                for (const cabecera of CABECERAS_DE_SEGURIDAD) {
                    expect(
                        bloque.cuerpo,
                        `${nombre}: «${bloque.encabezado}» pierde ${cabecera}`,
                    ).toContain(cabecera);
                }
            }
        },
    );

    it.each(Object.keys(CONFIGS))(
        '%s: el nivel server las sigue teniendo, para los location que no declaran ninguna',
        (nombre) => {
            const config = CONFIGS[nombre];
            const soloServer = bloquesDeLocation(config).reduce(
                (resto, b) => resto.replace(b.cuerpo, ''),
                config,
            );

            for (const cabecera of CABECERAS_DE_SEGURIDAD) {
                expect(soloServer, `${nombre}: falta ${cabecera} en server`).toContain(cabecera);
            }
        },
    );
});

describe('el valor de la COOP', () => {
    it.each(Object.keys(CONFIGS))('%s: es same-origin-allow-popups, siempre', (nombre) => {
        const valores = [
            ...CONFIGS[nombre].matchAll(/Cross-Origin-Opener-Policy\s+"([^"]+)"/g),
        ].map((m) => m[1]);

        expect(valores.length, `${nombre}: no declara COOP`).toBeGreaterThan(0);
        expect(new Set(valores), `${nombre}: COOP con valores distintos`).toEqual(new Set([COOP]));
    });
});

describe('los dos ficheros no se separan', () => {
    it('nginx.conf y nginx.conf.template declaran las mismas cabeceras', () => {
        expect(lineasDeSeguridad(LOCAL)).toEqual(lineasDeSeguridad(PLANTILLA));
    });

    it('las cabeceras son texto literal: envsubst no tiene nada que comerse', () => {
        const lineas = lineasDeSeguridad(PLANTILLA);
        expect(lineas.length).toBeGreaterThan(0);
        for (const linea of lineas) {
            // Un `$` aquí lo sustituiría `envsubst` en el arranque del contenedor
            // y la cabecera se desplegaría vacía.
            expect(linea, `envsubst se comería: ${linea}`).not.toContain('$');
        }
    });
});
