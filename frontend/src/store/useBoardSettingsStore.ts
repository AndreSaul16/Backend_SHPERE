/**
 * D47 — el ajuste de debate de la junta, en un solo sitio.
 *
 * El mismo ajuste (`board_meeting_enabled` de `/me/board-settings`) estaba
 * implementado tres veces, cada una con su propio estado y su propio `fetch`:
 *
 *   - `ChatSettingsPage`  → `useState(boardEnabled)` + fetch/PATCH a mano.
 *   - `BoardMeetingSettings` → `useState(settings)` + fetch/PATCH a mano.
 *   - `AgentSelectorModal` → lectura y escritura por `chatService`, sin estado.
 *
 * Nada las sincronizaba. Con las dos pantallas montadas en la misma sesión
 * —abrir Configuración del chat, cambiar el interruptor, volver y entrar en
 * Ajustes— cada una seguía enseñando lo que leyó al montarse: dos interruptores
 * del MISMO ajuste en posiciones contrarias, y el usuario sin forma de saber
 * cuál manda. Peor: activarlo desde el modal de creación de junta no aparecía
 * en ninguna de las dos.
 *
 * Un store lo arregla por construcción: el valor vive una sola vez y las tres
 * vistas se suscriben. Las llamadas van por `chatService`, que ya tenía
 * `getBoardSettings`/`updateBoardSettings` mientras las dos pantallas
 * duplicaban el `fetch` y su `Authorization` a mano.
 */
import { create } from 'zustand';
import { chatService } from '@/services/api';

interface BoardSettingsState {
    /** ¿Los directores debaten entre sí antes de responder? */
    enabled: boolean;
    /** ¿Se sienta el Abogado del Diablo? */
    devil: boolean;
    iterations: number;

    /** Ya se sabe el valor real del servidor (no el de arranque). */
    loaded: boolean;
    loading: boolean;
    saving: boolean;
    /**
     * §11 partido en dos: el título dice QUÉ pasó y el detalle QUÉ se conserva.
     * Iba en una sola cadena y la pantalla la pintaba entera como si fuera un
     * título; separarlo es lo que permite que la sección ofrezca además la
     * salida (`<InlineError onRetry>`), que es lo que faltaba.
     */
    error: { title: string; detail: string } | null;

    load: () => Promise<void>;
    /** Devuelve `true` si el cambio quedó guardado. */
    setEnabled: (enabled: boolean, devil?: boolean) => Promise<boolean>;
    clearError: () => void;
    reset: () => void;
}

const INICIAL = {
    enabled: false,
    devil: false,
    iterations: 1,
    loaded: false,
    loading: false,
    saving: false,
    error: null,
} as const;

export const useBoardSettingsStore = create<BoardSettingsState>()((set) => ({
    ...INICIAL,

    load: async () => {
        set({ loading: true, error: null });
        try {
            const data = await chatService.getBoardSettings();
            set({
                enabled: data.board_meeting_enabled,
                devil: data.board_devils_advocate ?? false,
                iterations: data.board_iterations ?? 1,
                loaded: true,
                loading: false,
                error: null,
            });
        } catch {
            set({
                loading: false,
                error: {
                    title: 'No se ha podido consultar si la junta debate',
                    detail: 'Tu preferencia sigue guardada tal cual: es un fallo al consultarla.',
                },
            });
        }
    },

    setEnabled: async (enabled, devil) => {
        set({ saving: true, error: null });
        try {
            const data = await chatService.updateBoardSettings({
                board_meeting_enabled: enabled,
                ...(devil === undefined ? {} : { board_devils_advocate: devil }),
            });
            // La respuesta del PATCH manda sobre lo que pedimos: si el servidor
            // decidiera otra cosa, el interruptor tiene que reflejarlo.
            set({
                enabled: data?.board_meeting_enabled ?? enabled,
                devil: data?.board_devils_advocate ?? devil ?? false,
                iterations: data?.board_iterations ?? 1,
                loaded: true,
                saving: false,
                error: null,
            });
            return true;
        } catch {
            // El ajuste se queda como estaba: no se toca `enabled`, así que el
            // interruptor no se mueve y no miente sobre lo que hay guardado.
            set({
                saving: false,
                error: {
                    title: 'No se ha podido guardar el cambio',
                    detail: 'El debate sigue como estaba y el interruptor no se ha movido. Vuelve a intentarlo.',
                },
            });
            return false;
        }
    },

    clearError: () => set({ error: null }),

    reset: () => set({ ...INICIAL }),
}));
