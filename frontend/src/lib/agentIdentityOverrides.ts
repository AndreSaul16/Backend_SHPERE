/**
 * D28 (segunda mitad) — las ediciones de miembros de la junta sobreviven a la
 * recarga.
 *
 * `ChatSettingsPage.saveMemberEdit` llamaba a `renameAgent` y
 * `updateAgentColor`, que sólo tocan el array en memoria de `useChatStore`.
 * Sin `persist` y sin API: renombrar a un director y darle un color se perdía
 * al recargar, y el modal decía «Guardar cambios» igual.
 *
 * POR QUÉ AQUÍ Y NO POR API, que es lo que pedía el inventario: **no existe el
 * endpoint**. Se comprobó contra el backend de este mismo repo:
 *
 *   - `PUT /me/agent-overrides/{role}` sólo acepta `system_prompt_addition`,
 *     `temperature_override` y `model_override` (`auth.py`). Ni nombre ni color.
 *   - `visual_config` de la sesión es un modelo Pydantic con campos fijos
 *     (`name`, `avatar`, `color`, `theme`, `bubble_color`, `secondary_color`),
 *     así que una clave nueva se descartaría en silencio.
 *   - `PATCH /agents/{id}` sólo existe para agentes propios, y los cuatro
 *     directores del grupo son `MOCK_AGENTS` del cliente.
 *
 * Persistirlo de verdad exige tocar el backend, que está fuera de esta tanda.
 * Mientras tanto esto es lo que es y no finge otra cosa: una preferencia
 * visual por navegador, exactamente como el avatar de usuario
 * (`useUserAvatar`) y el repo de GitHub de `ActaActions`, que ya viven en
 * `localStorage`. Se borra al cambiar de cuenta desde `clearStores` (A6).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LIMITACIÓN DECLARADA (tarea 6.6 · D28) — re-verificada en la fase 6 contra
 * `Backend_SHPERE/backend/app/presentation/api/v1/auth.py`. Sigue sin existir
 * el endpoint. La edición **sobrevive a la recarga** (que es el criterio) pero
 * **no viaja entre navegadores ni dispositivos**: quien renombre a su CTO en el
 * portátil lo verá con el nombre de fábrica en el móvil.
 *
 * El endpoint que haría falta, si alguien lo implementa después:
 *
 *   PUT  /me/agent-identity/{agent_id}
 *   body { "name": string | null, "hex_color": string | null }   // null = quitar
 *   200  { "agent_id": string, "name": string | null, "hex_color": string | null }
 *
 *   GET  /me/agent-identity
 *   200  [ { "agent_id": …, "name": …, "hex_color": … } ]
 *
 * `agent_id` es el id del cliente (`ceo`, `cto`, … de `MOCK_AGENTS`, o el
 * `_id` de un agente propio), así que la colección puede ser la misma que la de
 * `user_agent_overrides` con dos campos más — es literalmente el mismo
 * documento por `(user_id, agent_role)`. Ampliar `AgentOverrideRequest` con
 * `display_name` y `hex_color` y aceptar ambos en `upsert_agent_override`
 * bastaría; no hace falta ruta nueva. Cuando exista, este módulo se convierte
 * en la caché optimista de esa llamada y `withAgentIdentityOverrides` no
 * cambia: sólo cambia de dónde sale `read()`.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { Agent } from '../types';

const STORAGE_KEY = 'sphere_agent_identity_overrides';

export interface AgentIdentityOverride {
    name?: string;
    hexColor?: string;
}

type OverridesMap = Record<string, AgentIdentityOverride>;

function read(): OverridesMap {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed: unknown = JSON.parse(raw);
        // Puede venir de una versión anterior o de un manoseo del storage: si
        // no tiene la forma esperada, se ignora en vez de reventar el arranque.
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        return parsed as OverridesMap;
    } catch {
        return {};
    }
}

/** Guarda el retoque de un agente. `false` si el navegador no deja escribir. */
export function saveAgentIdentityOverride(
    agentId: string,
    patch: AgentIdentityOverride,
): boolean {
    try {
        const all = read();
        all[agentId] = { ...all[agentId], ...patch };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
        return true;
    } catch {
        // Modo privado, cuota llena, storage bloqueado. Quien llama avisa: un
        // guardado que no se guarda no puede pasar en silencio.
        return false;
    }
}

/** Aplica los retoques guardados sobre una lista de agentes. */
export function withAgentIdentityOverrides(agents: Agent[]): Agent[] {
    const all = read();
    if (Object.keys(all).length === 0) return agents;
    return agents.map((agent) => {
        const override = all[agent.id];
        if (!override) return agent;
        return {
            ...agent,
            ...(override.name ? { name: override.name } : {}),
            ...(override.hexColor ? { hexColor: override.hexColor } : {}),
        };
    });
}

/** Cambio de cuenta (A6): los retoques del anterior no son del siguiente. */
export function clearAgentIdentityOverrides(): void {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        /* no romper el logout por esto */
    }
}
