/**
 * El estado del asistente, en un solo sitio (D41).
 *
 * El punto de partida eran DIECIOCHO `useState` en el cuerpo del componente y
 * un borrado a mano de catorce setters seguidos. El problema no era el número:
 * era que el borrado y los campos vivían separados, así que cada campo nuevo
 * había que acordarse de añadirlo a la lista, y el que se olvidaba no daba la
 * cara hasta que alguien cerraba y reabría el asistente.
 *
 * Con un reducer, `reset` DEVUELVE `initialWizardState`: un campo nuevo se
 * borra por el mero hecho de existir, sin tocar nada más. La única excepción es
 * explícita y está abajo, comentada.
 *
 * El reducer es puro a propósito: los identificadores de fichero se fabrican
 * fuera (`newFileEntry`) y llegan ya hechos en la acción. Un contador dentro de
 * un reducer avanza dos veces por render en modo estricto.
 */
import { PRESET_COLORS } from './constants';
import type { AgentTemplate, FileEntry, WizardForm, WizardStep } from './types';

export interface WizardState {
    step: WizardStep;
    /** Hacia dónde desliza la transición: 1 adelante, -1 atrás. */
    direction: number;
    method: 'template' | 'scratch' | null;
    selectedTemplate: AgentTemplate | null;
    categoryFilter: string | null;
    form: WizardForm;
    files: FileEntry[];
    isDragOver: boolean;
    isSubmitting: boolean;
    submitError: string | null;
}

export type WizardAction =
    | { type: 'goTo'; step: WizardStep }
    | { type: 'selectTemplate'; template: AgentTemplate }
    | { type: 'startFromScratch' }
    | { type: 'filterCategory'; category: string | null }
    | { type: 'patchForm'; patch: Partial<WizardForm> }
    | { type: 'addFiles'; entries: FileEntry[] }
    | { type: 'removeFile'; id: string }
    | { type: 'patchFile'; id: string; patch: Partial<FileEntry> }
    | { type: 'setDragOver'; over: boolean }
    | { type: 'submitStart' }
    | { type: 'submitFailed'; message: string }
    | { type: 'submitSettled' }
    | { type: 'reset' };

export const initialWizardState: WizardState = {
    step: 0,
    direction: 1,
    method: null,
    selectedTemplate: null,
    categoryFilter: null,
    form: {
        name: '',
        description: '',
        systemPrompt: '',
        color: PRESET_COLORS[0],
        temperature: 0.7,
        model: 'deepseek-v4-pro',
    },
    files: [],
    isDragOver: false,
    isSubmitting: false,
    submitError: null,
};

/**
 * El modelo que deja «crear desde cero», que NO es ninguna de las dos opciones
 * de `MODEL_OPTIONS` (D41-B2). Está mal —ninguna de las dos casillas queda
 * marcada y la revisión enseña este identificador crudo— pero se conserva tal
 * cual: arreglarlo dentro de un troceo estructural haría imposible saber qué
 * rompió qué. Hay un test que lo fija.
 */
const SCRATCH_MODEL = 'deepseek-chat';

let fileIdCounter = 0;

/** Un adjunto recién elegido, en espera de que se cree el agente. */
export const newFileEntry = (file: File): FileEntry => ({
    id: `file_${++fileIdCounter}_${Date.now()}`,
    file,
    status: 'pending',
    progress: 0,
});

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
    switch (action.type) {
        case 'goTo':
            return {
                ...state,
                direction: action.step > state.step ? 1 : -1,
                step: action.step,
            };

        // Elegir plantilla rellena el formulario y salta al paso siguiente de
        // un golpe. El color NO se toca: la plantilla no trae ninguno.
        case 'selectTemplate':
            return {
                ...state,
                selectedTemplate: action.template,
                method: 'template',
                form: {
                    ...state.form,
                    name: action.template.name,
                    description: action.template.description,
                    systemPrompt: action.template.system_prompt,
                    temperature: action.template.default_temperature,
                    model: action.template.default_model,
                },
                direction: 1,
                step: 1,
            };

        case 'startFromScratch':
            return {
                ...state,
                method: 'scratch',
                selectedTemplate: null,
                form: {
                    ...state.form,
                    name: '',
                    description: '',
                    systemPrompt: '',
                    temperature: 0.7,
                    model: SCRATCH_MODEL,
                },
                direction: 1,
                step: 1,
            };

        case 'filterCategory':
            return { ...state, categoryFilter: action.category };

        case 'patchForm':
            return { ...state, form: { ...state.form, ...action.patch } };

        case 'addFiles':
            return { ...state, files: [...state.files, ...action.entries] };

        case 'removeFile':
            return { ...state, files: state.files.filter((f) => f.id !== action.id) };

        case 'patchFile':
            return {
                ...state,
                files: state.files.map((f) =>
                    f.id === action.id ? { ...f, ...action.patch } : f,
                ),
            };

        case 'setDragOver':
            return { ...state, isDragOver: action.over };

        case 'submitStart':
            return { ...state, isSubmitting: true, submitError: null };

        case 'submitFailed':
            return { ...state, submitError: action.message };

        case 'submitSettled':
            return { ...state, isSubmitting: false };

        // `isDragOver` sobrevive al borrado (D41-B1), igual que antes del
        // troceo: el borrado de quince setters tampoco lo tocaba. Es un bug
        // —reabrir el asistente puede enseñar la zona de subida en «suelta
        // aquí» sin que nadie arrastre nada— y tiene su test, pero se arregla
        // aparte. Que sea una excepción ESCRITA es la diferencia: cualquier
        // campo nuevo se borra solo.
        case 'reset':
            return { ...initialWizardState, isDragOver: state.isDragOver };

        default:
            return state;
    }
}

/** Si el paso actual deja pasar al siguiente. Los ficheros son opcionales. */
export function canProceed(state: WizardState): boolean {
    switch (state.step) {
        case 0: return state.method !== null;
        case 1: return state.form.name.trim().length > 0
            && state.form.systemPrompt.trim().length > 0;
        case 2: return true;
        case 3: return !state.isSubmitting;
        default: return false;
    }
}
