/**
 * AuthContext: gestiona el estado de autenticación con Firebase.
 * Proporciona user, idToken, signIn, signUp, signOut.
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  verifyPasswordResetCode,
  confirmPasswordReset,
  type User as FirebaseUser,
} from "firebase/auth";
import { auth, googleProvider, githubProvider, microsoftProvider } from "@/lib/firebase";
import { initAnalytics, identify, capture, resetAnalytics, ANALYTICS_EVENTS } from "@/lib/analytics";
import { toast } from "@/lib/toastBus";

interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  providerId: string; // 'password' | 'google.com' | 'github.com'
}

interface AuthContextType {
  user: AuthUser | null;
  idToken: string | null;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithGithub: () => Promise<void>;
  signInWithMicrosoft: () => Promise<void>;
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

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Analytics (F6): init idempotente; no-op si no hay VITE_POSTHOG_KEY.
    initAnalytics();
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
          emailVerified: firebaseUser.emailVerified,
          providerId: firebaseUser.providerData[0]?.providerId || 'password',
        });
        // Analytics: asociar los eventos al uid de Firebase.
        identify(firebaseUser.uid);
        const token = await firebaseUser.getIdToken();
        setIdToken(token);
      } else {
        setUser(null);
        setIdToken(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Refrescar token cada 55 minutos (los tokens de Firebase expiran en 60 min)
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(async () => {
      const currentUser = auth.currentUser;
      if (currentUser) {
        const newToken = await currentUser.getIdToken(true);
        setIdToken(newToken);
      }
    }, 55 * 60 * 1000);

    return () => clearInterval(interval);
  }, [user]);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    // Enviar email de verificación: el backend no otorga créditos ni deja usar
    // /stream hasta que el email esté verificado.
    try {
      await sendEmailVerification(cred.user);
    } catch {
      // La cuenta SÍ se ha creado; lo que ha fallado es el correo. Sin él, el
      // backend no da créditos ni deja usar /stream, así que quien se acaba de
      // registrar se queda mirando una app que no responde sin saber por qué.
      //
      // `warning` y no `error`: no se ha perdido nada y hay salida (reenviar).
      // El motivo técnico de Firebase no se enseña: no es accionable.
      toast.warning(
        'Tu cuenta está creada, pero no ha salido el correo de verificación',
        'Pídelo de nuevo desde la pantalla de verificación para activar tus créditos.',
      );
    }
    capture(ANALYTICS_EVENTS.SIGNUP_COMPLETED, { method: "password" });
  }, []);

  const resendVerification = useCallback(async () => {
    if (auth.currentUser) await sendEmailVerification(auth.currentUser);
  }, []);

  const reloadUser = useCallback(async (): Promise<boolean> => {
    const cur = auth.currentUser;
    if (!cur) return false;
    await cur.reload();
    // Forzar refresco del token para que el backend reciba el claim email_verified=true.
    const token = await cur.getIdToken(true);
    setIdToken(token);
    setUser({
      uid: cur.uid,
      email: cur.email,
      displayName: cur.displayName,
      photoURL: cur.photoURL,
      emailVerified: cur.emailVerified,
      providerId: cur.providerData[0]?.providerId || 'password',
    });
    return cur.emailVerified;
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  }, []);

  const verifyPasswordReset = useCallback(async (code: string) => {
    return await verifyPasswordResetCode(auth, code);
  }, []);

  const confirmPasswordResetWithCode = useCallback(
    async (code: string, newPassword: string) => {
      await confirmPasswordReset(auth, code, newPassword);
    },
    [],
  );

  const signInWithGoogle = useCallback(async () => {
    await signInWithPopup(auth, googleProvider);
  }, []);

  const signInWithGithub = useCallback(async () => {
    await signInWithPopup(auth, githubProvider);
  }, []);

  const signInWithMicrosoft = useCallback(async () => {
    await signInWithPopup(auth, microsoftProvider);
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
    setUser(null);
    setIdToken(null);
    resetAnalytics();
    // Limpiar estado del usuario para no filtrar datos a la siguiente cuenta (A6).
    const { clearUserStores } = await import("@/lib/clearStores");
    clearUserStores();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        idToken,
        loading,
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        signInWithGithub,
        signInWithMicrosoft,
        signOut,
        resendVerification,
        reloadUser,
        sendPasswordReset,
        verifyPasswordReset,
        confirmPasswordResetWithCode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
