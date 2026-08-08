import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { RequireAuth } from "@/components/RequireAuth";
import { MainLayout } from "@/components/layout/MainLayout";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { ErrorOverlay } from "@/components/common/ErrorOverlay";
import { ConnectionBanner } from "@/components/common/ConnectionBanner";
import { useChatStore } from "@/store/useChatStore";
import { PaywallModal } from "@/components/modals/PaywallModal";
import { AgentSelectorModal } from "@/components/modals/AgentSelectorModal";
import { ToastProvider } from "@/components/ui/Toast";
import { MODULOS_DE_RUTA } from "@/lib/rutasPerezosas";
import {
  EsqueletoDeAutenticacion,
  EsqueletoDeChat,
  EsqueletoDeDocumento,
  EsqueletoDePagina,
} from "@/components/shared/EsqueletosDeRuta";

/**
 * Tarea 4.1 · D17a — las trece rutas se parten.
 *
 * Este fichero tenía CERO `React.lazy`: las once páginas, el panel de chat y el
 * panel de artefactos entraban enteros en la carga inicial. O sea que quien
 * abría `/login` —que es todo el mundo la primera vez— descargaba también el
 * panel de administración, la facturación, el detalle de agente y el asistente
 * de creación antes de poder escribir su correo.
 *
 * Lo que se queda EAGER, y por qué:
 *
 * - `MainLayout` y `Sidebar`: son el chrome de las rutas protegidas, están en
 *   pantalla en todas ellas y no se pueden partir sin que la navegación entre
 *   dos rutas protegidas repinte el marco entero.
 * - `RequireAuth`: es el primer pixel de toda carga en frío; partirlo sería
 *   añadir una espera antes de la espera.
 * - Los cuatro elementos de raíz (`ConnectionBanner`, `ErrorOverlay`,
 *   `ToastProvider`, `PaywallModal`): viven fuera del enrutador porque su
 *   trabajo es estar SIEMPRE montados.
 *
 * `AgentSelectorModal` también se queda: desde 4.5 el peso que tenía (el
 * asistente) ya viaja aparte, y lo que queda es la lista de directores, que es
 * la acción principal de la pantalla de bienvenida.
 *
 * Cada `<Suspense>` lleva el esqueleto del LAYOUT de su ruta (riesgo R3), nunca
 * un spinner centrado: así el sitio queda reservado y la navegación no se lee
 * como una recarga.
 */
const ChatPanel = lazy(() => MODULOS_DE_RUTA.chat().then((m) => ({ default: m.ChatPanel })));
const ArtifactPanel = lazy(() => MODULOS_DE_RUTA.panelDeArtefactos().then((m) => ({ default: m.ArtifactPanel })));
const ProfilePage = lazy(() => MODULOS_DE_RUTA.perfil().then((m) => ({ default: m.ProfilePage })));
const ChatSettingsPage = lazy(() => MODULOS_DE_RUTA.ajustesDeConversacion().then((m) => ({ default: m.ChatSettingsPage })));
const AgentDetailPage = lazy(() => MODULOS_DE_RUTA.detalleDeAgente().then((m) => ({ default: m.AgentDetailPage })));
const SettingsPage = lazy(() => MODULOS_DE_RUTA.ajustes().then((m) => ({ default: m.SettingsPage })));
const BillingPage = lazy(() => MODULOS_DE_RUTA.facturacion().then((m) => ({ default: m.BillingPage })));
const AdminPage = lazy(() => MODULOS_DE_RUTA.admin().then((m) => ({ default: m.AdminPage })));
const LoginPage = lazy(() => MODULOS_DE_RUTA.entrar().then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => MODULOS_DE_RUTA.registro().then((m) => ({ default: m.RegisterPage })));
const VerifyEmailPage = lazy(() => MODULOS_DE_RUTA.verificarEmail().then((m) => ({ default: m.VerifyEmailPage })));
const SharedSessionPage = lazy(() => MODULOS_DE_RUTA.conversacionCompartida().then((m) => ({ default: m.SharedSessionPage })));

/**
 * Una ruta protegida: guarda de sesión, shell de tres columnas y el esqueleto
 * de espera de ESA ruta.
 *
 * El `<Suspense>` va DENTRO de `MainLayout` y no fuera a propósito: fuera, el
 * rail y la cabecera desaparecerían mientras baja la página y volverían a
 * aparecer — un parpadeo del chrome entero en cada navegación, que es
 * exactamente el síntoma que R3 avisa.
 */
