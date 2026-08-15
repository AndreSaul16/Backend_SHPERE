import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { RUTA_DE_INICIO } from '../../src/lib/rutas';

/**
 * Guardia mecánica: la casa del producto está en `/chat`, y no vuelve a `/`.
 *
 * **Por qué existe.** La landing de marketing se publica en la raíz EXACTA del
 * dominio: nginx atiende `location = /` con su HTML y sólo el resto de rutas
 * caen en la SPA. O sea que `/` dejó de ser una ruta del producto — quien
 * recarga ahí ve la portada comercial, no su chat.
 *
 * El enrutador ya lo sabe (`/` redirige a `/chat`), así que un `to="/"` nuevo
 * *seguiría funcionando* en desarrollo y en los tests: un salto de más y nadie
 * se entera. Ese es justo el fallo que este fichero previene, porque en
 * producción no es un salto de más — es una recarga completa cuando el enlace
 * lo sigue el navegador, y el usuario acaba en la landing.
 *
 * **Los comentarios se limpian antes de contar.** Esta casa documenta los
 * cambios citando el valor viejo (`RequireAuth.tsx` explica en prosa que «la
 * redirección era `<Navigate to="/login">`»), y `src/lib/rutas.ts` cita los
 * dos literales prohibidos para explicar por qué lo están. Un guard que mirase
 * el fuente en crudo prohibiría escribir esa documentación, que es peor
 * negocio que el propio bug. Se quitan bloques `/* … *\/` —los `{/* … *\/}` de
 * JSX entran ahí— y líneas `//`, protegiendo los `https://` para no comerse
 * media línea de código detrás de una URL.
 *
 * **No hay excepciones, ni siquiera para `App.tsx`.** La ruta que el enrutador
 * necesita se escribe `<Route path="/">`, y su redirección es
 * `<Navigate to={RUTA_DE_INICIO}>`: ninguna de las dos contiene los literales
 * de abajo. La regla puede ser absoluta, así que lo es.
 */

/** Todos los `.ts` y `.tsx` de `src/`, recursivamente. */
function ficherosDeFuente(dir: string): string[] {
    return readdirSync(dir).flatMap((entrada) => {
        const ruta = join(dir, entrada);
        if (statSync(ruta).isDirectory()) return ficherosDeFuente(ruta);
        return /\.tsx?$/.test(ruta) ? [ruta] : [];
    });
}

