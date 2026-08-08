/**
 * Página de Login — DESIGN §0 (dirección), §9.1 (botón), §9.2 (campos), §4.3
 * (móvil primero, diseñada a 390px).
 *
 * El marcado común con `/register` y `/verify-email` vive en `<AuthShell>`.
 */
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { PasswordField, TextField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { buttonClass } from "@/components/ui/buttonStyles";
import { AuthAlert, AuthShell, SocialButtons, type SocialProvider } from "@/components/auth/AuthShell";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { signInWithEmail, signInWithGoogle, signInWithGithub, signInWithMicrosoft } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await signInWithEmail(email, password);
      navigate("/");
    } catch (err: any) {
      const code = err?.code || "";
      const messages: Record<string, string> = {
        "auth/user-not-found": "Usuario no encontrado",
        "auth/wrong-password": "Contraseña incorrecta",
        "auth/invalid-email": "Correo no válido",
        "auth/invalid-credential": "Credenciales no válidas",
        "auth/too-many-requests": "Demasiados intentos. Inténtalo más tarde.",
        "auth/operation-not-allowed":
          "El acceso con correo y contraseña no está habilitado. Usa Google, GitHub o Microsoft.",
      };
      setError(messages[code] || "Error de autenticación. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = async (provider: SocialProvider) => {
    setError(null);
    setLoading(true);
    try {
      if (provider === "google") {
        await signInWithGoogle();
      } else if (provider === "github") {
        await signInWithGithub();
      } else {
        await signInWithMicrosoft();
      }
      navigate("/");
    } catch (err: any) {
      if (err?.code === "auth/popup-closed-by-user") {
        setError("Ventana cerrada. Inténtalo de nuevo.");
      } else {
        setError("Error con el acceso social. Inténtalo de nuevo.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      tagline="Tu junta directiva de IA, siempre reunida."
      title="Iniciar sesión"
      footer={
        <>
          ¿No tienes cuenta?{" "}
          <Link to="/register" className={buttonClass({ variant: "link" })}>
            Crea una cuenta
          </Link>
        </>
      }
    >
      {error && <AuthAlert>{error}</AuthAlert>}

      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
        <TextField
          label="Correo electrónico"
          id="login-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@correo.com"
          required
          disabled={loading}
          className="sm:space-y-2"
        />
        <PasswordField
          label="Contraseña"
          id="login-password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          minLength={6}
          disabled={loading}
          className="sm:space-y-2"
        />

        {/* 5.14 · D26. El enlace vive PEGADO al campo de contraseña, que es
            donde se descubre el problema, y no en el pie: quien no recuerda la
            clave no baja a leer el pie, vuelve a intentarlo.
            6.1: a 320px «¿Has olvidado tu contraseña?» no cabe en una línea
            junto al canto derecho sin quedar partido a media palabra, así que
            hasta `sm` va a la izquierda y con su propio salto. */}
        <div className="flex justify-start text-sm sm:justify-end">
          <Link to="/reset-password" className={buttonClass({ variant: "link" })}>
            ¿Has olvidado tu contraseña?
          </Link>
        </div>

        <Button
          type="submit"
          variant="primary"
          className="w-full sm:h-12"
          loading={loading}
          loadingLabel="Entrando…"
        >
          Iniciar sesión
        </Button>
      </form>

      <SocialButtons
        separatorLabel="o continúa con"
        disabled={loading}
        onSelect={handleSocialLogin}
      />
    </AuthShell>
  );
}
