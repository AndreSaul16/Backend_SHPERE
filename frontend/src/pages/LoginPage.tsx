/**
 * Página de Login.
 * Email + Password + Google + GitHub + Microsoft social buttons.
 */
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { PasswordField, TextField } from "@/components/ui/Field";

const SOCIAL_LABELS: Record<string, string> = {
  google: "Google",
  github: "GitHub",
  microsoft: "Microsoft",
};

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
        "auth/invalid-email": "Email inválido",
        "auth/invalid-credential": "Credenciales inválidas",
        "auth/too-many-requests": "Demasiados intentos. Intenta más tarde.",
        "auth/operation-not-allowed":
          "El acceso con email y contraseña no está habilitado. Usa Google, GitHub o Microsoft.",
      };
      setError(messages[code] || "Error de autenticación. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = async (provider: "google" | "github" | "microsoft") => {
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
        setError("Ventana cerrada. Intenta de nuevo.");
      } else {
        setError("Error con el login social. Intenta de nuevo.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            SPHERE
          </h1>
          <p className="text-gray-400 mt-2">
            Tu equipo ejecutivo de IA, siempre listo.
          </p>
        </div>

        {/* Card */}
        <div className="bg-gray-800/60 backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-gray-700/50">
          <h2 className="text-xl font-semibold text-white mb-6 text-center">
            Iniciar sesión
          </h2>

          {error && (
            <div role="alert" className="mb-4 p-3 bg-dissent/10 border border-dissent/30 rounded-lg text-dissent text-sm">
              {error}
            </div>
          )}

          {/* Email/Password Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <TextField
              label="Correo electrónico"
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              required
              disabled={loading}
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
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium rounded-lg hover:from-purple-500 hover:to-pink-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Cargando..." : "Iniciar sesión"}
            </button>
          </form>

          {/* Divider */}
          <div className="my-6 flex items-center">
            <div className="flex-1 border-t border-gray-600"></div>
            <span className="px-4 text-sm text-gray-500">o continúa con</span>
            <div className="flex-1 border-t border-gray-600"></div>
          </div>

          {/* Social Buttons */}
          <div className="space-y-3">
            <SocialButton
              provider="google"
              loading={loading}
              onClick={() => handleSocialLogin("google")}
            />
            <SocialButton
              provider="github"
              loading={loading}
              onClick={() => handleSocialLogin("github")}
            />
            <SocialButton
              provider="microsoft"
              loading={loading}
              onClick={() => handleSocialLogin("microsoft")}
            />
          </div>

          {/* Link to Register */}
          <p className="mt-6 text-center text-sm text-gray-400">
            ¿No tienes cuenta?{" "}
            <Link
              to="/register"
              className="text-purple-400 hover:text-purple-300 font-medium"
            >
              Crea una cuenta
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

/** Botón de login social con icono inline. */
function SocialButton({
  provider,
  loading,
  onClick,
}: {
  provider: "google" | "github" | "microsoft";
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full py-3 bg-gray-700/50 hover:bg-gray-700 text-white rounded-lg flex items-center justify-center gap-3 transition-colors disabled:opacity-50"
    >
      <SocialIcon provider={provider} />
      {SOCIAL_LABELS[provider]}
    </button>
  );
}

/** Icono SVG inline para cada provider. */
function SocialIcon({ provider }: { provider: "google" | "github" | "microsoft" }) {
  switch (provider) {
    case "google":
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
      );
    case "github":
      return (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
        </svg>
      );
    case "microsoft":
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path fill="#F25022" d="M11.5 11.5H1V1h10.5v10.5z" />
          <path fill="#7FBA00" d="M23 11.5H12.5V1H23v10.5z" />
          <path fill="#00A4EF" d="M11.5 23H1V12.5h10.5V23z" />
          <path fill="#FFB900" d="M23 23H12.5V12.5H23V23z" />
        </svg>
      );
  }
}
