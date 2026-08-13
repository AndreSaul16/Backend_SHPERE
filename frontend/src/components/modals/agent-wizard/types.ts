/**
 * Los tipos del asistente de creación de agentes (D41).
 *
 * Viven aquí y no en cada pieza porque los cruzan todas: el catálogo los
 * produce, el formulario los consume y la revisión los resume. El fichero no
 * importa nada del asistente, así que la dirección de dependencias es siempre
 * la misma —piezas → tipos— y no hay ciclos que desenredar.
 */

/** Una plantilla del catálogo, tal y como la sirve el backend. */
export interface AgentTemplate {
    template_id: string;
    name: string;
    category: string;
    description: string;
    icon: string;
    system_prompt: string;
    suggested_files: string[];
    default_temperature: number;
    default_model: string;
    tags: string[];
}

/** Los cuatro pasos, por índice. */
export type WizardStep = 0 | 1 | 2 | 3;

/** Un adjunto de la base de conocimiento y en qué punto de la subida está. */
export interface FileEntry {
    id: string;
    file: File;
    status: 'pending' | 'uploading' | 'success' | 'error';
    progress: number;
    errorMessage?: string;
}

/**
 * Lo que el usuario escribe. Es un objeto y no seis campos sueltos porque es
 * exactamente lo que el borrado tiene que devolver a cero y lo que el paso
 * «Configurar» recibe entero.
 */
export interface WizardForm {
    name: string;
    description: string;
    systemPrompt: string;
    color: string;
    temperature: number;
    model: string;
}
