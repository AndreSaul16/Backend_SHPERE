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
import { useShallow } from 'zustand/react/shallow';

import type { Agent, Message } from '../types';
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
    ...createErrorsSlice(set),
    ...createAgentsSlice(set, get),
    ...createSessionsSlice(set, get),
    ...createMessagesSlice(set, get),
    ...createBoardSlice(),
    ...createArtifactsSlice(set, get),
    ...createUiSlice(set),
    ...createResetSlice(set),
}));

// --- Selectores compartidos (tarea 4.6 · D20) -----------------------------
//
// Suscribirse al store ENTERO —`const { … } = useChatStore()`— re-renderiza el
// componente en cada `set`, y durante el streaming hay un `set` por token. Así
// es como un token repintaba a la vez el rail, el panel de artefactos, el
// selector de agentes, el shell y la aplicación entera desde `App`.
//
// Los selectores atómicos (`useChatStore(s => s.x)`) resuelven el caso normal.
// Estos dos hooks existen para los DOS casos que no se pueden resolver con uno
// atómico, porque el valor que hace falta no está guardado tal cual:
//
//   · la lista de agentes es `coreAgents` + `customAgents`, y concatenar dentro
//     de un selector devuelve un array nuevo en cada comprobación;
//   · el hilo de una sesión puede no existir todavía, y `?? []` tiene el mismo
//     problema.
//
// En Zustand 5 eso no es una ineficiencia: es un BUCLE. `useSyncExternalStore`
// compara la instantánea por identidad, ve un valor distinto cada vez y vuelve
// a renderizar sin parar («The result of getSnapshot should be cached»). Por eso
// uno usa `useShallow` y el otro una constante de módulo.

/**
 * Quién puede hablar: directores de fábrica + agentes a medida.
 *
 * `useShallow` compara elemento a elemento, así que el array nuevo que produce
 * el `concat` sólo cuenta como cambio cuando de verdad ha entrado o salido un
 * agente. Es el sustituto de llamar a `getAgents()` en el cuerpo del
 * componente, que además NO suscribía: un agente nuevo no repintaba la lista
 * hasta que otra cosa forzara el render.
 */
export const useAgentes = (): Agent[] =>
    useChatStore(useShallow((s) => [...s.coreAgents, ...s.customAgents]));

/**
 * El hilo vacío. Es UNA constante de módulo, congelada, y esto no es cosmético:
 * devolver `[]` recién creado desde un selector es el bucle de render descrito
 * arriba. Congelado, además, para que nadie le haga `push` creyendo que es suyo.
 */
const HILO_VACIO: readonly Message[] = Object.freeze([]);

/** El hilo de una sesión, sin suscribirse a los de las demás. */
export const useMensajesDeSesion = (sessionId: string | null): Message[] =>
    useChatStore((s) => (sessionId ? s.messagesBySession[sessionId] : undefined) ?? (HILO_VACIO as Message[]));

/** ¿Está transmitiendo ESTA sesión? Un booleano, o sea nunca una referencia nueva. */
export const useEstaTransmitiendo = (sessionId: string | null): boolean =>
    useChatStore((s) => !!sessionId && s.streamingSessionIds.includes(sessionId));

// --- Puerta pública -------------------------------------------------------
// Lo que la aplicación importaba de este módulo antes del troceo sigue
// importándose de aquí. Los slices son detalle interno.

export type { BoardAgentStatus, BoardSessionState, NewCustomAgentInput } from './chat/types';
export { AGENT_HEX, BOARD_DEVIL_AGENT, getBoardAgentByRole, getGroupMembers } from './chat/agentCatalog';
export { GROUP_CHAT_ID, resolveSessionAgentId } from './chat/sessionIdentity';
export { rebuildBoardSession } from './chat/boardSession';
export { initialSidebarOpen } from './chat/uiSlice';
