import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { notify, reasonOf } from '../lib/toastBus';

// Modelo solo-créditos: el único plan es "free". Lo de pago son compras
// puntuales de créditos (packs + top-ups), no planes.
type PlanId = 'free';
export type PaywallReason = '402' | 'upgrade_cta' | 'rag_full' | 'agents_full';

interface BillingState {
  plan_id: PlanId;
  status: 'active' | 'past_due' | 'canceled';
  pro_messages_balance: number;
  topup_messages_balance: number;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  rag_storage_bytes_used: number;
  custom_agents_count: number;
  loaded: boolean;
  isLoading: boolean;
  error: string | null;
  stripe_configured: boolean;

  paywall: { open: boolean; reason: PaywallReason | null };

  refresh: () => Promise<void>;
  openPaywall: (reason: PaywallReason) => void;
  closePaywall: () => void;
  decrementOptimistic: (cost?: number) => void;
  reset: () => void;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const { getAuth } = await import('firebase/auth');
    const auth = getAuth();
    const user = auth.currentUser;
    if (user) {
      headers['Authorization'] = `Bearer ${await user.getIdToken()}`;
    }
  } catch {
    // sin auth aún → endpoint devolverá 401
  }
  return headers;
}

/**
 * Espera a que Firebase Auth haya resuelto su estado de persistencia.
 *
 * F7: esto era un sondeo de `auth.currentUser` cada 100ms **hasta agotar 5
 * segundos**, así que cualquier caso sin usuario —o con Firebase no
 * inicializado, que es lo que pasa en cuanto `getAuth()` lanza— pagaba los 5
 * segundos enteros ANTES de la primera petición. Ésa es la mayor parte del rato
 * que la pantalla de facturación se pasaba en bloques grises.
 *
 * `onAuthStateChanged` es la respuesta a la misma pregunta: dispara en cuanto
 * la persistencia está resuelta, con usuario o sin él. Se conserva el tope de 5
 * segundos por si el callback no llegara nunca.
 */
async function waitForAuthReady(): Promise<void> {
  try {
    const { getAuth, onAuthStateChanged } = await import('firebase/auth');
    const auth = getAuth();
    if (auth.currentUser) return; // Ya resuelto: nada que esperar.
    await new Promise<void>((resolve) => {
      let listo = false;
      const acabar = () => {
        if (listo) return;
        listo = true;
        clearTimeout(tope);
        try { desuscribir?.(); } catch { /* ya desuscrito */ }
        resolve();
      };
      const tope = setTimeout(acabar, 5000);
      const desuscribir = onAuthStateChanged(auth, acabar, acabar);
    });
  } catch {
    // Sin Firebase disponible no hay nada que esperar: la petición saldrá sin
    // token y el backend contestará 401. Antes esto costaba 5s de reloj.
  }
}

const RETRY_BACKOFFS = [1000, 2000, 4000];
const MAX_RETRIES = RETRY_BACKOFFS.length;

/**
 * F7 — una sola consulta de saldo en vuelo.
 *
 * `refresh()` lo llaman la página de facturación, el indicador de créditos, el
 * final de cada stream y el manejador de error del stream. Sin guardia, dos
 * llamadas solapadas se pisan: la segunda vuelve a poner `isLoading: true`
 * mientras la primera ya había terminado, y con reintentos de hasta 12s la
 * pantalla de facturación se quedaba en `isLoading && !loaded` — el esqueleto
 * perpetuo y mudo del informe. Compartir la promesa quita la carrera y de paso
 * ahorra peticiones.
 */
let consultaEnVuelo: Promise<void> | null = null;

/**
 * Ninguna consulta de saldo puede quedarse colgada.
 *
 * `fetch` sin señal espera lo que el sistema operativo quiera —minutos— y con
 * la guardia de arriba una petición colgada bloquearía todas las siguientes:
 * el mismo esqueleto perpetuo por otra puerta. Ocho segundos por intento; los
 * reintentos con backoff siguen su curso.
 */
const TIMEOUT_CONSULTA_MS = 8000;

function senalDeTimeout(): AbortSignal | undefined {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(TIMEOUT_CONSULTA_MS)
    : undefined;
}

