/**
 * Contrato de capas de aviso (tarea 1.13): **un error, un aviso**.
 *
 * Varios fallos atraviesan dos capas: el store hace la llamada y relanza, y el
 * componente que la disparó decide qué contar. La regla es que avisa el
 * componente, porque es el único que sabe QUÉ intentaba hacer el usuario —
 * «No se pudo eliminar la junta «Precios 2026»» no se puede escribir desde un
 * store que sólo ve un `sessionId`.
 *
 * El primer intento de esta tarea se saltó justo esto: cableó un aviso en el
 * store sin retirar el que el componente ya emitía, y el mismo error salía dos
 * veces. Estos tests fijan la mitad de store del contrato (emite 0 y relanza);
 * la otra mitad —que el componente sí emite exactamente 1— vive en
 * `Sidebar.a11y.test.tsx` y `ChatSettingsPage.test.tsx`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useChatStore } from '../../src/store/useChatStore';
import { chatService } from '../../src/services/api';
import { __resetToastBus, subscribeToasts, type ToastRecord } from '../../src/lib/toastBus';

describe('useChatStore — quién avisa de qué', () => {
    let seen: ToastRecord[];
    let unsubscribe: () => void;

    beforeEach(() => {
        __resetToastBus();
        seen = [];
        unsubscribe = subscribeToasts((t) => seen.push(t));
    });

    afterEach(() => {
        unsubscribe();
        vi.restoreAllMocks();
    });

    it('deleteSession no avisa por su cuenta: relanza para que avise la sidebar', async () => {
        vi.spyOn(chatService, 'deleteSession').mockRejectedValue(new Error('502 upstream'));

        await expect(useChatStore.getState().deleteSession('s1')).rejects.toThrow('502 upstream');

        // Cero, no uno: el aviso lo pone `Sidebar.handleDelete`, que tiene el
        // título de la junta. Si esto fuese 1, el usuario vería dos avisos.
        expect(seen).toHaveLength(0);
    });

    it('updateSessionMetadata no avisa por su cuenta: relanza para que avise la página', async () => {
        vi.spyOn(chatService, 'updateSession').mockRejectedValue(new Error('502 upstream'));

        await expect(
            useChatStore.getState().updateSessionMetadata('s1', { title: 'Precios 2026' }),
        ).rejects.toThrow('502 upstream');

        // La misma acción sirve a nombre, color y avatar: sólo
        // `ChatSettingsPage` sabe cuál de los tres no se ha guardado.
        expect(seen).toHaveLength(0);
    });

    it('deleteCustomAgent relanza en vez de tragarse el fallo', async () => {
        vi.spyOn(chatService, 'deleteCustomAgent').mockRejectedValue(new Error('403 forbidden'));
        useChatStore.setState({
            customAgents: [{ id: 'a1', name: 'Analista' }] as never,
        });

        await expect(useChatStore.getState().deleteCustomAgent('a1')).rejects.toThrow('403 forbidden');

        // Antes se lo tragaba: el diálogo se cerraba, el agente seguía en la
        // lista y borrar era indistinguible de no borrar.
        expect(useChatStore.getState().customAgents).toHaveLength(1);
        expect(seen).toHaveLength(0);
    });

    it('fetchSessions tampoco avisa: su fallo ya lo pinta ErrorOverlay', async () => {
        vi.spyOn(chatService, 'getSessions').mockRejectedValue(new Error('offline'));

        await useChatStore.getState().fetchSessions();

        expect(seen).toHaveLength(0);
        expect(useChatStore.getState().errorStates.fetch_agents).toBe(
            'No se pudo cargar tu historial de juntas',
        );
    });
});
