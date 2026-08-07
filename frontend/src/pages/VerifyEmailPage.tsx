/**
 * Pantalla de verificación de email. Las cuentas email/password no reciben créditos
 * ni pueden usar /stream hasta verificar (gate del backend). Aquí pueden reenviar el
 * correo y comprobar el estado.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { MailCheck, RefreshCw, LogOut } from "lucide-react";

export function VerifyEmailPage() {
    const { user, resendVerification, reloadUser, signOut } = useAuth();
    const navigate = useNavigate();
    const [cooldown, setCooldown] = useState(0);
    const [checking, setChecking] = useState(false);
    const [resent, setResent] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Si ya está verificado (o no es cuenta password), salir de aquí.
    useEffect(() => {
        if (!user) { navigate("/login", { replace: true }); return; }
        if (user.providerId !== "password" || user.emailVerified) {
            navigate("/", { replace: true });
        }
    }, [user, navigate]);

    // Cooldown del botón de reenvío.
    useEffect(() => {
        if (cooldown <= 0) return;
        const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
        return () => clearTimeout(t);
    }, [cooldown]);

    // Polling suave: cada 5s comprobamos si ya verificó (sin spamear).
    useEffect(() => {
        const iv = setInterval(async () => {
            const ok = await reloadUser();
            if (ok) navigate("/", { replace: true });
        }, 5000);
        return () => clearInterval(iv);
    }, [reloadUser, navigate]);

    const handleResend = async () => {
        setError(null);
        try {
            await resendVerification();
            setResent(true);
            setCooldown(60);
        } catch (e: any) {
            setError(e?.code === "auth/too-many-requests"
                ? "Demasiados intentos. Espera unos minutos."
                : "No se pudo reenviar. Intenta de nuevo.");
        }
    };

    const handleCheck = async () => {
        setChecking(true);
        setError(null);
        try {
            const ok = await reloadUser();
            if (ok) navigate("/", { replace: true });
            else setError("Aún no detectamos la verificación. Revisa tu correo (y spam).");
        } finally {
            setChecking(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 px-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">SPHERE</h1>
                </div>
                <div className="bg-gray-800/60 backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-gray-700/50 text-center">
                    <div className="h-16 w-16 mx-auto rounded-2xl bg-electric-cyan/10 border border-electric-cyan/30 flex items-center justify-center mb-5">
                        <MailCheck className="h-8 w-8 text-electric-cyan" />
                    </div>
                    <h2 className="text-xl font-semibold text-white mb-2">Verifica tu correo</h2>
                    <p className="text-sm text-gray-400 leading-relaxed mb-6">
                        Te enviamos un enlace de verificación a <strong className="text-white">{user?.email}</strong>.
                        Ábrelo para activar tu cuenta y recibir tus <strong className="text-white">30 créditos</strong> gratis.
                    </p>

                    {resent && <div className="mb-4 p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-xs">Correo reenviado ✓</div>}
                    {error && <div className="mb-4 p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs">{error}</div>}

                    <div className="space-y-3">
                        <button
                            onClick={handleCheck}
                            disabled={checking}
                            className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium rounded-lg hover:from-purple-500 hover:to-pink-500 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
                            Ya verifiqué mi correo
                        </button>
                        <button
                            onClick={handleResend}
                            disabled={cooldown > 0}
                            className="w-full py-3 bg-gray-700/50 hover:bg-gray-700 text-white rounded-lg transition-colors disabled:opacity-50 text-sm"
                        >
                            {cooldown > 0 ? `Reenviar en ${cooldown}s` : "Reenviar correo de verificación"}
                        </button>
                        <button
                            onClick={() => { signOut(); navigate("/login", { replace: true }); }}
                            className="w-full py-2 text-content-muted hover:text-content-strong text-xs transition-colors flex items-center justify-center gap-1.5"
                        >
                            <LogOut className="h-3 w-3" /> Cerrar sesión
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
