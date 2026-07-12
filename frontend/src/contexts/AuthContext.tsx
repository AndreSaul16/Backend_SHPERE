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
  type User as FirebaseUser,
} from "firebase/auth";
import { auth, googleProvider, githubProvider, microsoftProvider } from "@/lib/firebase";
import { initAnalytics, identify, capture, resetAnalytics, ANALYTICS_EVENTS } from "@/lib/analytics";

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
    } catch (e) {
      if (import.meta.env.DEV) console.error("sendEmailVerification falló:", e);
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
