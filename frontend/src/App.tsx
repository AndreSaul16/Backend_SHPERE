import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { RequireAuth } from "@/components/RequireAuth";
import { MainLayout } from "@/components/layout/MainLayout";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { ArtifactPanel } from "@/components/artifacts/ArtifactPanel";
import { AgentSelectorModal } from "@/components/modals/AgentSelectorModal";
import { ProfilePage } from "@/pages/ProfilePage";
import { ChatSettingsPage } from "@/pages/ChatSettingsPage";
import { AgentDetailPage } from "@/pages/AgentDetailPage";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { VerifyEmailPage } from "@/pages/VerifyEmailPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { AuroraBackground } from "@/components/AuroraBackground";
import { ErrorOverlay } from "@/components/common/ErrorOverlay";
import { useChatStore } from "@/store/useChatStore";
import { PaywallModal } from "@/components/modals/PaywallModal";
import { BillingPage } from "@/pages/BillingPage";
import { SharedSessionPage } from "@/pages/SharedSessionPage";
import { AdminPage } from "@/pages/AdminPage";

function AuthenticatedApp() {
  const { fetchSessions, fetchCustomAgents } = useChatStore();
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
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      {/* Verificación de email (cuentas password sin verificar) */}
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      {/* Conversación compartida (público read-only, fuera de RequireAuth) */}
      <Route path="/share/:token" element={<SharedSessionPage />} />

      {/* Protected routes */}
      <Route
        path="/"
        element={
          <RequireAuth>
            <MainLayout
              sidebar={<Sidebar />}
              chat={<ChatPanel />}
              artifactPanel={<ArtifactPanel />}
            />
          </RequireAuth>
        }
      />
      <Route
        path="/chat/:sessionId"
        element={
          <RequireAuth>
            <MainLayout
              sidebar={<Sidebar />}
              chat={<ChatPanel />}
              artifactPanel={<ArtifactPanel />}
            />
          </RequireAuth>
        }
      />
      <Route
        path="/profile"
        element={
          <RequireAuth>
            <MainLayout
              sidebar={<Sidebar />}
              chat={<ProfilePage />}
            />
          </RequireAuth>
        }
      />
      <Route
        path="/chat/settings"
        element={
          <RequireAuth>
            <MainLayout
              sidebar={<Sidebar />}
              chat={<ChatSettingsPage />}
            />
          </RequireAuth>
        }
      />
      <Route
        path="/agents/:agentId"
        element={
          <RequireAuth>
            <MainLayout
              sidebar={<Sidebar />}
              chat={<AgentDetailPage />}
            />
          </RequireAuth>
        }
      />
      {/* Settings: ruta base + sub-rutas por sección */}
      <Route
        path="/settings"
        element={
          <RequireAuth>
            <MainLayout sidebar={<Sidebar />} chat={<SettingsPage />} />
          </RequireAuth>
        }
      />
      <Route
        path="/settings/:section"
        element={
          <RequireAuth>
            <MainLayout sidebar={<Sidebar />} chat={<SettingsPage />} />
          </RequireAuth>
        }
      />
      <Route
        path="/billing"
        element={
          <RequireAuth>
            <MainLayout sidebar={<Sidebar />} chat={<BillingPage />} />
          </RequireAuth>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireAuth>
            <MainLayout sidebar={<Sidebar />} chat={<AdminPage />} />
          </RequireAuth>
        }
      />
      {/* Catch-all: rutas desconocidas (p.ej. /status, ya retirada) → home. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <div className="relative min-h-screen">
        <AuroraBackground />
        <ErrorOverlay />
        <AgentSelectorModal />
        <PaywallModal />
        <AuthenticatedApp />
      </div>
    </AuthProvider>
  );
}

export default App;
