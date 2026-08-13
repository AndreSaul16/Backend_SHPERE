/**
 * Regresión D28 (segunda mitad) — editar un miembro de la junta se perdía al
 * recargar.
 *
 * `saveMemberEdit` llamaba a `renameAgent` y `updateAgentColor`, que sólo
 * tocaban el array en memoria de `useChatStore`: sin `persist` y sin API. El
 * usuario renombraba a un director, le daba un color, el modal decía «Guardar
 * cambios», y a la siguiente carga estaba todo como de fábrica.
 *
 * NO se persiste por API porque el backend de este repo no tiene dónde: ver la
 * cabecera de `src/lib/agentIdentityOverrides.ts`, donde está la comprobación
 * endpoint por endpoint. Es una preferencia visual por navegador, como el
 * avatar de usuario, y se borra al cambiar de cuenta.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useChatStore } from '../../src/store/useChatStore';
import {
    withAgentIdentityOverrides,
    saveAgentIdentityOverride,
    clearAgentIdentityOverrides,
} from '../../src/lib/agentIdentityOverrides';
import { clearUserStores } from '../../src/lib/clearStores';
import type { Agent } from '../../src/types';

const CTO: Agent = {
    id: 'cto-1',
    name: 'Nexus (CTO)',
    role: 'CTO',
    avatar: 'N',
    description: 'Arquitectura.',
    color: 'text-agent-cto',
    hexColor: '#00C1B3',
    isOnline: true,
};

describe('D28 — los retoques de identidad de los directores persisten', () => {
    beforeEach(() => {
        localStorage.clear();
        clearAgentIdentityOverrides();
    });

    afterEach(() => {
        localStorage.clear();
    });

    it('sin retoques, la lista de agentes sale intacta (misma referencia)', () => {
        const agentes = [CTO];
        expect(withAgentIdentityOverrides(agentes)).toBe(agentes);
    });

    it('un nombre y un color guardados se aplican al rehidratar', () => {
        saveAgentIdentityOverride('cto-1', { name: 'Hernesto', hexColor: '#E34A95' });

        const [agente] = withAgentIdentityOverrides([CTO]);

        expect(agente.name).toBe('Hernesto');
        expect(agente.hexColor).toBe('#E34A95');
        // Lo que no se retoca no se toca.
        expect(agente.role).toBe('CTO');
        expect(agente.avatar).toBe('N');
    });

    it('los retoques son por agente: no se contagian', () => {
        saveAgentIdentityOverride('cto-1', { name: 'Hernesto' });

        const [otro] = withAgentIdentityOverrides([{ ...CTO, id: 'cfo-1', name: 'Ledger (CFO)' }]);

        expect(otro.name).toBe('Ledger (CFO)');
    });

    it('`renameAgent` deja el nombre guardado, no sólo en memoria', () => {
        useChatStore.getState().renameAgent('cto-1', 'Hernesto');

        // Éste es el bug: con la versión anterior, el store cambiaba y el
        // almacén se quedaba vacío, así que la siguiente carga volvía atrás.
        expect(withAgentIdentityOverrides([CTO])[0].name).toBe('Hernesto');
    });

    it('`updateAgentColor` deja el color guardado', () => {
        useChatStore.getState().updateAgentColor('cto-1', '#E34A95');

        expect(withAgentIdentityOverrides([CTO])[0].hexColor).toBe('#E34A95');
    });

    it('sobrevive a una recarga: un store nuevo arranca con el retoque puesto', async () => {
        useChatStore.getState().renameAgent('cto-1', 'Hernesto');

        // Simula la recarga: se vuelve a evaluar el módulo del store, que
        // hidrata `coreAgents` desde el almacén.
        vi.resetModules();
        const { useChatStore: storeRecargado } = await import('../../src/store/useChatStore');

        const cto = storeRecargado.getState().coreAgents.find((a) => a.id === 'cto-1');
        expect(cto?.name).toBe('Hernesto');
    });

    it('un almacén corrupto no revienta el arranque', () => {
        localStorage.setItem('sphere_agent_identity_overrides', '{no es json');

        expect(() => withAgentIdentityOverrides([CTO])).not.toThrow();
        expect(withAgentIdentityOverrides([CTO])[0].name).toBe('Nexus (CTO)');
    });

    it('si el navegador no deja escribir, `renameAgent` lo dice', () => {
        const setItem = vi
            .spyOn(Storage.prototype, 'setItem')
            .mockImplementation(() => {
                throw new DOMException('QuotaExceededError');
            });

        // El cambio se ve en memoria, pero el valor de retorno avisa de que no
        // sobrevivirá: `ChatSettingsPage` lo convierte en un aviso (§11).
        expect(useChatStore.getState().renameAgent('cto-1', 'Hernesto')).toBe(false);

        setItem.mockRestore();
    });

    it('cambiar de cuenta borra los retoques del usuario anterior (A6)', () => {
        saveAgentIdentityOverride('cto-1', { name: 'Hernesto' });

        clearUserStores();

        expect(withAgentIdentityOverrides([CTO])[0].name).toBe('Nexus (CTO)');
    });
});

/**
 * A6 — la otra mitad del borrado al cambiar de cuenta.
 *
 * `resetState` conservaba `coreAgents` con el comentario «son globales
 * (CEO/CTO/...)». Era cierto mientras nadie podía tocarlos; en cuanto D28 hace
 * que cada usuario los renombre y los coloree, dejarlos puestos le enseña al
 * siguiente los directores del anterior.
 */
describe('D28/A6 — al cerrar sesión los directores vuelven a los de fábrica', () => {
    beforeEach(() => {
        localStorage.clear();
        clearAgentIdentityOverrides();
    });

    afterEach(() => {
        localStorage.clear();
        useChatStore.getState().resetState();
    });

    it('el nombre retocado no sobrevive al cambio de cuenta, ni en memoria', () => {
        useChatStore.getState().renameAgent('cto-1', 'Hernesto');
        expect(
            useChatStore.getState().coreAgents.find((a) => a.id === 'cto-1')?.name,
        ).toBe('Hernesto');

        clearUserStores();

        expect(
            useChatStore.getState().coreAgents.find((a) => a.id === 'cto-1')?.name,
        ).toBe('Nexus (CTO)');
    });
});
