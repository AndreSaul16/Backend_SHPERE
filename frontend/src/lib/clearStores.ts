/**
 * Limpia todo el estado específico del usuario (A6).
 *
 * Se llama al expirar/invalidarse la sesión y al cerrar sesión, ANTES de
 * cualquier redirect. Evita que en un navegador compartido el siguiente usuario
 * vea —aunque sea un instante— mensajes, agentes o saldo de la cuenta anterior.
 */
import { useChatStore } from '../store/useChatStore';
import { useBillingStore } from '../store/useBillingStore';
import { useBoardSettingsStore } from '../store/useBoardSettingsStore';
import { clearAgentIdentityOverrides } from './agentIdentityOverrides';
import { olvidarSiEsAdmin } from '../hooks/useEsAdmin';

export function clearUserStores(): void {
  try {
    useChatStore.getState().resetState();
  } catch {
    /* no romper el flujo de logout por un fallo de reset */
  }
  try {
    useBillingStore.getState().reset();
  } catch {
    /* idem */
  }
  try {
    // El ajuste de debate es por cuenta: sin esto, el siguiente usuario vería
    // el interruptor del anterior hasta que resolviera su primer `load()`.
    useBoardSettingsStore.getState().reset();
  } catch {
    /* idem */
  }
  // Los nombres y colores que el usuario anterior dio a los directores (D28)
  // tampoco son del siguiente.
  clearAgentIdentityOverrides();
  // Ni su panel de administración: la respuesta está cacheada a nivel de módulo
  // para no repetir la consulta en cada remontaje del shell (QA-4), y esa caché
  // sobreviviría al cambio de cuenta.
  olvidarSiEsAdmin();
}
