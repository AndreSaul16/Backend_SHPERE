/**
 * Quién puede hablar: los cinco directores de fábrica y los agentes a medida.
 *
 * `coreAgents` nace hidratado con los retoques del usuario (D28) y vuelve a
 * fábrica en `resetState`; ver `resetState.ts`, donde está la razón.
 */
import type { Agent, Role } from '../../types';
import { chatService } from '../../services/api';
import { NetworkError } from '../../lib/errors';
import { withAgentIdentityOverrides, saveAgentIdentityOverride } from '../../lib/agentIdentityOverrides';
import { AGENT_HEX, MOCK_AGENTS } from './agentCatalog';
import { conError } from './errorsSlice';
import type { AgentsSlice, ChatGet, ChatSet } from './types';

/** Traduce el agente a medida del backend al modelo del frontend. */
const mapCustomAgent = (a: any): Agent => ({
    id: a.agent_id,
    name: a.identity.name,
    role: a.identity.role as Role,
    description: a.brain_config.system_prompt.substring(0, 100) + '...',
    avatar: a.identity.name.charAt(0).toUpperCase(),
    color: 'bg-surface border-stroke-hairline',
    hexColor: a.identity.color || AGENT_HEX.custom,
    isOnline: true,
    identity: a.identity,
    brain_config: a.brain_config,
    owner_user_id: a.owner_user_id,
    is_public: a.is_public,
});

export const createAgentsSlice = (set: ChatSet, get: ChatGet): AgentsSlice => ({
    // D28: los retoques de nombre/color de los directores se guardan y se
    // recuperan al arrancar. Antes vivían sólo en memoria y se perdían al
    // recargar, con el modal diciendo «Guardar cambios» igual.
    coreAgents: withAgentIdentityOverrides(MOCK_AGENTS),
    customAgents: [],

    // Helper para obtener todos los agentes (Core + Custom)
    getAgents: () => [...get().coreAgents, ...get().customAgents],

    fetchCustomAgents: async () => {
        set(conError('fetch_agents', null));
        try {
            const customAgentsData = await chatService.getCustomAgents();
            // Mapear de Response a Agent tipo frontend evolucionado
            const mapped: Agent[] = customAgentsData.map(mapCustomAgent);
            set({ customAgents: withAgentIdentityOverrides(mapped) });
        } catch (error: any) {
            const sphereError = new NetworkError('Error al obtener agentes personalizados', 'fetch_agents', error);
            set(conError('fetch_agents', sphereError.message));
        }
    },

    addCustomAgent: async (data) => {
        set(conError('fetch_agents', null));
        try {
            const newAgentData = await chatService.createCustomAgent(data);
            const mapped = mapCustomAgent(newAgentData);
            set(state => ({ customAgents: [mapped, ...state.customAgents] }));
            // D67 — el identificador se DEVUELVE. Quien crea un agente y luego
            // le sube documentos lo leía de `customAgents[0]`, o sea de una
            // suposición sobre el orden de una lista compartida: si entre las
            // dos líneas entraba un `fetchCustomAgents` (lo hace el arranque),
            // los ficheros subían al agente equivocado.
            return mapped.id;
        } catch (error: any) {
            const sphereError = new NetworkError('Error al crear agente personalizado', 'fetch_agents', error);
            set(conError('fetch_agents', sphereError.message));
            throw sphereError; // Re-throw to allow UI to handle specific error
        }
    },

    // Sin `catch`: antes se tragaba el fallo aquí, así que el agente seguía en
    // la lista, el diálogo se cerraba igual y borrar era indistinguible de no
    // borrar. Ahora el rechazo llega a quien abrió el diálogo
    // (`AgentSelectorModal`), que es el único que sabe qué agente era.
    deleteCustomAgent: async (id) => {
        await chatService.deleteCustomAgent(id);
        set(state => ({ customAgents: state.customAgents.filter(a => a.id !== id) }));
    },

    renameAgent: (id, newName) => {
        // D28: además de la memoria, al almacén. El valor de retorno lo mira
        // `ChatSettingsPage` para avisar si el navegador no deja escribir.
        const persistido = saveAgentIdentityOverride(id, { name: newName });
        set((state) => ({
            coreAgents: state.coreAgents.map(agent =>
                agent.id === id ? { ...agent, name: newName } : agent
            ),
            customAgents: state.customAgents.map(agent =>
                agent.id === id ? { ...agent, name: newName } : agent
            ),
        }));
        return persistido;
    },

    updateAgentColor: (id, newHexColor) => {
        const persistido = saveAgentIdentityOverride(id, { hexColor: newHexColor });
        set((state) => ({
            coreAgents: state.coreAgents.map(agent =>
                agent.id === id ? { ...agent, hexColor: newHexColor } : agent
            ),
            customAgents: state.customAgents.map(agent =>
                agent.id === id ? { ...agent, hexColor: newHexColor } : agent
            ),
        }));
        return persistido;
    },
});
