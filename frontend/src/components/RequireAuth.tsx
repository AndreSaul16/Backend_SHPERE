/**
 * RequireAuth: wrapper que redirige a /login si no hay sesión.
 *
 * D24: su estado de carga era la última pantalla que quedaba con el diseño
 * viejo (gris de Tailwind y tinta violeta) y encima `min-h-screen`, que §4.3
 * prohíbe por el hueco de Safari móvil. Ahora es paño, tinta y el glifo de
 * espera de §9.12 («si la forma del contenido no se conoce, spinner»), con
 * `role="status"` para que la espera exista también sin verla.
 *
 * **6.2 · El destino se conserva.** La redirección era `<Navigate to="/login">`
 * a secas: quien abría un enlace a `/billing` —o volvía a una pestaña con la
 * sesión caducada— acababa en la portada tras identificarse, sin ninguna pista
 * de adónde iba. El destino viaja ahora en el `state` de la navegación (no en
 * la query: no es información que deba quedar en la barra ni en el historial de
 * nadie) y `/login` lo consume al entrar.
 */
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import type { EstadoDeRegreso } from "@/lib/rutaDeRegreso";
import type { ReactNode } from "react";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <p role="status" className="flex items-center gap-2 text-sm text-content-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Cargando…
        </p>
      </div>
    );
  }

  if (!user) {
    const estado: EstadoDeRegreso = {
      destino: `${location.pathname}${location.search}${location.hash}`,
    };
    return <Navigate to="/login" replace state={estado} />;
  }

  // Gate de verificación: cuentas email/password sin verificar van a /verify-email.
  // (Google/GitHub vienen ya verificadas; el backend no otorga créditos hasta verificar.)
  if (user.providerId === 'password' && !user.emailVerified) {
    const estado: EstadoDeRegreso = {
      destino: `${location.pathname}${location.search}${location.hash}`,
    };
    return <Navigate to="/verify-email" replace state={estado} />;
  }

  return <>{children}</>;
}
