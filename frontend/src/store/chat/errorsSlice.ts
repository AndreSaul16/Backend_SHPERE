/**
 * El canal de errores por método.
 *
 * Es estado compartido: casi todos los slices escriben en él, pero ninguno lo
 * duplica — se toca siempre con `set(conError(...))`, que parte del
 * `errorStates` que ya hay en el store.
 *
 * Quién avisa de qué (tarea 1.13). Regla: **un error, un aviso**. Cuando una
 * acción de usuario atraviesa store y componente, avisa el que sabe QUÉ
 * intentaba hacer el usuario, que es el componente; el store se limita a
 * relanzar. Por eso `deleteSession` y `updateSessionMetadata` no emiten nada:
 * lo hacen `Sidebar` y `ChatSettingsPage`, que sí pueden nombrar la junta o el
 * campo. Si el store avisara además, el mismo fallo saldría dos veces.
 *
 * Lo que sí se escribe aquí lo pinta `ErrorOverlay`, montado en `App`.
 */
import type { ErrorContext } from '../../lib/errors';
import type { ErrorsSlice, ErrorStates } from './types';

export const ERRORES_EN_BLANCO: ErrorStates = {
    fetch_agents: null,
    create_session: null,
    send_message: null,
    load_history: null,
    artifact_parser: null,
    core_engine: null,
};

/**
 * Actualizador para `set`: cambia UN método y conserva el resto.
 *
 * Se usa como `set(conError('fetch_agents', mensaje))`.
 */
export const conError = (context: ErrorContext, message: string | null) =>
    (state: { errorStates: ErrorStates }): { errorStates: ErrorStates } => ({
        errorStates: { ...state.errorStates, [context]: message },
    });

export const createErrorsSlice = (): ErrorsSlice => ({
    errorStates: { ...ERRORES_EN_BLANCO },
});
