import { useRef, useState, useEffect } from "react";
import { User, Shield, Bell, ArrowLeft, LogOut, Save, Camera, Loader2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useUserAvatar, saveUserAvatar } from "@/hooks/useUserAvatar";
import { profileService } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import { TextField } from "@/components/ui/Field";
import { AvatarImage } from "@/components/ui/AvatarImage";

export function ProfilePage() {
    const avatarUrl = useUserAvatar();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const navigate = useNavigate();
    const { user: firebaseUser, signOut } = useAuth();

    const [displayName, setDisplayName] = useState("");
    const [userEmail, setUserEmail] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");

    useEffect(() => {
        profileService.getProfile()
            .then((profile) => {
                setDisplayName(profile.display_name || "");
                setUserEmail(profile.email || "");
            })
            .catch(() => {
                // Fallback a Firebase Auth si el backend falla
                if (firebaseUser) {
                    setDisplayName(firebaseUser.displayName || "");
                    setUserEmail(firebaseUser.email || "");
                }
            });
    }, [firebaseUser]);

    const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = reader.result as string;
                saveUserAvatar(base64);
            };
            reader.readAsDataURL(file);
        }
    };

    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };

    const handleSave = async () => {
        if (isSaving) return;
        setIsSaving(true);
        setSaveStatus("idle");
        try {
            await profileService.updateProfile({ display_name: displayName });
            setSaveStatus("success");
            setTimeout(() => setSaveStatus("idle"), 2500);
        } catch {
            setSaveStatus("error");
            setTimeout(() => setSaveStatus("idle"), 2500);
        } finally {
            setIsSaving(false);
        }
    };

    const handleLogout = async () => {
        if (isLoggingOut) return;
        setIsLoggingOut(true);
        try {
            await signOut();
            navigate("/login");
        } catch {
            setIsLoggingOut(false);
        }
    };

    const avatarInitial = displayName.trim().charAt(0).toUpperCase() || "?";

    return (
        <div className="flex flex-col h-full bg-midnight/40 relative overflow-hidden">
            {/* Background Living Effect */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div
                    className="aurora-blob w-[70%] h-[70%] top-[-20%] right-[-10%]"
                    style={{ backgroundColor: 'rgba(30, 58, 95, 0.4)' }}
                />
                <div
                    className="aurora-blob w-[50%] h-[50%] bottom-[-10%] left-[-5%]"
                    style={{ backgroundColor: 'rgba(13, 74, 74, 0.35)', animationDelay: '-10s' }}
                />
            </div>

            {/* Header */}
            <div className="h-14 sm:h-16 pl-14 lg:pl-6 pr-3 sm:pr-6 border-b border-surface flex items-center justify-between bg-midnight/90 backdrop-blur-md sticky top-0 z-10">
                <div className="flex items-center gap-3 sm:gap-4">
                    <Link to="/" className="p-2 hover:bg-surface rounded-full transition-colors text-content-muted hover:text-content-strong">
                        <ArrowLeft className="h-5 w-5" />
                    </Link>
                    <h1 className="text-base sm:text-xl font-bold text-content-strong">Mi Perfil</h1>
                </div>
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all font-medium text-sm ${
                        saveStatus === "success"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : saveStatus === "error"
                            ? "bg-red-500/10 text-red-400"
                            : "bg-electric-cyan/10 text-electric-cyan hover:bg-electric-cyan hover:text-midnight"
                    } disabled:opacity-60`}
                >
                    {isSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Save className="h-4 w-4" />
                    )}
                    <span className="hidden sm:inline">
                        {saveStatus === "success" ? "Guardado" : saveStatus === "error" ? "Error" : "Guardar"}
                    </span>
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-6 md:p-8 scrollbar-thin scrollbar-thumb-surface-highlight">
                <div className="max-w-3xl mx-auto space-y-6 sm:space-y-8">

                    {/* Hero Profile Section */}
                    <section className="flex flex-col items-center gap-4 sm:gap-6 p-4 sm:p-6 md:p-8 rounded-2xl sm:rounded-3xl bg-surface/60 border border-surface-highlight backdrop-blur-sm relative overflow-hidden text-center">
                        {/* Avatar with Upload */}
                        <div className="relative group">
                            <input
                                id="profile-avatar-file"
                                aria-label="Subir imagen de avatar"
                                type="file"
                                ref={fileInputRef}
                                onChange={handleAvatarChange}
                                accept="image/*"
                                className="sr-only"
                            />
                            {/* D14/§12.4: mismo defecto que en la configuración de
                                la sesión — `<div onClick>` más un botón gemelo.
                                El avatar entero pasa a ser el <button> y la
                                chapa de la cámara queda como decoración. */}
                            <button
                                type="button"
                                onClick={triggerFileInput}
                                aria-label="Cambiar tu imagen de perfil"
                                className="h-24 w-24 sm:h-28 sm:w-28 md:h-32 md:w-32 rounded-sm border border-agent-user/40 bg-agent-user/12 flex items-center justify-center text-agent-user font-semibold text-2xl sm:text-3xl md:text-4xl shadow-e2 cursor-pointer overflow-hidden"
                            >
                                <AvatarImage
                                    src={avatarUrl}
                                    className="h-full w-full object-cover"
                                    fallback={avatarInitial}
                                />
                            </button>
                            <span
                                aria-hidden="true"
                                className="pointer-events-none absolute -bottom-2 -right-2 p-1.5 sm:p-2 bg-surface border border-surface-highlight rounded-xl text-electric-cyan shadow-lg"
                            >
                                <Camera className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            </span>
                        </div>

                        <div className="space-y-1.5 sm:space-y-2">
                            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-content-strong">{displayName || "—"}</h2>
                            <p className="text-content-muted font-mono text-micro sm:text-xs md:text-sm uppercase">{userEmail}</p>
                            <div className="flex gap-2 justify-center pt-1 sm:pt-2 flex-wrap">
                                <span className="px-2.5 sm:px-3 py-0.5 sm:py-1 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-full text-micro sm:text-xs">Online</span>
                            </div>
                        </div>
                    </section>

                    {/* Settings Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">

                        {/* Account Settings */}
                        <div className="p-6 rounded-2xl bg-surface/30 border border-surface-highlight hover:border-electric-cyan/30 transition-colors space-y-4">
                            <div className="flex items-center gap-3 text-content-strong font-semibold mb-4">
                                <User className="h-5 w-5 text-electric-cyan" />
                                <h3>Información Personal</h3>
                            </div>
                            <div className="space-y-4">
                                <TextField
                                    label="Nombre público"
                                    id="profile-display-name"
                                    value={displayName}
                                    onChange={(e) => setDisplayName(e.target.value)}
                                />
                                {/* §9.2 readonly: NO `disabled` ni `opacity-60`
                                    (que daba ~2.5:1). El campo cambia de token,
                                    sigue enfocable y anuncia su candado. */}
                                <TextField
                                    label="Correo de acceso"
                                    id="profile-email"
                                    type="email"
                                    value={userEmail}
                                    readOnly
                                    hint="El correo de acceso no se puede cambiar aquí."
                                />
                            </div>
                        </div>

                        {/* Security */}
                        <div className="p-6 rounded-2xl bg-surface/30 border border-surface-highlight hover:border-luxury-purple/30 transition-colors space-y-4">
                            <div className="flex items-center gap-3 text-content-strong font-semibold mb-4">
                                <Shield className="h-5 w-5 text-luxury-purple" />
                                <h3>Seguridad</h3>
                            </div>
                            <div className="space-y-3">
                                <Link
                                    to="/settings/profile"
                                    className="w-full flex items-center justify-between p-3 bg-midnight/50 rounded-xl hover:bg-surface-highlight transition-colors group"
                                >
                                    <span className="text-sm">Configuración avanzada</span>
                                    <ArrowLeft className="h-4 w-4 rotate-180 text-content-muted group-hover:translate-x-1 transition-transform" />
                                </Link>
                            </div>
                        </div>

                        {/* Notifications */}
                        <div className="p-6 rounded-2xl bg-surface/30 border border-surface-highlight space-y-4">
                            <div className="flex items-center gap-3 text-content-strong font-semibold mb-4">
                                <Bell className="h-5 w-5 text-amber-500" />
                                <h3>Preferencias de Sistema</h3>
                            </div>
                            <p className="text-xs text-content-muted">
                                Configura notificaciones, tema e idioma en{" "}
                                <Link to="/settings/profile" className="text-electric-cyan hover:underline">
                                    Ajustes → Perfil
                                </Link>.
                            </p>
                        </div>

                        {/* Logout */}
                        <div className="p-6 rounded-2xl bg-red-500/5 border border-red-500/20 space-y-4">
                            <div className="flex items-center gap-3 text-red-500 font-semibold mb-4">
                                <LogOut className="h-5 w-5" />
                                <h3>Cerrar Sesión</h3>
                            </div>
                            <p className="text-xs text-content-muted">Desconectar de SPHERE y limpiar caché de sesión local.</p>
                            <button
                                onClick={handleLogout}
                                disabled={isLoggingOut}
                                className="w-full py-2 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl hover:bg-red-500 hover:text-white transition-all text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2"
                            >
                                {isLoggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                {isLoggingOut ? "Cerrando sesión..." : "Cerrar Sesión"}
                            </button>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
}
