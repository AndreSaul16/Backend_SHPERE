/**
 * Pantalla de fallo de arranque — la red de seguridad que no existía.
 *
 * Sin las variables `VITE_FIREBASE_*`, `lib/firebase.ts` reventaba al evaluar
 * el módulo, o sea ANTES de que React montara nada: la app entera renderizaba
 * una página en blanco absoluta (`textLen=0` en las diez superficies) sin ni un
 * mensaje. Un `<ErrorBoundary>` de React no puede cubrir eso, porque el fallo
 * ocurre en la carga del grafo de módulos, no en un render — por eso `main.tsx`
 * importa `App` de forma dinámica y captura el rechazo.
 *
 * Regla de lo que se enseña: el motivo SÍ (es de configuración del despliegue y
 * quien lo ve es quien lo despliega), la pila NO.
 */
import { buttonClass } from '@/components/ui/buttonStyles';

export function StartupError({ error }: { error: unknown }) {
    const reason = error instanceof Error ? error.message : String(error ?? '');

    return (
        <div role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-sm border border-oxblood-500 bg-oxblood-500/12">
                <svg
                    className="h-6 w-6 text-danger"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    aria-hidden="true"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                    />
                </svg>
            </div>

            <div className="space-y-2">
                <h1 className="text-xl font-semibold text-content-strong">
                    SPHERE no ha podido arrancar
                </h1>
                <p className="mx-auto max-w-md text-sm leading-relaxed text-content-muted">
                    La aplicación no se ha podido inicializar. Suele ser una variable de
                    entorno que falta o es incorrecta en el despliegue.
                </p>
            </div>

            {reason && (
                <p className="mx-auto max-w-md rounded-sm border border-stroke-edge bg-surface-2 px-3 py-2 text-xs text-content">
                    {reason}
                </p>
            )}

            <button
                type="button"
                onClick={() => window.location.reload()}
                className={buttonClass({ variant: 'primary' })}
            >
                Recargar la página
            </button>
        </div>
    );
}
