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

/**
 * Los bloques `location … { … }`, casando llaves para respetar el anidamiento.
 *
 * La apertura se ancla a principio de línea y no cruza saltos: este fichero de
 * configuración explica el gotcha de nginx en prosa, y un patrón suelto casaba
 * la palabra «location» dentro de un comentario y se tragaba todo hasta la
 * siguiente llave. El encabezado que salía era entonces un párrafo entero, y
 * `find(b => b.encabezado.includes('/index.html'))` podía devolver el bloque
 * equivocado — un test que mira otra cosa y sale verde. Los comentarios
 * empiezan por `#`, así que anclados no cuelan.
 */
function bloquesDeLocation(config: string): Bloque[] {
    const bloques: Bloque[] = [];
    const apertura = /^[ \t]*location[^{\n]*\{/gm;
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

/**
 * La landing de marketing (frontend/landing) se construye en la misma imagen y
 * se sirve desde este mismo nginx: el documento en la RAÍZ y sus assets bajo
 * /landing/. Son bloques nuevos que declaran `add_header`, o sea que son
 * exactamente el caso en el que el gotcha de arriba muerde — y además llevan la
 * primera pantalla del dominio, que es la que ve todo el mundo.
 */
describe('la landing en la raíz', () => {
    const raizDe = (config: string) =>
        bloquesDeLocation(config).find((b) => b.encabezado.replace(/\s+/g, ' ') === 'location = /');

    it.each(Object.keys(CONFIGS))(
        '%s: la raíz sirve el documento de la landing, sin caché y sin redirección interna',
        (nombre) => {
            const raiz = raizDe(CONFIGS[nombre]);
            expect(raiz, `${nombre}: la raíz ya no tiene bloque propio`).toBeDefined();

            // El fichero se nombra entero a propósito. Un `try_files $uri` o un
            // fallback a /index.html rebotaría a otro location y las cabeceras
            // de este bloque no llegarían al documento.
            expect(raiz!.cuerpo).toMatch(/try_files\s+\/landing\/index\.html\s+=404;/);
            expect(raiz!.cuerpo).toMatch(/Cache-Control "no-store/);

            for (const cabecera of CABECERAS_DE_SEGURIDAD) {
                expect(
                    raiz!.cuerpo,
                    `${nombre}: la portada del dominio sale sin ${cabecera}`,
                ).toContain(cabecera);
            }
        },
    );

    it.each(Object.keys(CONFIGS))(
        '%s: /landing redirige a la raíz en vez de servir una segunda copia',
        (nombre) => {
            const redireccion = bloquesDeLocation(CONFIGS[nombre]).find((b) =>
                b.encabezado.includes('^/landing'),
            );
            expect(
                redireccion,
                `${nombre}: nada redirige /landing y el documento queda en dos URLs`,
            ).toBeDefined();
            expect(redireccion!.cuerpo).toMatch(/return 301 \/;/);

            // El patrón tiene que exigir final de cadena: sin el `$`, se
            // llevaría por delante /landing/assets/… y la página se quedaría
            // sin estilos ni JavaScript, redirigiendo cada asset a la portada.
            expect(redireccion!.encabezado).toContain('$');
        },
    );

    it('los dos ficheros sirven la landing igual', () => {
        // La paridad de más abajo sólo compara las líneas de cabecera. Estos
        // bloques no llevan ninguna cabecera propia salvo las repetidas, así
        // que se comparan enteros.
        const bloquesLanding = (config: string) =>
            bloquesDeLocation(config)
                .filter((b) => /^location (= \/$|~ \^\/landing)/.test(b.encabezado.trim()))
                .map((b) => `${b.encabezado.replace(/\s+/g, ' ')}\n${b.cuerpo.trim()}`);

        expect(bloquesLanding(LOCAL)).toEqual(bloquesLanding(PLANTILLA));
    });
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
