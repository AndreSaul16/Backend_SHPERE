/**
 * Traducir el historial que persiste el backend al modelo del hilo.
 *
 * Es la mitad mecánica de `loadSession`: mapear tipos, resolver quién habló,
 * rescatar los artefactos incrustados como XML y recuperar el rastro del debate
 * (voto, fase, conclusión). No toca el store; devuelve lo que hay que guardar.
 */
import { v4 as uuidv4 } from 'uuid';
import type { Agent, Message, Role, BoardVote, BoardPhase } from '../../types';
import type { Artifact } from '../../types/artifact';
import { BOARD_DEVIL_AGENT } from './agentCatalog';

/** Los extras que el backend cuelga de cada turno persistido. */
export interface AdditionalKwargs {
    agent_id?: string;
    agent_role?: string;
    timestamp?: string | number;
    board_vote?: { decision?: BoardVote['decision']; confidence?: number } | null;
    board_phase?: BoardPhase;
    is_conclusion?: boolean;
}

/** Un turno tal y como viene del historial (`human` | `ai`). */
export interface TurnoPersistido {
    type?: string;
    content: string;
    additional_kwargs?: AdditionalKwargs;
}

/** Tipos de artefacto que entiende el panel; lo demás cae a `code`. */
const TIPOS_DE_ARTEFACTO: Record<string, 'code' | 'markdown' | 'mermaid' | 'data_table'> = {
    'code': 'code', 'markdown': 'markdown', 'mermaid': 'mermaid', 'csv': 'data_table',
};

// Validar que el role es un valor válido de Role (nunca 'assistant')
const VALID_ROLES = ['user', 'system', 'CTO', 'CMO', 'CFO', 'CEO', 'specialist', 'DEVIL'];

export interface HistorialMapeado {
    messages: Message[];
    artifacts: Artifact[];
}

/** Quién firma un turno de IA, resolviendo primero por id y luego por rol. */
function resolverAutor(kwargs: AdditionalKwargs | undefined, allAgents: Agent[]): { role: Role; agentId?: string } {
    const agentId = kwargs?.agent_id;
    const agentRole = kwargs?.agent_role;

    // Intentar resolver por agent_id primero, luego por agent_role
    let foundAgent = agentId ? allAgents.find(a => a.id === agentId) : null;
    if (!foundAgent && agentRole) {
        foundAgent = allAgents.find(a => a.role === agentRole && a.id !== 'group-chat');
    }

    const candidateRole = foundAgent?.role || agentRole;
    const role = (candidateRole && VALID_ROLES.includes(candidateRole) ? candidateRole : 'CEO') as Role;
    let resolvedAgentId = foundAgent?.id;
    // Board V2: rol DEVIL no está en allAgents; resolver su identidad visual.
    if (!resolvedAgentId && agentRole === 'DEVIL') resolvedAgentId = BOARD_DEVIL_AGENT.id;

    return { role, agentId: resolvedAgentId };
}

/**
 * Rescata los artefactos que el backend guardó como XML dentro del contenido y
 * los sustituye por el marcador interno que entiende `MessageBubble`.
 */
function extraerArtefactos(contenido: string, kwargs: AdditionalKwargs | undefined, destino: Artifact[]): string {
    let processedContent = contenido;
    const artifactRegex = /<sphere_artifact\s+([^>]+)>([\s\S]*?)<\/sphere_artifact>/g;

    let match;
    while ((match = artifactRegex.exec(contenido)) !== null) {
        const [fullTag, attrsStr, content] = match;

        const titleMatch = /title=\\?"([^\\"]+)\\?"/.exec(attrsStr);
        const typeMatch = /artifact_type=\\?"([^\\"]+)\\?"/.exec(attrsStr);
        const langMatch = /language=\\?"([^\\"]*)\\?"/.exec(attrsStr);

        const title = titleMatch ? titleMatch[1] : "untitled";
        const rawType = typeMatch ? typeMatch[1] : "code";
        const language = langMatch ? langMatch[1] : "";

        const artifactId = uuidv4();
        destino.push({
            id: artifactId,
            title,
            type: TIPOS_DE_ARTEFACTO[rawType] || 'code',
            language: language || undefined,
            content: content.trim(),
            agentId: kwargs?.agent_id || 'system',
            createdAt: new Date(kwargs?.timestamp || Date.now()),
        });
        // Reemplazamos el XML por nuestro formato interno que MessageBubble entiende
        processedContent = processedContent.replace(fullTag, `\n\n[ARTIFACT:${artifactId}:${title}]\n\n`);
    }

    return processedContent;
}

/** Board V2: recuperar el voto persistido en `additional_kwargs`. */
function leerVoto(kwargs: AdditionalKwargs | undefined): BoardVote | undefined {
    const rawVote = kwargs?.board_vote;
    return (rawVote && typeof rawVote === 'object' && rawVote.decision)
        ? { decision: rawVote.decision, confidence: typeof rawVote.confidence === 'number' ? rawVote.confidence : 50 }
        : undefined;
}

export function mapSessionHistory(
    rawMessages: TurnoPersistido[],
    sessionId: string,
    allAgents: Agent[],
): HistorialMapeado {
    const artifacts: Artifact[] = [];

    const messages: Message[] = rawMessages.map((m, idx) => {
        let role: Role = 'system';
        let resolvedAgentId: string | undefined;
        if (m.type === 'human') role = 'user';
        else if (m.type === 'ai') {
            const autor = resolverAutor(m.additional_kwargs, allAgents);
            role = autor.role;
            resolvedAgentId = autor.agentId;
        }

        const processedContent = extraerArtefactos(m.content, m.additional_kwargs, artifacts);

        return {
            id: `history-${sessionId}-${idx}`,
            role,
            content: processedContent,
            timestamp: new Date(m.additional_kwargs?.timestamp || Date.now()),
            agentId: resolvedAgentId || m.additional_kwargs?.agent_id || undefined,
            vote: leerVoto(m.additional_kwargs),
            phase: m.additional_kwargs?.board_phase || undefined,
            isConclusion: !!m.additional_kwargs?.is_conclusion,
        };
    });

    return { messages, artifacts };
}
