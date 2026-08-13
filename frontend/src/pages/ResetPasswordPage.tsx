/**
 * Recuperación de contraseña — tarea 5.14 (D26/D27).
 *
 * Esto NO existía. En toda la aplicación no había una sola salida para quien
 * olvidaba su contraseña: ni enlace en `/login`, ni ruta, ni llamada a Firebase.
 * El primer usuario que se quedara fuera generaba soporte manual, así que no es
 * calidad de vida sino un hueco de producto.
 *
 * Una sola ruta con dos momentos, porque son el mismo trámite:
 *
 * 1. **Petición** (`/reset-password`): se pide el correo y sale el enlace.
 * 2. **Cambio** (`/reset-password?oobCode=…`): es el enlace del correo. Se
 *    valida el código ANTES de enseñar los campos —un código caducado con dos
 *    campos delante hace escribir una contraseña para nada— y se fija la nueva.
 *
 * Dos decisiones que no son obvias:
 *
 * - **No se confirma si el correo existe.** El aviso es el mismo con cuenta y
 *   sin ella («si hay una cuenta con ese correo…»), y `auth/user-not-found` se
 *   trata como éxito. Un formulario que responde «ese usuario no existe» es un
 *   comprobador de cuentas para cualquiera. Firebase moderno protege contra la
 *   enumeración por su cuenta, pero el proyecto no controla ese ajuste del panel
 *   y esta pantalla no puede depender de él.
 * - **La validación es en vivo pero no impaciente**: el error de un campo no
 *   aparece hasta que ese campo se ha abandonado una vez (`touched`); a partir
 *   de ahí sí se actualiza con cada pulsación, que es cuando el usuario está
 *   corrigiendo y quiere saber si ya vale.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/auth";
import { PasswordField, TextField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { buttonClass } from "@/components/ui/buttonStyles";
import { AuthAlert, AuthNotice, AuthShell } from "@/components/auth/AuthShell";

/** Mínimo de Firebase, y el mismo que exige el registro. */
export const MINIMO_CONTRASENA = 6;

/** Los códigos de Firebase que sí tienen algo accionable que decir. */
function mensajeDePeticion(code: string): string | null {
  const messages: Record<string, string> = {
    "auth/invalid-email": "Ese correo no tiene un formato válido.",
    "auth/too-many-requests": "Demasiados intentos. Espera unos minutos y vuelve a probar.",
    "auth/missing-email": "Escribe el correo de tu cuenta.",
  };
  return messages[code] ?? null;
}

function mensajeDeCodigo(code: string): string {
  const messages: Record<string, string> = {
    "auth/expired-action-code":
      "Este enlace ha caducado. Pide uno nuevo: los enlaces duran una hora.",
    "auth/invalid-action-code":
      "Este enlace ya no sirve. Si has pedido varios, sólo funciona el último.",
    "auth/user-disabled": "Esta cuenta está deshabilitada. Escribe a soporte.",
    "auth/user-not-found": "Esta cuenta ya no existe.",
    "auth/weak-password": `La contraseña debe tener al menos ${MINIMO_CONTRASENA} caracteres.`,
  };
  // Neutral a propósito: esta misma función redacta el fallo de VALIDAR el
  // enlace y el de CAMBIAR la contraseña. Decir «no se pudo cambiar» cuando lo
  // que ha fallado es la validación cuenta algo que no ha pasado.
  return messages[code] ?? "Este enlace no se ha podido validar. Pide uno nuevo.";
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  // Firebase manda `oobCode`; su plantilla de correo puede añadir `mode`. Sólo
  // el código importa: es lo único que prueba que se ha abierto el enlace.
  const oobCode = params.get("oobCode");

  return oobCode ? <CambiarContrasena code={oobCode} /> : <PedirEnlace />;
}

/* ─────────────────────────── 1. Pedir el enlace ─────────────────────────── */

function PedirEnlace() {
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [tocado, setTocado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [loading, setLoading] = useState(false);

  // Validación en vivo (D27). Deliberadamente laxa: la comprobación de verdad
  // la hace Firebase, y una expresión estricta rechaza direcciones legítimas.
  const errorDeCorreo = useMemo(() => {
    if (!tocado || email.length === 0) return undefined;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ? undefined
      : "Falta el arroba o el dominio.";
  }, [email, tocado]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setLoading(true);
      try {
        await sendPasswordReset(email.trim());
        setEnviado(true);
      } catch (err) {
        const code = (err as { code?: string })?.code ?? "";
        // Que la cuenta no exista NO se cuenta: ver la cabecera del fichero.
        if (code === "auth/user-not-found") {
          setEnviado(true);
        } else {
          setError(
            mensajeDePeticion(code) ??
              "No se pudo enviar el enlace. Inténtalo de nuevo en un momento.",
          );
        }
      } finally {
        setLoading(false);
      }
    },
    [email, sendPasswordReset],
  );

  return (
    <AuthShell
      tagline="Vuelve a entrar en tu junta."
      title="Recuperar contraseña"
      footer={
        <>
          ¿Ya la recuerdas?{" "}
          <Link to="/login" className={buttonClass({ variant: "link" })}>
            Inicia sesión
          </Link>
        </>
      }
    >
      {error && <AuthAlert>{error}</AuthAlert>}

      {enviado ? (
        <>
          <AuthNotice>
            Si hay una cuenta con ese correo, el enlace ya va de camino. Caduca en una hora.
          </AuthNotice>
          <p className="text-sm text-content-muted">
            Revisa también la carpeta de correo no deseado. Si no llega, vuelve a pedirlo.
          </p>
          <Button
            type="button"
            variant="secondary"
            className="mt-4 w-full"
            onClick={() => setEnviado(false)}
          >
            Pedir otro enlace
          </Button>
        </>
      ) : (
        <>
          <p className="mb-4 text-sm text-content-muted">
            Escribe el correo de tu cuenta y te mandamos un enlace para elegir una
            contraseña nueva.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <TextField
              label="Correo electrónico"
              id="reset-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTocado(true)}
              error={errorDeCorreo}
              placeholder="tu@correo.com"
              required
              disabled={loading}
            />
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              loading={loading}
              loadingLabel="Enviando…"
              disabled={Boolean(errorDeCorreo)}
            >
              Enviar enlace
            </Button>
          </form>
        </>
      )}
    </AuthShell>
  );
}

