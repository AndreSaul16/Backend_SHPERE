/**
 * El borrado al cambiar de cuenta (A6).
 *
 * No vive en ningún slice porque no es de ninguno: cruza los seis. Lo llama
 * `clearUserStores` al cerrar o invalidar sesión, ANTES de cualquier redirect.
 *
 * Ojo con lo que NO borra —y es a propósito—: `isSidebarOpen`,
 * `isAgentModalOpen`, `isArtifactPanelOpen` y `abortController`. Cerrar sesión
 * no reorganiza la ventana.
 */
import { MOCK_AGENTS } from './agentCatalog';
import { ERRORES_EN_BLANCO } from './errorsSlice';
import type { ChatSet, ResetSlice } from './types';

export const createResetSlice = (set: ChatSet): ResetSlice => ({
    resetState: () => set({
        // Limpia TODO lo específico del usuario para evitar fuga de datos entre
        // cuentas en un navegador compartido (A6).
        //
        // D28: los coreAgents ya NO se conservan. Eran «globales» mientras
        // nadie podía tocarlos, pero `renameAgent`/`updateAgentColor` los
        // reescriben con el nombre y el color que les da CADA usuario, así que
        // dejarlos puestos enseñaba al siguiente los directores del anterior.
        // Vuelven a los de fábrica; `clearStores` borra además los retoques
        // guardados.
        coreAgents: MOCK_AGENTS,
        messagesBySession: {},
        artifacts: [],
        currentSessionId: null,
        selectedAgentId: null,
        streamingSessionIds: [],
        sessions: [],
        // Al cambiar de cuenta el historial vuelve a ser desconocido, no vacío.
        historialCargado: false,
        customAgents: [],
        sessionsByAgent: {},
        activeArtifactId: null,
        streamingArtifactBySession: {},
        // §8.7: lo que un agente hizo en el mundo por cuenta de un usuario no
        // se le enseña al siguiente que abra el navegador.
        registroDeActuaciones: [],
        boardSession: null,
        errorStates: { ...ERRORES_EN_BLANCO },
    }),
});
