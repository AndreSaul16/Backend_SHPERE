/**
 * El bloque de código dentro del markdown de un turno (tarea 4.4).
 *
 * Antes esto lo hacía `rehype-highlight` en el árbol de `react-markdown`, con el
 * tema `highlight.js/styles/atom-one-dark.css` importado desde `MessageBubble`.
 * O sea: DOS motores de resaltado en la app —`highlight.js` aquí y Prism en el
 * panel de artefactos—, cada uno con sus gramáticas y su paleta. El mismo
 * fragmento de TypeScript salía de dos colores según dónde se leyera, y el peso
 * se pagaba dos veces.
 *
 * Ahora los dos sitios usan el mismo `prism-light` de `@/lib/resaltado`, con las
 * mismas ocho gramáticas.
 *
 * Reglas de la casa que se respetan aquí:
 *
 * - **El código en línea no se toca.** Lo pinta `.doc-prose code` (§13) y no es
 *   un bloque: distinguirlo por la clase `language-*` que `react-markdown` pone
 *   sólo en el bloque cercado.
 * - **Un lenguaje no registrado se pinta sin colorear.** `refractor` lanza si le
 *   piden una gramática que no tiene, y un turno no se cae porque el modelo
 *   escribiera ```rust.
 * - **La caja la sigue poniendo `.doc-prose pre`**: relleno, filete y radio del
 *   contrato. Por eso `customStyle` deja el resaltado sin fondo, sin margen y
 *   sin relleno — si además pintara los suyos habría dos cajas concéntricas.
 */
import type { ComponentPropsWithoutRef } from 'react';
import { PrismLight as SyntaxHighlighter, lenguajeSoportado } from '@/lib/resaltado';
import { useTemaDeCodigo } from '@/hooks/useTemaDeCodigo';

const SIN_CAJA_PROPIA = {
    margin: 0,
    padding: 0,
    background: 'none',
    // El tamaño y la familia los fija `.doc-prose pre code`; el resaltado trae
    // los suyos en línea y ganarían.
    fontSize: 'inherit',
    fontFamily: 'inherit',
} as const;

export function CodigoMarkdown({ className, children, ...props }: ComponentPropsWithoutRef<'code'>) {
    const temaCodigo = useTemaDeCodigo();
    const lenguaje = /language-([\w-]+)/.exec(className ?? '')?.[1];

    if (!lenguaje || !lenguajeSoportado(lenguaje)) {
        return <code className={className} {...props}>{children}</code>;
    }

    return (
        <SyntaxHighlighter
            language={lenguaje.toLowerCase()}
            style={temaCodigo}
            // `div` y no `pre`: `react-markdown` ya ha abierto el `<pre>` del
            // contrato alrededor de este `<code>`, y un `<pre>` dentro de otro
            // duplicaría la caja y el ritmo vertical.
            PreTag="div"
            customStyle={SIN_CAJA_PROPIA}
            codeTagProps={{ style: SIN_CAJA_PROPIA }}
        >
            {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
    );
}
