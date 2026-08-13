/**
 * Pantalla de verificación de correo — DESIGN §0, §9.1, §4.3.
 *
 * Las cuentas de correo y contraseña no reciben créditos ni pueden usar
 * `/stream` hasta verificar (gate del backend). Aquí se puede reenviar el
 * correo y comprobar el estado.
 */
import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/auth";
import { MailCheck, RefreshCw, LogOut } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AuthAlert, AuthNotice, AuthShell } from "@/components/auth/AuthShell";
import { destinoDeRegreso } from "@/lib/rutaDeRegreso";
import { esCodigoDeFirebase } from "@/lib/erroresDeFirebase";

/** Primera espera del sondeo de verificación (D48). */
const ESPERA_INICIAL_MS = 5_000;
/** Techo de la espera: un sondeo por minuto es suficiente para no perderse. */
const ESPERA_MAXIMA_MS = 60_000;
/** A los diez minutos se deja de preguntar y queda el botón manual. */
const SONDEO_MAXIMO_MS = 10 * 60_000;

export function VerifyEmailPage() {
    const { user, resendVerification, reloadUser, signOut } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    /* 6.2 · El destino sobrevive también a la verificación: quien abrió un
       enlace a /billing sin verificar pasa por aquí, y al verificar vuelve
       allí, no a la portada. */
    const destino = destinoDeRegreso(location.state) ?? "/";
    const [cooldown, setCooldown] = useState(0);
    const [checking, setChecking] = useState(false);
    const [resent, setResent] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Si ya está verificado (o no es cuenta password), salir de aquí.
    useEffect(() => {
        if (!user) { navigate("/login", { replace: true }); return; }
        if (user.providerId !== "password" || user.emailVerified) {
            navigate(destino, { replace: true });
        }
    }, [user, navigate, destino]);

    // Cooldown del botón de reenvío.
    useEffect(() => {
        if (cooldown <= 0) return;
        const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
        return () => clearTimeout(t);
    }, [cooldown]);

    /**
     * D48 — el sondeo dejó de ser cada 5 s para siempre.
     *
     * Era un `setInterval` de 5 000 ms sin techo y sin mirar si la pestaña
     * estaba visible: quien deja esta pantalla abierta en una pestaña de
     * fondo —que es exactamente lo que se hace mientras se busca el correo—
     * disparaba 720 recargas de token por hora, contra Firebase, para
     * siempre. Ahora: espera creciente (5 s, 7,5 s, 11 s… hasta 60 s), en
     * pausa mientras la pestaña está oculta, y se rinde a los 10 minutos
     * dejando el botón «Ya lo he verificado», que es la vía manual y siempre
     * estuvo ahí.
     */
    const [sondeoAgotado, setSondeoAgotado] = useState(false);
    useEffect(() => {
        if (sondeoAgotado) return;
        let vivo = true;
        let temporizador: ReturnType<typeof setTimeout> | null = null;
        let espera = ESPERA_INICIAL_MS;
        const finaliza = Date.now() + SONDEO_MAXIMO_MS;

        const programar = () => {
            if (!vivo) return;
            if (Date.now() > finaliza) { setSondeoAgotado(true); return; }
            temporizador = setTimeout(sondear, espera);
        };

        const sondear = async () => {
            if (!vivo) return;
            // Pestaña de fondo: no se pregunta, sólo se reintenta más tarde.
            if (document.hidden) { programar(); return; }
            const ok = await reloadUser();
            if (!vivo) return;
            if (ok) { navigate(destino, { replace: true }); return; }
            espera = Math.min(Math.round(espera * 1.5), ESPERA_MAXIMA_MS);
            programar();
        };

        // Volver a la pestaña es la mejor pista de que se acaba de pulsar el
        // enlace del correo: se comprueba en el acto y se reinicia la espera.
        const alVolver = () => {
            if (document.hidden || !vivo) return;
            if (temporizador !== null) clearTimeout(temporizador);
            espera = ESPERA_INICIAL_MS;
            void sondear();
        };
        document.addEventListener('visibilitychange', alVolver);

        programar();
        return () => {
            vivo = false;
            if (temporizador !== null) clearTimeout(temporizador);
            document.removeEventListener('visibilitychange', alVolver);
        };
    }, [reloadUser, navigate, destino, sondeoAgotado]);

    const handleResend = async () => {
        setError(null);
        try {
            await resendVerification();
            setResent(true);
            setCooldown(60);
        } catch (e: unknown) {
            setError(esCodigoDeFirebase(e, "auth/too-many-requests")
                ? "Demasiados intentos. Espera unos minutos."
                : "No se pudo reenviar. Inténtalo de nuevo.");
        }
    };

    const handleCheck = async () => {
        setChecking(true);
        setError(null);
        try {
            const ok = await reloadUser();
            if (ok) navigate(destino, { replace: true });
            else setError("Aún no detectamos la verificación. Revisa tu correo (y la carpeta de spam).");
        } finally {
            setChecking(false);
        }
    };

    return (
        <AuthShell title="Verifica tu correo" centered>
            <div className="text-center">
                {/* §10: glifo de línea, no emoji; §2.3: el latón es el filete. */}
                <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-sm border border-brass-600 bg-accent/12 text-accent sm:mb-6 sm:h-14 sm:w-14">
                    <MailCheck className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden="true" />
                </div>

                {/* El correo del usuario puede ser larguísimo y no lleva espacios:
                    a 320px desbordaba la tarjeta. `break-words` lo parte. */}
                <p className="mb-6 text-sm leading-relaxed break-words text-content-muted sm:mb-8 sm:text-base">
                    Te hemos enviado un enlace de verificación a{" "}
                    <strong className="text-content-strong">{user?.email}</strong>. Ábrelo para
                    activar tu cuenta y recibir tus{" "}
                    <strong className="text-content-strong">30 créditos</strong> gratuitos.
                </p>

                {resent && <AuthNotice>Correo reenviado.</AuthNotice>}
                {error && <AuthAlert>{error}</AuthAlert>}

                {/* A 390px las dos acciones van apiladas y a ancho completo; a
                    partir de `sm` comparten fila, porque son alternativas del
                    mismo momento («ya lo hice» / «mándamelo otra vez») y verlas
                    juntas es lo que deja claro que son una elección. */}
                <div className="space-y-3 sm:flex sm:gap-3 sm:space-y-0">
                    <Button
                        variant="primary"
                        className="w-full sm:flex-1"
                        onClick={handleCheck}
                        loading={checking}
                        loadingLabel="Comprobando…"
                    >
                        <RefreshCw className="h-4 w-4" aria-hidden="true" />
                        Ya he verificado
                    </Button>
                    <Button
                        variant="secondary"
                        className="w-full sm:flex-1"
                        onClick={handleResend}
                        disabled={cooldown > 0}
                    >
                        {cooldown > 0 ? `Reenviar en ${cooldown} s` : "Reenviar correo"}
                    </Button>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3 w-full sm:mt-4"
                    onClick={() => { signOut(); navigate("/login", { replace: true }); }}
                >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    Cerrar sesión
                </Button>
            </div>
        </AuthShell>
    );
}
