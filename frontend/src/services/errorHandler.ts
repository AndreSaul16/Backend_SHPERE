/**
 * Handler central de errores estructurados del backend.
 *
 * El backend devuelve respuestas con shape:
 * {
 *   "error": "billing.insufficient_credits",   // code machine-readable
 *   "message": "Has agotado tus mensajes...",  // string humano
 *   "details": { plan_id: "free", ... }        // contexto
 * }
 *
 * Este módulo:
 * 1. Parsea cualquier respuesta de error (estructurada o no).
 * 2. Mapea códigos a acciones (paywall, toast, redirect, etc.).
 * 3. Devuelve un objeto AppError uniforme para que componentes muestren mensaje.
 */

import { useBillingStore } from '../store/useBillingStore';
import { RUTA_DE_INICIO } from '../lib/rutas';

export type ErrorCode =
    // auth
    | 'auth.missing_token'
    | 'auth.invalid_token'
    | 'auth.expired_token'
    | 'auth.user_disabled'
    // perm
    | 'perm.not_owner'
    | 'perm.plan_not_allowed'
    // billing
    | 'billing.insufficient_credits'
    | 'billing.invalid_plan'
    | 'billing.stripe_error'
    | 'billing.no_customer'
    | 'billing.webhook_invalid_signature'
    | 'billing.webhook_invalid_payload'
    // rag
    | 'rag.quota_exceeded'
    | 'rag.file_too_large'
    | 'rag.file_type_unsupported'
    | 'rag.file_empty'
    | 'rag.agent_files_limit'
    | 'rag.doc_not_found'
    // agents
    | 'agents.quota_exceeded'
    | 'agents.not_found'
    | 'agents.invalid_model'
    // llm
    | 'llm.upstream_error'
    | 'llm.timeout'
    | 'llm.context_too_long'
    // session
    | 'session.not_found'
    | 'session.locked'
    // tools
    | 'tool.not_authorized'
    | 'tool.invalid_args'
    | 'tool.upstream_error'
    // genéricos
    | 'common.bad_request'
    | 'common.internal_error'
    | 'common.rate_limited'
    | 'common.unknown';

export interface AppError {
    code: ErrorCode;
    message: string;
    details: Record<string, unknown>;
    status: number;
}

/**
 * Parsea la respuesta de error del backend.
 * Tolera respuestas no estructuradas (compat con HTTPException legacy).
 */
/** ¿Es un objeto JSON al que se le pueden leer claves? */
function esObjeto(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export async function parseError(response: Response): Promise<AppError> {
    let body: unknown = null;
    try {
        body = await response.json();
    } catch {
        // No-JSON, devolvemos error genérico.
        return {
            code: 'common.unknown',
            message: response.statusText || `HTTP ${response.status}`,
            details: {},
            status: response.status,
        };
    }

    /* Cuerpo de FastAPI: `{ detail: { error, message, details } }` o
       `{ detail: "cadena" }`. D43 — antes `body` era `any` y esto se leía a
       ciegas: `detail.error`, `detail.message` y `detail.details` se accedían
       sin que nadie hubiera comprobado que `detail` es un objeto, así que un
       cuerpo con `detail: 0` reventaba aquí dentro y el fallo real se perdía
       detrás de un TypeError. */
    const envoltorio = esObjeto(body) ? body : {};
    const detail: unknown = 'detail' in envoltorio ? envoltorio.detail : body;

    if (esObjeto(detail) && typeof detail.error === 'string') {
        return {
            code: detail.error as ErrorCode,
            message: typeof detail.message === 'string' ? detail.message : response.statusText,
            details: esObjeto(detail.details) ? detail.details : {},
            status: response.status,
        };
    }

    // Legacy: detail es string.
    return {
        code: inferCodeFromStatus(response.status),
        message: typeof detail === 'string' ? detail : response.statusText,
        details: {},
        status: response.status,
    };
}

function inferCodeFromStatus(status: number): ErrorCode {
    switch (status) {
        case 401:
            return 'auth.invalid_token';
        case 402:
            return 'billing.insufficient_credits';
        case 403:
            return 'perm.plan_not_allowed';
        case 404:
            return 'common.bad_request';
        case 429:
            return 'common.rate_limited';
        case 502:
        case 504:
            return 'llm.upstream_error';
        default:
            return status >= 500 ? 'common.internal_error' : 'common.bad_request';
    }
}

/**
 * Aplica la acción asociada al código (abrir paywall, toast, etc.).
 * Devuelve el error para que el caller pueda usarlo (mostrar en UI, etc.).
 */
export function handleError(err: AppError): AppError {
    const billing = useBillingStore.getState();

    switch (err.code) {
        case 'billing.insufficient_credits':
            billing.openPaywall('402');
            break;
        case 'rag.quota_exceeded':
            billing.openPaywall('rag_full');
            break;
        case 'agents.quota_exceeded':
            billing.openPaywall('agents_full');
            break;
        case 'perm.plan_not_allowed':
            billing.openPaywall('upgrade_cta');
            break;
        case 'auth.invalid_token':
        case 'auth.expired_token':
            // Limpiar TODO el estado del usuario antes de redirigir (A6): si no,
            // en un navegador compartido el siguiente login vería datos de la
            // cuenta anterior hasta que los stores se recarguen.
            //
            // El destino es la casa del producto y NO la raíz del dominio: esto
            // es una recarga de verdad (`window.location`), o sea que la pide
            // nginx, y nginx sirve la landing de marketing en `/`. Con `'/'`
            // aquí, a quien se le caduca el token le aparecía la portada
            // comercial en vez de la pantalla de identificarse. Yendo a `/chat`
            // entra la SPA, `RequireAuth` ve que no hay sesión y manda a
            // `/login` guardando el destino — que es lo que este `case` quería
            // decir desde el principio.
            if (typeof window !== 'undefined') {
                import('../lib/clearStores').then(({ clearUserStores }) => {
                    clearUserStores();
                    window.location.href = RUTA_DE_INICIO;
                }).catch(() => {
                    window.location.href = RUTA_DE_INICIO;
                });
            }
            break;
        case 'common.rate_limited':
            // Toast: "demasiadas peticiones, espera unos segundos".
            // (Si no hay sistema de toast aún, se queda como console.warn.)
            console.warn('Rate limited:', err.message);
            break;
        default:
            // Sin acción específica. Caller decide qué mostrar.
            break;
    }
    return err;
}

/**
 * Conveniente: parsea + handle en un paso.
 */
export async function handleResponseError(response: Response): Promise<AppError> {
    const err = await parseError(response);
    return handleError(err);
}
