/**
 * Los modelos que el producto ofrece, en un solo sitio.
 *
 * Había tres listas distintas y ninguna sabía de las otras (D65/D66):
 * `AgentDetailPage` restringía a dos identificadores, `MODEL_OPTIONS` del
 * asistente ofrecía esos mismos dos pero su estado inicial «desde cero»
 * arrancaba en un tercero (`deepseek-chat`, que no existía en la lista: el
 * radio quedaba sin marcar), y `AgentOverridesSettings` era un campo de texto
 * libre donde cabía cualquier cosa, incluida una errata que el backend
 * aceptaba y luego fallaba al invocar.
 *
 * Una lista, un tipo, y un `esModeloPermitido` para las respuestas del
 * servidor, que sí pueden traer identificadores viejos.
 */

export interface OpcionDeModelo {
    value: string;
    label: string;
    description: string;
}

export const MODELOS: readonly OpcionDeModelo[] = [
    {
        value: 'deepseek-v4-pro',
        label: 'DeepSeek V4 Pro',
        description: 'Razonamiento máximo (recomendado)',
    },
    {
        value: 'deepseek-v4-flash',
        label: 'DeepSeek V4 Flash',
        description: 'Rápido y económico',
    },
] as const;

/** Los identificadores, en el orden en que se pintan. */
export const IDS_DE_MODELO = MODELOS.map((m) => m.value) as readonly string[];

/** El que se elige cuando no hay nada elegido. */
export const MODELO_POR_DEFECTO = MODELOS[0].value;

export function esModeloPermitido(valor: string | undefined | null): boolean {
    return typeof valor === 'string' && IDS_DE_MODELO.includes(valor);
}

/** El valor del servidor si es uno de los nuestros; si no, el de por defecto. */
export function normalizarModelo(valor: string | undefined | null): string {
    return esModeloPermitido(valor) ? (valor as string) : MODELO_POR_DEFECTO;
}

/** La etiqueta legible de un identificador. Sin coincidencia, el crudo. */
export function etiquetaDeModelo(valor: string): string {
    return MODELOS.find((m) => m.value === valor)?.label ?? valor;
}
