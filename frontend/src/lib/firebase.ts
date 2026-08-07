/**
 * Firebase SDK initialization.
 * Config values from VITE_FIREBASE_* env vars.
 *
 * Este módulo se evalúa en el arranque, antes de que React pinte nada. Si
 * faltaba una variable, `initializeApp` reventaba con
 * `FirebaseError: Firebase: Error (auth/invalid-api-key)` y la app entera
 * quedaba en una página en blanco absoluta —`textLen=0` en las diez
 * superficies, ni un mensaje—. Una variable mal puesta en el despliegue y el
 * usuario no tenía forma de saber qué pasaba.
 *
 * Ahora la configuración se comprueba ANTES de inicializar y el error dice
 * exactamente qué variables faltan. Quien lo enseña es la frontera de arranque
 * de `main.tsx`, que captura el fallo de evaluación del módulo y pinta
 * `<StartupError>` en vez del vacío.
 */
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, GithubAuthProvider, OAuthProvider, browserSessionPersistence, setPersistence } from "firebase/auth";
import { firebaseConfigError } from "./firebaseConfig";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const configError = firebaseConfigError(firebaseConfig);
if (configError) throw new Error(configError);

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
setPersistence(auth, browserSessionPersistence);
export const googleProvider = new GoogleAuthProvider();
export const githubProvider = new GithubAuthProvider();
export const microsoftProvider = new OAuthProvider('microsoft.com');
export default app;