/** El fuente sin comentarios: lo que el navegador ejecuta de verdad. */
export function sinComentarios(fuente: string): string {
    return fuente
        // Bloques. `[\s\S]` y no `.` porque cruzan saltos de línea, y perezoso
        // para no fundir dos comentarios distintos en uno.
        .replace(/\/\*[\s\S]*?\*\//g, '')
        // Líneas. El `(^|[^:])` deja intactos los `https://…` de las cadenas:
        // sin él, la barra doble de una URL se tragaría el resto de la línea.
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Las formas de escribir «la raíz» como destino. Cubren comillas simples,
 * dobles y plantilla, y la envoltura `{…}` de JSX.
 */
const PROHIBIDOS: ReadonlyArray<{ nombre: string; patron: RegExp }> = [
    // `to="/"`, `to='/'`, to=`/`, `to={"/"}`, `to={'/'}` — incluye el
    // `<Navigate to="/">` y el `<Link to="/">`, que llevan el mismo atributo.
    { nombre: 'to="/"', patron: /(^|[^\w$])to=\{?\s*(['"`])\/\2\s*\}?/ },
    // `navigate('/')`, `navigate("/")`, navigate(`/`) y con segundo argumento:
    // `navigate('/', { replace: true })`.
    { nombre: "navigate('/')", patron: /(^|[^\w$])navigate\(\s*(['"`])\/\2\s*[,)]/ },
    // El destino de reserva. Esta entrada NO estaba en el encargo y se añadió
    // al comprobar que era el único agujero real: `destinoDeRegreso(state) ??
    // '/'` (la forma que tenían `LoginPage` y `VerifyEmailPage`) no la caza
    // ninguno de los patrones de arriba, y tampoco la caza un test de
    // comportamiento — porque la ruta `/` del enrutador redirige a `/chat` y el
    // usuario acaba en el mismo sitio. O sea que sería un salto de más
    // invisible, que es exactamente la definición de deuda.
    { nombre: "?? '/' de reserva", patron: /(\?\?|\|\|)\s*(['"`])\/\2/ },
    // La recarga dura. Esta es la que de verdad acaba en la landing, porque la
    // pide nginx y no el enrutador.
    { nombre: "window.location = '/'", patron: /window\.location(\.href|\.pathname)?\s*=\s*(['"`])\/\2/ },
    { nombre: "window.location.assign('/')", patron: /window\.location\.(assign|replace)\(\s*(['"`])\/\2\s*\)/ },
];

const RAIZ = resolve(__dirname, '../..');
const SRC = join(RAIZ, 'src');

describe('la casa del producto vive en /chat', () => {
    it('la constante es la que el enrutador y nginx acordaron', () => {
        // Si esto cambia, cambia el contrato con `nginx.conf` (que reserva `/`
        // para la landing) y con los tests de comportamiento de más abajo.
        expect(RUTA_DE_INICIO).toBe('/chat');
    });

    it.each(PROHIBIDOS)('ningún fuente de src/ escribe `$nombre`', ({ patron }) => {
        const culpables = ficherosDeFuente(SRC)
            .map((f) => ({ f, codigo: sinComentarios(readFileSync(f, 'utf8')) }))
            .filter(({ codigo }) => patron.test(codigo))
            .map(({ f }) => relative(RAIZ, f));

        // Si algo tiene que apuntar a la casa, se importa `RUTA_DE_INICIO` de
        // `@/lib/rutas`. Añadir una excepción aquí es casi siempre la respuesta
        // equivocada: significa que una pantalla manda a la landing.
        expect(culpables).toEqual([]);
    });

    it('el guard sabe fallar (si no, no defiende nada)', () => {
        // Un guard sobre el fuente que nunca se ha visto fallar es decorado.
        const infracciones = [
            '<Link to="/">Inicio</Link>',
            "<Navigate to='/' replace />",
            '<Route element={<Navigate to={"/"} replace />} />',
            "navigate('/');",
            'navigate("/", { replace: true });',
            "window.location.href = '/';",
            "window.location.assign('/')",
            'const destino = destinoDeRegreso(location.state) ?? "/";',
            "const destino = guardado || '/';",
        ];

        for (const linea of infracciones) {
            expect(
                PROHIBIDOS.some(({ patron }) => patron.test(linea)),
                `no detectada: ${linea}`,
            ).toBe(true);
        }
    });

    it('el guard no ladra a los destinos que sí son legítimos', () => {
        // Falsos positivos: cada uno de estos existe hoy en `src/`.
        const inocentes = [
            '<Route path="/" element={<Navigate to={RUTA_DE_INICIO} replace />} />',
            '<Route path="/chat/:sessionId" element={<RutaDeChat />} />',
            '<Link to="/login">Entrar</Link>',
            '<Link to="/register">Descubre SPHERE</Link>',
            'navigate("/login", { replace: true });',
            'navigate(`/chat/${sessionId}`);',
            'navigate(destino, { replace: true });',
            'navigate(-1);',
            'window.location.href = data.url;',
            "const HOST = 'https://us.i.posthog.com';",
            "if (!destino.startsWith('/') || destino.startsWith('//')) return null;",
            'const destino = destinoDeRegreso(location.state) ?? RUTA_DE_INICIO;',
        ];

        for (const linea of inocentes) {
            const culpable = PROHIBIDOS.find(({ patron }) => patron.test(linea));
            expect(culpable?.nombre ?? null, `falso positivo en: ${linea}`).toBeNull();
        }
    });

    it('limpiar comentarios no se lleva por delante el código', () => {
        // El riesgo del stripper es al revés que el del guard: si se pasa de
        // celoso, borra código y el guard deja de ver las infracciones.
        const fuente = [
            "const HOST = 'https://ejemplo.test';",
            '// un comentario con navigate(\'/\') dentro',
            'navigate("/");',
            '/* bloque con to="/" dentro */',
            '<Link to="/" />',
        ].join('\n');

        const codigo = sinComentarios(fuente);

        expect(codigo).toContain("'https://ejemplo.test'");
        expect(codigo).toContain('navigate("/");');
        expect(codigo).toContain('<Link to="/" />');
        // …y sí se ha llevado lo que tenía que llevarse.
        expect(codigo).not.toContain('un comentario');
        expect(codigo).not.toContain('bloque con');
    });
});
