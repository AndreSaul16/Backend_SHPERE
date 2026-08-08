/**
 * El store de chat, compuesto por slices (D40).
 *
 * Este fichero eran 1267 líneas. Ahora sólo hace dos cosas: componer los slices
 * de `./chat` y seguir siendo la puerta pública del store, para que ningún
 * consumidor tenga que cambiar de sitio de dónde importa.
 *
 * El reparto es por RESPONSABILIDAD, no por tipo:
 *
 * - `agentsSlice`      quién puede hablar (directores + agentes a medida)
 * - `sessionsSlice`    qué conversación está abierta y con quién (P0 F2)
 * - `messagesSlice`    el hilo y su transmisión (+ `streamHandlers`)
 * - `boardSlice`       el estado vivo del debate (+ `boardStreamHandlers`)
 * - `artifactsSlice`   artefactos y su panel
 * - `uiSlice`          interruptores de chrome
 * - `errorsSlice`      el canal de errores por método
 * - `resetState`       el borrado al cambiar de cuenta, que cruza a todos
 *
 * El store sigue siendo PLANO: los slices se funden en un único objeto, así que
 * un slice lee a otro con `get()` y nunca duplicando estado.
 *
 * Nota de rendimiento (D20, fuera del alcance de D40): suscribirse al store
 * entero provoca un re-render por token de streaming. Los consumidores deberían
 * usar selectores; trocear el store no lo arregla por sí solo, pero tampoco lo
 * empeora.
 */
import { create } from 'zustand';

import { createAgentsSlice } from './chat/agentsSlice';
import { createArtifactsSlice } from './chat/artifactsSlice';
import { createBoardSlice } from './chat/boardSlice';
import { createErrorsSlice } from './chat/errorsSlice';
import { createMessagesSlice } from './chat/messagesSlice';
import { createResetSlice } from './chat/resetState';
import { createSessionsSlice } from './chat/sessionsSlice';
import { createUiSlice } from './chat/uiSlice';
import type { ChatState } from './chat/types';

export const useChatStore = create<ChatState>((set, get) => ({
    ...createErrorsSlice(),
    ...createAgentsSlice(set, get),
    ...createSessionsSlice(set, get),
    ...createMessagesSlice(set, get),
    ...createBoardSlice(),
    ...createArtifactsSlice(set, get),
    ...createUiSlice(set),
    ...createResetSlice(set),
}));

// --- Puerta pública -------------------------------------------------------
// Lo que la aplicación importaba de este módulo antes del troceo sigue
// importándose de aquí. Los slices son detalle interno.

export type { BoardAgentStatus, BoardSessionState, NewCustomAgentInput } from './chat/types';
export { AGENT_HEX, BOARD_DEVIL_AGENT, getBoardAgentByRole, getGroupMembers } from './chat/agentCatalog';
export { GROUP_CHAT_ID, resolveSessionAgentId } from './chat/sessionIdentity';
export { rebuildBoardSession } from './chat/boardSession';
export { initialSidebarOpen } from './chat/uiSlice';
