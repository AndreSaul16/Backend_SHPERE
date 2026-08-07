/**
 * Pantalla de verificación de correo — DESIGN §0, §9.1, §4.3.
 *
 * Las cuentas de correo y contraseña no reciben créditos ni pueden usar
 * `/stream` hasta verificar (gate del backend). Aquí se puede reenviar el
 * correo y comprobar el estado.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { MailCheck, RefreshCw, LogOut } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AuthAlert, AuthNotice, AuthShell } from "@/components/auth/AuthShell";

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
                : "No se pudo reenviar. Inténtalo de nuevo.");
        }
    };

    const handleCheck = async () => {
        setChecking(true);
        setError(null);
        try {
            const ok = await reloadUser();
            if (ok) navigate("/", { replace: true });
            else setError("Aún no detectamos la verificación. Revisa tu correo (y la carpeta de spam).");
        } finally {
            setChecking(false);
        }
    };

    return (
        <AuthShell title="Verifica tu correo" centered>
            <div className="text-center">
                {/* §10: glifo de línea, no emoji; §2.3: el latón es el filete. */}
                <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-sm border border-brass-600 bg-accent/12 text-accent">
                    <MailCheck className="h-6 w-6" aria-hidden="true" />
                </div>

                <p className="mb-6 text-sm leading-relaxed text-content-muted">
                    Te hemos enviado un enlace de verificación a{" "}
                    <strong className="text-content-strong">{user?.email}</strong>. Ábrelo para
                    activar tu cuenta y recibir tus{" "}
                    <strong className="text-content-strong">30 créditos</strong> gratuitos.
                </p>

                {resent && <AuthNotice>Correo reenviado.</AuthNotice>}
                {error && <AuthAlert>{error}</AuthAlert>}

                <div className="space-y-3">
                    <Button
                        variant="primary"
                        className="w-full"
                        onClick={handleCheck}
                        loading={checking}
                        loadingLabel="Comprobando…"
                    >
                        <RefreshCw className="h-4 w-4" aria-hidden="true" />
                        Ya he verificado mi correo
                    </Button>
                    <Button
                        variant="secondary"
                        className="w-full"
                        onClick={handleResend}
                        disabled={cooldown > 0}
                    >
                        {cooldown > 0 ? `Reenviar en ${cooldown} s` : "Reenviar correo de verificación"}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="w-full"
                        onClick={() => { signOut(); navigate("/login", { replace: true }); }}
                    >
                        <LogOut className="h-4 w-4" aria-hidden="true" />
                        Cerrar sesión
                    </Button>
                </div>
            </div>
        </AuthShell>
    );
}
