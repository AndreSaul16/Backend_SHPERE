/**
 * Sistema de Errores Tipados de SPHERE v2.0
 */

export type ErrorContext = 'fetch_agents' | 'create_session' | 'send_message' | 'load_history' | 'artifact_parser' | 'core_engine';

export class SphereError extends Error {
    public message: string;
    public context: ErrorContext;
    /** La causa. `unknown` y no `any`: nadie la lee sin comprobarla antes. */
    public originalError?: unknown;

    constructor(
        message: string,
        context: ErrorContext,
        originalError?: unknown
    ) {
        super(message);
        this.message = message;
        this.context = context;
        this.originalError = originalError;
        this.name = 'SphereError';
    }
}

/**
 * El motivo de un fallo, sin las tripas.
 *
 * `services/api.ts` lanza sus errores como `«500 common.internal_error: La API
 * está caída»`: estado HTTP, código interno y, al final, el texto que el
 * backend SÍ redacta para que lo lea una persona. Las pantallas pintaban la
 * cadena entera, y §11 lo prohíbe por dos motivos a la vez —«nada de volcar el
 * error.message crudo» y «los identificadores internos no se muestran»—.
 *
 * Esto se queda sólo con la última parte, y sólo para el hueco de «motivo» de
 * `<InlineError>`, que va en letra pequeña y debajo. Nunca para un título.
 * Devuelve `undefined` si lo que queda no aporta nada.
 */
export function motivoLegible(err: unknown): string | undefined {
    const bruto = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
    // «NNN dominio.codigo: » al principio — el prefijo que pone `req()`.
    const limpio = bruto.replace(/^\d{3}\s+[a-z_]+\.[a-z_]+:\s*/i, '').trim();
    if (!limpio) return undefined;
    // Si tras limpiar sigue siendo un código o un estado a secas, no es motivo.
    if (/^[a-z_]+\.[a-z_]+$/i.test(limpio) || /^\d{3}$/.test(limpio)) return undefined;
    return limpio;
}

/**
 * Fallos relacionados con la red o el backend
 */
export class NetworkError extends SphereError {
    constructor(message: string, context: ErrorContext, originalError?: unknown) {
        super(message, context, originalError);
        this.name = 'NetworkError';
    }
}

/**
 * Errores durante el procesamiento de datos (ej: XML malformado)
 */
export class ParserError extends SphereError {
    constructor(message: string, context: ErrorContext, originalError?: unknown) {
        super(message, context, originalError);
        this.name = 'ParserError';
    }
}

/**
 * Errores de sesión (expiración, ID no encontrado)
 */
export class SessionError extends SphereError {
    constructor(message: string, context: ErrorContext, originalError?: unknown) {
        super(message, context, originalError);
        this.name = 'SessionError';
    }
}
