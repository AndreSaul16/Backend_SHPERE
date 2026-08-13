/**
 * Comprobación de la configuración de Firebase, aparte del SDK a propósito:
 * este módulo no importa `firebase/*`, así que se puede probar sin arrancar
 * nada y sin que la propia comprobación necesite las variables que comprueba.
 */

/** Clave del config → nombre de la variable de entorno que la alimenta. */
export const FIREBASE_ENV_VARS = {
    apiKey: 'VITE_FIREBASE_API_KEY',
    authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
    projectId: 'VITE_FIREBASE_PROJECT_ID',
    storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
    messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
    appId: 'VITE_FIREBASE_APP_ID',
} as const;

/**
 * Las variables que faltan, en el orden en que están declaradas. Una cadena
 * vacía o de sólo espacios cuenta como ausente: es el caso típico de un
 * `VITE_FIREBASE_API_KEY=` olvidado en el panel del despliegue, y con él
 * `initializeApp` reventaba igual pero diciendo `auth/invalid-api-key`.
 */
export function missingFirebaseConfig(config: Record<string, unknown>): string[] {
    return (Object.keys(FIREBASE_ENV_VARS) as (keyof typeof FIREBASE_ENV_VARS)[])
        .filter((key) => {
            const value = config[key];
            return typeof value !== 'string' || value.trim() === '';
        })
        .map((key) => FIREBASE_ENV_VARS[key]);
}

/** El mensaje que verá quien despliegue, con los nombres exactos que faltan. */
export function firebaseConfigError(config: Record<string, unknown>): string | null {
    const missing = missingFirebaseConfig(config);
    if (missing.length === 0) return null;
    return `Falta la configuración de Firebase. Variables de entorno sin definir: ${missing.join(', ')}.`;
}
