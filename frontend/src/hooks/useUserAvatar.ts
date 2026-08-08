import { useState, useEffect } from 'react';

const USER_AVATAR_STORAGE_KEY = 'sphere_user_avatar';

/**
 * Hook to get and subscribe to user avatar from localStorage.
 * Returns the base64 image URL or null if not set.
 */
export function useUserAvatar() {
    const [avatar, setAvatar] = useState<string | null>(null);

    useEffect(() => {
        const loadAvatar = () => {
            const saved = localStorage.getItem(USER_AVATAR_STORAGE_KEY);
            setAvatar(saved);
        };

        // Load initial
        loadAvatar();

        // Listen for storage changes (cross-tab)
        const handleStorage = (e: StorageEvent) => {
            if (e.key === USER_AVATAR_STORAGE_KEY) {
                loadAvatar();
            }
        };

        // Listen for same-tab custom event
        const handleAvatarUpdate = () => loadAvatar();

        window.addEventListener('storage', handleStorage);
        window.addEventListener('user-avatar-updated', handleAvatarUpdate);

        return () => {
            window.removeEventListener('storage', handleStorage);
            window.removeEventListener('user-avatar-updated', handleAvatarUpdate);
        };
    }, []);

    return avatar;
}

/**
 * Guarda el avatar y avisa a quien lo pinte.
 *
 * D56 — `localStorage.setItem` iba a pelo. Cuando la cadena no cabía (el cupo
 * son 5 MB en todos los navegadores) lanzaba `QuotaExceededError` desde el
 * manejador de un `onloadend`, o sea fuera de cualquier `try` de quien pulsó:
 * el avatar no se guardaba y no se decía nada. El encogido a 256 px hace que
 * eso ya no pase, pero el cupo también se llena por otras vías (borradores,
 * ajustes), así que aquí se devuelve si se ha podido o no.
 *
 * @returns `true` si quedó guardado.
 */
export function saveUserAvatar(base64Url: string): boolean {
    try {
        localStorage.setItem(USER_AVATAR_STORAGE_KEY, base64Url);
    } catch {
        return false;
    }
    window.dispatchEvent(new Event('user-avatar-updated'));
    return true;
}
