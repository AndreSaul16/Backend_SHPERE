/**
 * Settings shell: navegación entre las distintas secciones de configuración.
 * Cada sección es un componente independiente en src/pages/settings/.
 */
import { useParams, Link, Navigate } from "react-router-dom";
import {
  User,
  Link2,
  Bot,
  Users as UsersIcon,
  ArrowLeft,
  MessageSquare,
} from "lucide-react";

import { ProfileSettings } from "@/pages/settings/ProfileSettings";
import { ConnectionsSettings } from "@/pages/settings/ConnectionsSettings";
import { AgentOverridesSettings } from "@/pages/settings/AgentOverridesSettings";
import { ContactsSettings } from "@/pages/settings/ContactsSettings";
import { BoardMeetingSettings } from "@/pages/settings/BoardMeetingSettings";

interface TabDef {
  id: string;
  label: string;
  icon: React.ReactNode;
  render: () => React.ReactNode;
}

const TABS: TabDef[] = [
  { id: "profile", label: "Perfil", icon: <User className="h-4 w-4" />, render: () => <ProfileSettings /> },
  { id: "integrations", label: "Conexiones", icon: <Link2 className="h-4 w-4" />, render: () => <ConnectionsSettings /> },
  { id: "board-meeting", label: "Board Meeting", icon: <MessageSquare className="h-4 w-4" />, render: () => <BoardMeetingSettings /> },
  { id: "agent-overrides", label: "Agentes", icon: <Bot className="h-4 w-4" />, render: () => <AgentOverridesSettings /> },
  { id: "contacts", label: "Contactos", icon: <UsersIcon className="h-4 w-4" />, render: () => <ContactsSettings /> },
];

// Redirects de secciones legacy ya fusionadas en otras páginas.
const LEGACY_REDIRECTS: Record<string, string> = {
  "api-keys": "/settings/integrations", // fusionada en Conexiones
  storage: "/billing",                  // uso/almacenamiento ahora vive en Facturación
};

export function SettingsPage() {
  const { section } = useParams<{ section?: string }>();

  if (section && LEGACY_REDIRECTS[section]) {
    return <Navigate to={LEGACY_REDIRECTS[section]} replace />;
  }

  const activeId = section || "profile";
  const active = TABS.find((t) => t.id === activeId);

  if (!active) return <Navigate to="/settings/profile" replace />;

  return (
    <div className="flex flex-col h-full bg-midnight/40 relative overflow-y-auto">
      {/* Header */}
      <div className="h-14 sm:h-16 pl-14 lg:pl-6 pr-3 sm:pr-6 border-b border-surface flex items-center gap-3 bg-midnight/90 backdrop-blur-md sticky top-0 z-10">
        <Link
          to="/"
          className="p-2 hover:bg-surface rounded-full transition-colors text-content-muted hover:text-content-strong"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-base sm:text-xl font-bold text-content-strong">
          Configuración
        </h1>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left nav */}
        <nav className="hidden sm:flex flex-col w-56 border-r border-surface p-4 gap-1 bg-midnight/20 overflow-y-auto">
          {TABS.map((tab) => {
            const isActive = tab.id === activeId;
            return (
              <Link
                key={tab.id}
                to={`/settings/${tab.id}`}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors ${
                  isActive
                    ? "bg-electric-cyan/10 text-electric-cyan border border-electric-cyan/30"
                    : "text-content-muted hover:text-content-strong hover:bg-surface/40 border border-transparent"
                }`}
              >
                {tab.icon}
                {tab.label}
              </Link>
            );
          })}
        </nav>

        {/* Mobile tab bar */}
        <div className="sm:hidden border-b border-surface overflow-x-auto flex gap-1 px-2 py-2 bg-midnight/60 backdrop-blur-md absolute top-14 left-0 right-0 z-10">
          {TABS.map((tab) => {
            const isActive = tab.id === activeId;
            return (
              <Link
                key={tab.id}
                to={`/settings/${tab.id}`}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors ${
                  isActive
                    ? "bg-electric-cyan/10 text-electric-cyan border border-electric-cyan/30"
                    : "text-content-muted hover:text-content-strong border border-surface-highlight"
                }`}
              >
                {tab.icon}
                {tab.label}
              </Link>
            );
          })}
        </div>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 pt-14 sm:pt-6 scrollbar-thin scrollbar-thumb-surface-highlight">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-xl font-bold text-content-strong mb-6 hidden sm:block">
              {active.label}
            </h2>
            {active.render()}
          </div>
        </main>
      </div>
    </div>
  );
}