export const useBillingStore = create<BillingState>()(
  devtools(
    (set, get) => ({
      plan_id: 'free',
      status: 'active',
      pro_messages_balance: 0,
      topup_messages_balance: 0,
      current_period_end: null,
      cancel_at_period_end: false,
      rag_storage_bytes_used: 0,
      custom_agents_count: 0,
      loaded: false,
      isLoading: false,
      error: null,
      stripe_configured: false,

      paywall: { open: false, reason: null },

      refresh: async () => {
        // Quien llegue con una consulta ya en curso espera a esa, no abre otra.
        if (consultaEnVuelo) return consultaEnVuelo;
        consultaEnVuelo = (async () => {
          // Señalizar que está cargando
          set({ isLoading: true, error: null });

          // Esperar a que Firebase Auth esté listo antes del primer fetch
          await waitForAuthReady();

          let lastError: unknown = null;

          for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
              // Backoff entre intentos (saltamos el delay en el primer intento)
              if (attempt > 0) {
                await new Promise((r) => setTimeout(r, RETRY_BACKOFFS[attempt - 1]));
              }

              const headers = await authHeaders();
              const res = await fetch(`${API_URL}/billing/me`, { headers, signal: senalDeTimeout() });

              if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
              }

              const data = await res.json();
              set({
                plan_id: data.plan_id ?? 'free',
                status: data.status ?? 'active',
                pro_messages_balance: data.pro_messages_balance ?? 0,
                topup_messages_balance: data.topup_messages_balance ?? 0,
                current_period_end: data.current_period_end ?? null,
                cancel_at_period_end: data.cancel_at_period_end ?? false,
                rag_storage_bytes_used: data.rag_storage_bytes_used ?? 0,
                custom_agents_count: data.custom_agents_count ?? 0,
                stripe_configured: data.stripe_configured ?? false,
                loaded: true,
                isLoading: false,
                error: null,
              });
              return; // Éxito
            } catch (err) {
              lastError = err;
              // Si es el último intento, no reintentamos
              if (attempt === MAX_RETRIES) break;
              console.warn(
                `billing/me attempt ${attempt + 1} failed, retrying in ${RETRY_BACKOFFS[attempt]}ms`,
                err
              );
            }
          }

          // Todos los intentos fallaron.
          //
          // El `error` de abajo sólo lo pinta `BillingPage`; desde la sidebar o
          // el indicador de créditos este fallo era invisible y dejaba el saldo
          // congelado en una cifra vieja, que es con la que el usuario decide si
          // convoca una junta. De ahí el aviso.
          //
          // `warning`, no `error`: no se ha perdido nada ni ha fallado ninguna
          // acción suya, sólo la cifra puede estar desfasada. Y `dedupeKey`
          // porque esto se reintenta al volver a la pestaña y tras cada stream.
          notify({
              title: 'Tu saldo de créditos puede no estar al día',
              detail: reasonOf(lastError) ?? 'No se ha podido consultar el saldo.',
              variant: 'warning',
              dedupeKey: 'billing-refresh',
              action: { label: 'Reintentar', onClick: () => { void get().refresh(); } },
          });
          set({
            isLoading: false,
            // F7: esto ponía `loaded: false` SIEMPRE, o sea que una consulta
            // fallida borraba la constancia de un saldo que ya se había cargado
            // bien. Con dos llamadas solapadas eso dejaba la pantalla de
            // facturación en «cargando y sin datos» con datos delante. Un fallo
            // al REFRESCAR no invalida lo ya cargado: lo envejece.
            loaded: get().loaded,
            error: 'Error al cargar la información de facturación',
          });
        })().finally(() => { consultaEnVuelo = null; });
        return consultaEnVuelo;
      },

      openPaywall: (reason) => {
        set({ paywall: { open: true, reason } });
      },

      closePaywall: () => {
        set({ paywall: { open: false, reason: null } });
      },

      // Decremento optimista del saldo. `cost` = créditos del envío (1 chat normal,
      // 5 un board meeting). Se descuenta primero de pro_messages y el resto de
      // top-ups, reflejando el orden de cobro del backend (A4).
      decrementOptimistic: (cost = 1) => {
        const state = get();
        let remaining = cost;
        let pro = state.pro_messages_balance;
        let topup = state.topup_messages_balance;

        const fromPro = Math.min(pro, remaining);
        pro -= fromPro;
        remaining -= fromPro;
        if (remaining > 0) {
          topup = Math.max(0, topup - remaining);
        }
        set({ pro_messages_balance: pro, topup_messages_balance: topup });
      },

      // Limpia el saldo al cambiar de cuenta / expirar sesión (A6).
      reset: () => {
        // La consulta en vuelo era de la cuenta anterior: se suelta para que la
        // siguiente no quede esperando a un saldo que ya no es de nadie.
        consultaEnVuelo = null;
        set({
          plan_id: 'free',
          status: 'active',
          pro_messages_balance: 0,
          topup_messages_balance: 0,
          current_period_end: null,
          cancel_at_period_end: false,
          rag_storage_bytes_used: 0,
          custom_agents_count: 0,
          loaded: false,
          isLoading: false,
          error: null,
          paywall: { open: false, reason: null },
        });
      },
    }),
    { name: 'BillingStore' }
  )
);
