// Artifact Types for SPHERE Workspace

export type ArtifactType = 'code' | 'markdown' | 'mermaid' | 'data_table' | 'svg';

/** Veredicto sobre el tipo declarado: `unknown` = no está en la lista blanca. */
export type TypeStatus = 'ok' | 'unknown';

/** Por qué se cortó un artefacto. */
export type TruncatedReason = 'size_limit' | 'stream_ended';

/** Veredicto sobre el contenido. `unchecked` = no se juzga, y es a propósito. */
export type ContentStatus = 'ok' | 'mismatch' | 'unchecked';

export interface Artifact {
    id: string;
    type: ArtifactType;
    title: string;
    content: string;
    language?: string; // For code artifacts (python, javascript, etc.)
    agentId?: string;
    createdAt: Date;

    // --- Veredicto del generador (todos OPCIONALES) ---
    //
    // Opcionales por dos razones, y las dos importan: un artefacto recuperado
    // del historial no los tiene, y los `makeArtifact` de los tests existentes
    // seguirían compilando. La contrapartida es que `tsc` NO señala a un
    // consumidor que se olvide de reenviarlos: la red de verdad son los tests
    // que recorren evento → almacén → panel.

    /** El literal que escribió el modelo cuando el tipo no se reconoce. */
    declaredType?: string;
    typeStatus?: TypeStatus;
    /** El documento se cortó: lo que hay está completo hasta ahí, y ya está. */
    truncated?: boolean;
    truncatedReason?: TruncatedReason;
    contentStatus?: ContentStatus;
}

// Language extensions for download
export const LANGUAGE_EXTENSIONS: Record<string, string> = {
    python: '.py',
    javascript: '.js',
    typescript: '.ts',
    jsx: '.jsx',
    tsx: '.tsx',
    html: '.html',
    css: '.css',
    json: '.json',
    yaml: '.yaml',
    sql: '.sql',
    bash: '.sh',
    shell: '.sh',
    markdown: '.md',
    mermaid: '.mmd',
};

export const getDownloadExtension = (artifact: Artifact): string => {
    if (artifact.type === 'data_table') return '.csv';
    if (artifact.type === 'markdown') return '.md';
    if (artifact.type === 'mermaid') return '.mmd';
    if (artifact.type === 'svg') return '.svg';
    if (artifact.type === 'code' && artifact.language) {
        return LANGUAGE_EXTENSIONS[artifact.language] || '.txt';
    }
    return '.txt';
};
