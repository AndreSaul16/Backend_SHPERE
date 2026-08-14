/**
 * El contrato de la sesión: el contexto, sus tipos y el gancho que lo lee.
 *
 * D43 · 7.4 — todo esto vivía en `AuthContext.tsx`, junto al `AuthProvider`.
 * Un `.tsx` que exporta a la vez un componente y otra cosa rompe el refresco
 * en caliente de Vite (`react-refresh/only-export-components`): al tocar el
 * proveedor, React Fast Refresh no puede saber si `useAuth` sigue siendo el
 * mismo y recarga la página entera, perdiendo el estado. El patrón que
 * funciona —y el que el resto de la casa ya usa— es lógica en `.ts`,
 * componente en `.tsx`.
 */
import { createContext, useContext } from 'react';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  providerId: string; // 'password' | 'google.com' | 'github.com'
}

/**
 * Los tres proveedores de acceso social.
 *
 * Vive aquí y no en `AuthShell` —que es quien pinta los botones— porque el
 * contexto también necesita nombrarlos: `continuarConRedireccion` recibe uno.
 * `AuthShell` lo reexporta, así que los sitios que ya lo importaban de allí
 * siguen igual.
 */
export type SocialProvider = 'google' | 'github' | 'microsoft';

export interface AuthContextType {
  user: AuthUser | null;
  idToken: string | null;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithGithub: () => Promise<void>;
  signInWithMicrosoft: () => Promise<void>;
  /**
   * El acceso social por REDIRECCIÓN, en vez de por popup (QA-4).
   *
   * Es la salida que se OFRECE cuando el popup dice
   * `auth/popup-closed-by-user` —a veces de verdad, a veces porque la COOP le
   * hizo leer `window.closed` antes de tiempo—. No se llama sola: cerrar el
   * popup a propósito es «he cambiado de idea», y llevarse la página a Google
   * sin permiso sería hostil. La pulsa el usuario.
   */
  continuarConRedireccion: (provider: SocialProvider) => Promise<void>;
  signOut: () => Promise<void>;
  resendVerification: () => Promise<void>;
  reloadUser: () => Promise<boolean>; // devuelve emailVerified tras refrescar
  /**
   * Recuperación de contraseña — tarea 5.14 (D26).
   *
   * Hasta ahora la aplicación NO tenía ninguna salida para quien olvidaba su
   * contraseña: el único camino era escribir a soporte. Son las tres piezas del
   * flujo de Firebase, y ninguna necesita que haya sesión iniciada.
   */
  sendPasswordReset: (email: string) => Promise<void>;
  /** Valida el código del enlace y devuelve el correo al que pertenece. */
  verifyPasswordReset: (code: string) => Promise<string>;
  /** Fija la contraseña nueva. El código se consume: sólo sirve una vez. */
  confirmPasswordResetWithCode: (code: string, newPassword: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