function RutaConShell({ children, esqueleto, panelDeArtefactos }: {
  children: ReactNode;
  esqueleto: ReactNode;
  panelDeArtefactos?: ReactNode;
}) {
  return (
    <RequireAuth>
      <MainLayout
        sidebar={<Sidebar />}
        chat={<Suspense fallback={esqueleto}>{children}</Suspense>}
        artifactPanel={panelDeArtefactos}
      />
    </RequireAuth>
  );
}

/** El chat y su panel de artefactos, que son las dos mitades de la misma ruta. */
function RutaDeChat() {
  return (
    <RutaConShell
      esqueleto={<EsqueletoDeChat />}
      panelDeArtefactos={<Suspense fallback={null}><ArtifactPanel /></Suspense>}
    >
      <ChatPanel />
    </RutaConShell>
  );
}

function AuthenticatedApp() {
  /* 4.6 · D20 — esto era `const { … } = useChatStore()`, o sea una suscripción
     al store ENTERO en el componente que contiene TODAS las rutas. Un token de
     streaming re-renderizaba el árbol completo de la aplicación desde aquí
     arriba, y para leer dos funciones que no cambian nunca. Dos selectores
     atómicos: sólo se vuelve a evaluar si cambia la función, que es jamás. */
  const fetchSessions = useChatStore((s) => s.fetchSessions);
  const fetchCustomAgents = useChatStore((s) => s.fetchCustomAgents);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      fetchSessions();
      fetchCustomAgents();
    }
  }, [user, fetchSessions, fetchCustomAgents]);

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<Suspense fallback={<EsqueletoDeAutenticacion />}><LoginPage /></Suspense>} />
      <Route path="/register" element={<Suspense fallback={<EsqueletoDeAutenticacion />}><RegisterPage /></Suspense>} />
      {/* Verificación de email (cuentas password sin verificar) */}
      <Route path="/verify-email" element={<Suspense fallback={<EsqueletoDeAutenticacion />}><VerifyEmailPage /></Suspense>} />
      {/* Conversación compartida (público read-only, fuera de RequireAuth) */}
      <Route path="/share/:token" element={<Suspense fallback={<EsqueletoDeDocumento />}><SharedSessionPage /></Suspense>} />

      {/* Protected routes */}
      <Route path="/" element={<RutaDeChat />} />
      <Route path="/chat/:sessionId" element={<RutaDeChat />} />
      <Route
        path="/profile"
        element={<RutaConShell esqueleto={<EsqueletoDePagina />}><ProfilePage /></RutaConShell>}
      />
      <Route
        path="/chat/settings"
        element={<RutaConShell esqueleto={<EsqueletoDePagina />}><ChatSettingsPage /></RutaConShell>}
      />
      <Route
        path="/agents/:agentId"
        element={<RutaConShell esqueleto={<EsqueletoDePagina />}><AgentDetailPage /></RutaConShell>}
      />
      {/* Settings: ruta base + sub-rutas por sección */}
      <Route
        path="/settings"
        element={<RutaConShell esqueleto={<EsqueletoDePagina />}><SettingsPage /></RutaConShell>}
      />
      <Route
        path="/settings/:section"
        element={<RutaConShell esqueleto={<EsqueletoDePagina />}><SettingsPage /></RutaConShell>}
      />
      <Route
        path="/billing"
        element={<RutaConShell esqueleto={<EsqueletoDePagina />}><BillingPage /></RutaConShell>}
      />
      <Route
        path="/admin"
        element={<RutaConShell esqueleto={<EsqueletoDePagina />}><AdminPage /></RutaConShell>}
      />
      {/* Catch-all: rutas desconocidas (p.ej. /status, ya retirada) → home. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <div className="relative min-h-dvh">
        {/* Eje 5 · el estado de la red se dice antes de que el usuario pulse. */}
        <ConnectionBanner />
        <ErrorOverlay />
        <AgentSelectorModal />
        <PaywallModal />
        {/* DESIGN §9.5: la región de avisos vive en la raíz y está SIEMPRE en el
            DOM, para que un `aria-live` no se monte junto a su contenido. */}
        <ToastProvider />
        <AuthenticatedApp />
      </div>
    </AuthProvider>
  );
}

export default App;
