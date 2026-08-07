import { describe, it, expect } from 'vitest';
import { firebaseConfigError, missingFirebaseConfig } from '../../src/lib/firebaseConfig';

/**
 * Sin las variables de Firebase la app entera renderizaba una página en blanco
 * absoluta: `initializeApp` reventaba al evaluar el módulo con
 * `auth/invalid-api-key` —un mensaje que no dice qué falta— y no había frontera
 * de error en la raíz. Aquí se prueba la mitad que se puede probar sin arrancar
 * el SDK: que el fallo se detecta ANTES y que dice los nombres exactos.
 */
const COMPLETA = {
    apiKey: 'AIzaKey',
    authDomain: 'demo.firebaseapp.com',
    projectId: 'demo',
    storageBucket: 'demo.appspot.com',
    messagingSenderId: '1234567890',
    appId: '1:1234:web:abcd',
};

describe('configuración de Firebase', () => {
    it('una configuración completa no da error', () => {
        expect(missingFirebaseConfig(COMPLETA)).toEqual([]);
        expect(firebaseConfigError(COMPLETA)).toBeNull();
    });

    it('nombra la variable que falta, no un código de error opaco', () => {
        const error = firebaseConfigError({ ...COMPLETA, apiKey: undefined });
        expect(error).toContain('VITE_FIREBASE_API_KEY');
        expect(error).not.toContain('invalid-api-key');
    });

    it('una variable vacía cuenta como ausente (el `VITE_...=` olvidado)', () => {
        expect(missingFirebaseConfig({ ...COMPLETA, projectId: '   ' })).toEqual([
            'VITE_FIREBASE_PROJECT_ID',
        ]);
    });

    it('las lista todas de una vez, no de una en una', () => {
        expect(missingFirebaseConfig({})).toEqual([
            'VITE_FIREBASE_API_KEY',
            'VITE_FIREBASE_AUTH_DOMAIN',
            'VITE_FIREBASE_PROJECT_ID',
            'VITE_FIREBASE_STORAGE_BUCKET',
            'VITE_FIREBASE_MESSAGING_SENDER_ID',
            'VITE_FIREBASE_APP_ID',
        ]);
    });
});
