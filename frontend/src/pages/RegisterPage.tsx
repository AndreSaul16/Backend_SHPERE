/**
 * Página de Registro — DESIGN §0, §9.1, §9.2, §4.3.
 * Redirige a /verify-email tras registro con correo y contraseña.
 *
 * El marcado común con `/login` y `/verify-email` vive en `<AuthShell>`.
 */
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { PasswordField, TextField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { buttonClass } from "@/components/ui/buttonStyles";
import { AuthAlert, AuthShell, SocialButtons, type SocialProvider } from "@/components/auth/AuthShell";

export function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { signUpWithEmail, signInWithGoogle, signInWithGithub, signInWithMicrosoft } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    setLoading(true);

    try {
      await signUpWithEmail(email, password);
      navigate("/verify-email");
    } catch (err: any) {
      const code = err?.code || "";
      const messages: Record<string, string> = {
        "auth/email-already-in-use": "Este correo ya está registrado",
        "auth/weak-password": "La contraseña debe tener al menos 6 caracteres",
        "auth/invalid-email": "Correo no válido",
        "auth/too-many-requests": "Demasiados intentos. Inténtalo más tarde.",
        "auth/operation-not-allowed":
          "El registro con correo y contraseña no está habilitado. Usa Google, GitHub o Microsoft.",
      };
      setError(messages[code] || "No se pudo crear la cuenta. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const handleSocialSignUp = async (provider: SocialProvider) => {
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
        setError("Error con el registro social. Inténtalo de nuevo.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      tagline="Crea tu cuenta y convoca a tu junta directiva de IA."
      title="Crear cuenta"
      footer={
        <>
          ¿Ya tienes cuenta?{" "}
          <Link to="/login" className={buttonClass({ variant: "link" })}>
            Inicia sesión
          </Link>
        </>
      }
    >
      {error && <AuthAlert>{error}</AuthAlert>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <TextField
          label="Correo electrónico"
          id="register-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@correo.com"
          required
          disabled={loading}
        />
        <PasswordField
          label="Contraseña"
          id="register-password"
          autoComplete="new-password"
          hint="Al menos 6 caracteres."
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          minLength={6}
          disabled={loading}
        />
        <PasswordField
          label="Confirmar contraseña"
          id="register-password-confirm"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="••••••••"
          required
          minLength={6}
          disabled={loading}
        />

        <Button
          type="submit"
          variant="primary"
          className="w-full"
          loading={loading}
          loadingLabel="Creando cuenta…"
        >
          Crear cuenta
        </Button>
      </form>

      <SocialButtons
        separatorLabel="o regístrate con"
        disabled={loading}
        onSelect={handleSocialSignUp}
      />
    </AuthShell>
  );
}
