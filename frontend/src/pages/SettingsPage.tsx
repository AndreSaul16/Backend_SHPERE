/**
 * Settings shell: navegación entre las distintas secciones de configuración.
 * Cada sección es un componente independiente en src/pages/settings/.
 */
import { lazy, Suspense } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import {
  User,
  Link2,
  Bot,
  Users as UsersIcon,
  ArrowLeft,
  MessageSquare,
} from "lucide-react";

/**
 * Tarea 4.5 · D17d — las cinco secciones son perezosas.
 *
 * Los cinco `import` estáticos que había aquí metían ~1.900 LOC en el chunk que
 * el usuario descarga para ver UNA pestaña. Y no eran 1.900 LOC de nada:
 * `ConnectionsSettings` arrastra `IntegrationsSettings` (386) y
 * `ServiceCredentialsSettings` (402) con su cliente de API entero, y a
 * `/settings/profile` no se le pide ninguno de los dos.
 *
 * Nota sobre las «5 pestañas» del plan: son cinco entradas de navegación, pero
 * siete componentes de sección — «Conexiones» compone dos. Poniendo la puerta
 * en la pestaña, los dos de dentro caen con ella y no hace falta partir
 * `ConnectionsSettings`.
 */
const ProfileSettings = lazy(() => import("@/pages/settings/ProfileSettings").then((m) => ({ default: m.ProfileSettings })));
const ConnectionsSettings = lazy(() => import("@/pages/settings/ConnectionsSettings").then((m) => ({ default: m.ConnectionsSettings })));
const AgentOverridesSettings = lazy(() => import("@/pages/settings/AgentOverridesSettings").then((m) => ({ default: m.AgentOverridesSettings })));
const ContactsSettings = lazy(() => import("@/pages/settings/ContactsSettings").then((m) => ({ default: m.ContactsSettings })));
const BoardMeetingSettings = lazy(() => import("@/pages/settings/BoardMeetingSettings").then((m) => ({ default: m.BoardMeetingSettings })));

interface TabDef {
  id: string;
  label: string;
  icon: React.ReactNode;
  Seccion: React.ComponentType;
}

const TABS: TabDef[] = [
  { id: "profile", label: "Perfil", icon: <User className="h-4 w-4" />, Seccion: ProfileSettings },
  { id: "integrations", label: "Conexiones", icon: <Link2 className="h-4 w-4" />, Seccion: ConnectionsSettings },
  { id: "board-meeting", label: "Junta directiva", icon: <MessageSquare className="h-4 w-4" />, Seccion: BoardMeetingSettings },
  { id: "agent-overrides", label: "Agentes", icon: <Bot className="h-4 w-4" />, Seccion: AgentOverridesSettings },
  { id: "contacts", label: "Contactos", icon: <UsersIcon className="h-4 w-4" />, Seccion: ContactsSettings },
];

/**
 * La espera de una sección: la forma de un formulario largo, no un disco.
 * (R3 del plan; §9.12 el barrido.) Tres grupos de etiqueta + campo, que es lo
 * que las cinco secciones tienen en común.
 */
function SeccionCargando() {
  return (
    <div className="space-y-6" role="status" aria-label="Cargando la sección de ajustes">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2">
          <div className="skeleton h-3 w-32 rounded-xs" />
          <div className="skeleton h-11 w-full rounded-sm" />
        </div>
      ))}
    </div>
  );
}

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
      <div className="h-14 sm:h-16 pl-14 lg:pl-6 pr-3 sm:pr-6 border-b border-surface flex items-center gap-3 bg-surface-0 sticky top-0 z-10">
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
        <div className="sm:hidden border-b border-surface overflow-x-auto flex gap-1 px-2 py-2 bg-surface-1 absolute top-14 left-0 right-0 z-10">
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
            {/* El `key` es lo que hace que al cambiar de pestaña vuelva a
                aparecer el esqueleto en vez de quedarse la sección anterior
                congelada mientras la nueva baja: sin él, React reutiliza el
                mismo límite y `Suspense` no vuelve a suspender. */}
            <Suspense key={active.id} fallback={<SeccionCargando />}>
              <active.Seccion />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
