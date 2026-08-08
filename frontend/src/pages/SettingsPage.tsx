/**
 * Settings shell: navegación entre las distintas secciones de configuración.
 * Cada sección es un componente independiente en src/pages/settings/.
 *
 * **6.4 — qué cambió y por qué.** El shell tenía tres problemas de fondo:
 *
 * - La pestaña activa se marcaba **sólo con color** y sin `aria-current`.
 * - La barra de pestañas de móvil se desplazaba **sin ninguna pista visual**:
 *   a 320px «Contactos» no existía para quien no supiera que estaba ahí.
 * - **Facturación y el panel de administración vivían fuera** de esta
 *   navegación, colgando sólo de la barra lateral del chat. Son ajustes de la
 *   cuenta: quien entra en Configuración a mirar su saldo no los encontraba.
 *
 * Las dos formas de la navegación viven en `components/layout/NavDeAjustes`.
 * Facturación y Administración entran como entradas que **salen** del shell
 * (son rutas propias, `/billing` y `/admin`, y así se quedan: moverlas dentro
 * cambiaría `MODULOS_DE_RUTA`, que tiene su propia lista cerrada bajo test).
 * La de administración sólo se pinta si el backend concede el panel.
 */
import { lazy, Suspense } from "react";
import { useParams, Navigate, Link } from "react-router-dom";
import {
  User,
  Link2,
  Bot,
  Users as UsersIcon,
  ArrowLeft,
  MessageSquare,
  CreditCard,
  ShieldCheck,
} from "lucide-react";
import {
  NavDesplazableDeAjustes,
  NavLateralDeAjustes,
  type EntradaDeAjustes,
} from "@/components/layout/NavDeAjustes";
import { useEsAdmin } from "@/hooks/useEsAdmin";

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

interface TabDef extends EntradaDeAjustes {
  Seccion: React.ComponentType;
}

const TABS: TabDef[] = [
  { id: "profile", label: "Perfil", to: "/settings/profile", icon: <User className="h-4 w-4" />, Seccion: ProfileSettings },
  { id: "integrations", label: "Conexiones", to: "/settings/integrations", icon: <Link2 className="h-4 w-4" />, Seccion: ConnectionsSettings },
  { id: "board-meeting", label: "Junta directiva", to: "/settings/board-meeting", icon: <MessageSquare className="h-4 w-4" />, Seccion: BoardMeetingSettings },
  { id: "agent-overrides", label: "Agentes", to: "/settings/agent-overrides", icon: <Bot className="h-4 w-4" />, Seccion: AgentOverridesSettings },
  { id: "contacts", label: "Contactos", to: "/settings/contacts", icon: <UsersIcon className="h-4 w-4" />, Seccion: ContactsSettings },
];

const FACTURACION: EntradaDeAjustes = {
  id: "billing",
  label: "Facturación",
  to: "/billing",
  icon: <CreditCard className="h-4 w-4" />,
  externa: true,
};

const ADMINISTRACION: EntradaDeAjustes = {
  id: "admin",
  label: "Administración",
  to: "/admin",
  icon: <ShieldCheck className="h-4 w-4" />,
  externa: true,
};

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
  const esAdmin = useEsAdmin();

  const entradas: EntradaDeAjustes[] = esAdmin
    ? [...TABS, FACTURACION, ADMINISTRACION]
    : [...TABS, FACTURACION];

  if (section && LEGACY_REDIRECTS[section]) {
    return <Navigate to={LEGACY_REDIRECTS[section]} replace />;
  }

  const activeId = section || "profile";
  const active = TABS.find((t) => t.id === activeId);

  if (!active) return <Navigate to="/settings/profile" replace />;

  return (
    <div className="flex flex-col h-full relative overflow-y-auto bg-surface-0">
      {/* Cabecera */}
      <div className="h-14 sm:h-16 pl-14 lg:pl-6 pr-3 sm:pr-6 border-b border-stroke-hairline flex items-center gap-3 bg-surface-0 sticky top-0 z-20">
        <Link
          to="/"
          className="p-2 hover:bg-surface-1 rounded-sm transition-colors text-content-muted hover:text-content-strong"
          aria-label="Volver al chat"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <h1 className="text-base sm:text-xl font-semibold text-content-strong">
          Configuración
        </h1>
      </div>

      {/* Navegación desplazable de móvil: adherida bajo la cabecera, en flujo.
          Antes era `absolute top-14` y el contenido tenía que compensarla con
          un `pt-14` a mano; cualquier cambio de alto de cabecera lo rompía. */}
      <div className="sticky top-14 z-10 border-b border-stroke-hairline bg-surface-0 sm:hidden">
        <NavDesplazableDeAjustes entradas={entradas} />
      </div>

      <div className="flex-1 flex overflow-hidden">
        <NavLateralDeAjustes entradas={entradas} />

        {/* Contenido */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-xl font-semibold text-content-strong mb-6 hidden sm:block">
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
