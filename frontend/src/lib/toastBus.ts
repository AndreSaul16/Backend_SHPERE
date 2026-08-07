/**
 * Bus de avisos. Es la mitad no-React de `<Toast>` (DESIGN §9.5).
 *
 * Existe porque los fallos que la tarea 1.13 vino a cablear NO están todos
 * dentro de componentes: nueve vivían en `useChatStore`, uno en `api.ts` y otro
 * en `errorHandler.ts`, que además ya lo admite por escrito («Si no hay sistema
 * de toast aún, se queda como console.warn»). Un contexto de React no llega
 * ahí. Un bus de módulo, sí, y encima se puede probar sin montar nada.
 *
 * El `<ToastProvider>` se suscribe y pinta. Si nadie se ha suscrito todavía los
 * avisos se guardan en cola (hasta 10) y se entregan al primer suscriptor: un
 * error durante el arranque no se pierde en silencio, que es justo lo que hacía
 * el registro por consola al que esto sustituye.
 */
export type ToastVariant = 'success' | 'info' | 'warning' | 'error';

export interface ToastAction {
    label: string;
    onClick: () => void;
}

export interface ToastInput {
    /** Qué pasó. §11: «El error dice qué pasó, qué hacer y qué se conservó». */
    title: string;
    /** El detalle: qué hacer, o qué se ha conservado. */
    detail?: string;
    variant?: ToastVariant;
    action?: ToastAction;
    /**
     * Agrupa avisos que se repiten (un stream que falla en bucle). Si llega uno
     * con la misma clave que otro visible, sustituye al anterior en vez de
     * apilarse.
     */
    dedupeKey?: string;
}

export interface ToastRecord extends ToastInput {
    id: string;
    variant: ToastVariant;
}

/** §9.5: success 4s · info 6s · warning 8s · error NO se cierra solo. */
export const TOAST_DURATION: Record<ToastVariant, number | null> = {
    success: 4000,
    info: 6000,
    warning: 8000,
    error: null,
};

/** §9.5: «Pila máxima de 3; el resto se agrupa en "+N más".» */
export const TOAST_STACK_MAX = 3;

type Listener = (toast: ToastRecord) => void;

const listeners = new Set<Listener>();
const pending: ToastRecord[] = [];
let seq = 0;

function makeId(): string {
    seq += 1;
    return `toast-${seq}`;
}

export function subscribeToasts(listener: Listener): () => void {
    listeners.add(listener);
    // Cola de arranque: lo que se emitió antes de que hubiera provider.
    if (pending.length) {
        const queued = pending.splice(0, pending.length);
        for (const toast of queued) listener(toast);
    }
    return () => listeners.delete(listener);
}

/** Emite un aviso. Devuelve su id por si el emisor quiere cerrarlo. */
export function notify(input: ToastInput): string {
    const toast: ToastRecord = {
        ...input,
        variant: input.variant ?? 'info',
        id: makeId(),
    };
    if (listeners.size === 0) {
        pending.push(toast);
        if (pending.length > 10) pending.shift();
        return toast.id;
    }
    for (const listener of listeners) listener(toast);
    return toast.id;
}

export const toast = {
    success: (title: string, detail?: string) => notify({ title, detail, variant: 'success' }),
    info: (title: string, detail?: string) => notify({ title, detail, variant: 'info' }),
    warning: (title: string, detail?: string) => notify({ title, detail, variant: 'warning' }),
    /**
     * §9.5: un `error` no se cierra solo y «siempre lleva acción o motivo». El
     * `detail` es el motivo, así que la firma lo pide de forma explícita.
     */
    error: (title: string, detail?: string, action?: ToastAction) =>
        notify({ title, detail, action, variant: 'error' }),
};

/**
 * Convierte cualquier `unknown` de un `catch` en un motivo legible. §11
 * prohíbe el `String(e)` crudo que hoy hay en 19 sitios («Error: Error cargando
 * credenciales»), pero el motivo técnico sí puede ir en el detalle.
 */
export function reasonOf(err: unknown): string | undefined {
    if (err instanceof Error) return err.message || undefined;
    if (typeof err === 'string') return err || undefined;
    return undefined;
}

/** Sólo para tests: vacía la cola de arranque entre casos. */
export function __resetToastBus(): void {
    pending.length = 0;
    listeners.clear();
    seq = 0;
}