/* ─────────────────────── 2. Elegir la contraseña nueva ──────────────────── */

type EstadoDelCodigo =
  | { fase: "comprobando" }
  | { fase: "valido"; email: string }
  | { fase: "invalido"; motivo: string };

function CambiarContrasena({ code }: { code: string }) {
  const { verifyPasswordReset, confirmPasswordResetWithCode } = useAuth();
  const navigate = useNavigate();

  const [estado, setEstado] = useState<EstadoDelCodigo>({ fase: "comprobando" });
  const [password, setPassword] = useState("");
  const [repetida, setRepetida] = useState("");
  const [tocada, setTocada] = useState(false);
  const [tocadaRepetida, setTocadaRepetida] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hecho, setHecho] = useState(false);

  useEffect(() => {
    let vivo = true;
    verifyPasswordReset(code)
      .then((email) => {
        if (vivo) setEstado({ fase: "valido", email });
      })
      .catch((err: unknown) => {
        if (vivo) {
          setEstado({
            fase: "invalido",
            motivo: mensajeDeCodigo((err as { code?: string })?.code ?? ""),
          });
        }
      });
    return () => {
      vivo = false;
    };
  }, [code, verifyPasswordReset]);

  const errorDeLongitud =
    tocada && password.length > 0 && password.length < MINIMO_CONTRASENA
      ? `Al menos ${MINIMO_CONTRASENA} caracteres.`
      : undefined;
  const errorDeRepeticion =
    tocadaRepetida && repetida.length > 0 && repetida !== password
      ? "Las dos contraseñas no coinciden."
      : undefined;
  const puedeEnviar =
    password.length >= MINIMO_CONTRASENA && repetida === password && !loading;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setLoading(true);
      try {
        await confirmPasswordResetWithCode(code, password);
        setHecho(true);
        // Un respiro para leer el aviso; el destino es la pantalla donde ya se
        // puede usar lo que se acaba de elegir.
        window.setTimeout(() => navigate("/login"), 1500);
      } catch (err) {
        setError(mensajeDeCodigo((err as { code?: string })?.code ?? ""));
      } finally {
        setLoading(false);
      }
    },
    [code, confirmPasswordResetWithCode, navigate, password],
  );

  if (estado.fase === "comprobando") {
    return (
      <AuthShell title="Comprobando el enlace">
        <p role="status" className="text-sm text-content-muted">
          Un momento: estamos verificando que el enlace sigue siendo válido.
        </p>
      </AuthShell>
    );
  }

  if (estado.fase === "invalido") {
    return (
      <AuthShell
        title="El enlace no sirve"
        footer={
          <Link to="/login" className={buttonClass({ variant: "link" })}>
            Volver a iniciar sesión
          </Link>
        }
      >
        <AuthAlert>{estado.motivo}</AuthAlert>
        <Link to="/reset-password" className={buttonClass({ variant: "primary", className: "w-full" })}>
          Pedir un enlace nuevo
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Elegir contraseña nueva"
      footer={
        <Link to="/login" className={buttonClass({ variant: "link" })}>
          Volver a iniciar sesión
        </Link>
      }
    >
      {error && <AuthAlert>{error}</AuthAlert>}
      {hecho && <AuthNotice>Contraseña cambiada. Te llevamos a la pantalla de acceso.</AuthNotice>}

      <p className="mb-4 text-sm text-content-muted">
        Cuenta: <span className="text-content-strong">{estado.email}</span>
      </p>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* El campo de correo oculto es lo que hace que el gestor de contraseñas
            guarde la nueva EN la cuenta correcta: sin él no sabe de quién es. */}
        <input type="hidden" name="username" autoComplete="username" value={estado.email} readOnly />
        <PasswordField
          label="Contraseña nueva"
          id="reset-new-password"
          autoComplete="new-password"
          hint={`Al menos ${MINIMO_CONTRASENA} caracteres.`}
          error={errorDeLongitud}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => setTocada(true)}
          placeholder="••••••••"
          required
          minLength={MINIMO_CONTRASENA}
          disabled={loading || hecho}
        />
        <PasswordField
          label="Repite la contraseña"
          id="reset-new-password-confirm"
          autoComplete="new-password"
          error={errorDeRepeticion}
          value={repetida}
          onChange={(e) => setRepetida(e.target.value)}
          onBlur={() => setTocadaRepetida(true)}
          placeholder="••••••••"
          required
          minLength={MINIMO_CONTRASENA}
          disabled={loading || hecho}
        />
        <Button
          type="submit"
          variant="primary"
          className="w-full"
          loading={loading}
          loadingLabel="Guardando…"
          disabled={!puedeEnviar || hecho}
        >
          Cambiar contraseña
        </Button>
      </form>
    </AuthShell>
  );
}
