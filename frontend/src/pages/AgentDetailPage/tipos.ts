/**
 * La forma con la que el backend contesta a `GET /agents/{id}`.
 *
 * Estaba dentro de las 710 líneas de la página (D-7.3). Vive aparte porque la
 * usan el hook y las tres secciones, y porque tiparla de verdad es lo que
 * permitió quitar los tres `any` de la página (D43).
 */

export interface AgentIdentityAPI {
    name: string;
    role: string;
    color: string;
    description?: string;
    avatar_style?: string;
}

export interface BrainConfigAPI {
    model: string;
    temperature: number;
    system_prompt: string;
}

export interface AgentDetailAPI {
    agent_id: string;
    identity: AgentIdentityAPI;
    brain_config: BrainConfigAPI;
    owner_user_id?: string;
    is_public?: boolean;
    created_at?: string;
}

/** Lo que el formulario edita: exactamente lo que se compara para «sucio». */
export interface BorradorDeAgente {
    name: string;
    description: string;
    color: string;
    systemPrompt: string;
    temperature: number;
    model: string;
}
