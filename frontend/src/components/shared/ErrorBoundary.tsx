/**
 * La frontera de error de la RAÍZ (D51).
 *
 * Su hermana `RegionBoundary` aísla una región concreta —el panel de
 * artefactos, el transcript— y ya nació con `resetKeys` y contador. Ésta cubre
 * lo que queda: el árbol entero desde `main.tsx` y el hueco de la ruta en
 * `MainLayout`. Le faltaban las dos cosas:
 *
 *   1. **Contador de reintentos.** `handleRetry` volvía a montar exactamente
 *      el mismo árbol que acababa de reventar. Con un error determinista
 *      —que son casi todos los de renderizado: un `undefined.map`, un
 *      artefacto con una forma que el visor no espera— el botón «Reintentar»
 *      no era un reintento, era un botón que no hacía nada visible y que se
 *      podía pulsar indefinidamente. A partir del tercero deja de prometerlo y
 *      ofrece la salida que sí funciona.
 *   2. **`resetKeys`.** Cambiar de ruta tiene que devolver la pantalla a la
 *      vida sin que nadie pulse nada: el fallo era de la ruta anterior. Sin
 *      esto, un error en `/billing` dejaba el hueco de la ruta roto también
 *      para `/settings`, y la única salida era recargar.
 */
import { Component, type ReactNode, type ErrorInfo } from "react";
import { buttonClass } from "@/components/ui/buttonStyles";

/** Tras estos intentos, «Reintentar» pasa a ser «Recargar la página». */
const MAX_REINTENTOS = 3;

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /** Al cambiar cualquiera de estos valores, el subárbol se vuelve a montar. */
  resetKeys?: readonly unknown[];
}

interface State {
  error: Error | null;
  intentos: number;
  /** Copia de `resetKeys` con la que se pintó el último fallo. */
  llaves: readonly unknown[];
}

function mismasLlaves(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null, intentos: 0, llaves: props.resetKeys ?? [] };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    const llaves = props.resetKeys ?? [];
    if (mismasLlaves(llaves, state.llaves)) return null;
    // Cambió el contexto: ya no es el mismo fallo, así que el contador vuelve
    // a cero y el subárbol se vuelve a intentar solo.
    return { error: null, intentos: 0, llaves };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // El motivo técnico va al registro, nunca a la pantalla (§11).
    console.error("ErrorBoundary caught an error:", error);
    if (import.meta.env.DEV) console.error("Component stack:", info.componentStack);
  }

  handleRetry = (): void => {
    this.setState((s) => ({ error: null, intentos: s.intentos + 1 }));
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    // Un fallback propio manda: quien lo pasa sabe qué quiere enseñar.
    if (this.props.fallback) return this.props.fallback;

    const agotado = this.state.intentos >= MAX_REINTENTOS;

    return (
      <div
        role="alert"
        className="flex flex-col items-center justify-center min-h-[300px] p-8 text-center"
      >
        <div className="mb-6 h-12 w-12 rounded-sm bg-oxblood-500/12 border border-oxblood-500 flex items-center justify-center">
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
        <h2 className="text-xl font-semibold text-content-strong mb-2">
          Algo salió mal
        </h2>
        {/* §11: español peninsular. Aquí convivían el voseo («intentá»,
            «recargá») y el tuteo del resto de la app. */}
        <p className="text-sm text-content-muted max-w-md mb-6 leading-relaxed">
          {agotado
            ? "Ya lo hemos intentado varias veces y sigue fallando. Recarga la página: tus conversaciones están guardadas y no se pierde nada."
            : "Ha ocurrido un error inesperado. Vuelve a intentarlo. Si el problema persiste, recarga la página."}
        </p>
        <button
          type="button"
          onClick={agotado ? () => window.location.reload() : this.handleRetry}
          className={buttonClass({ variant: "primary" })}
        >
          {agotado ? "Recargar la página" : "Reintentar"}
        </button>
      </div>
    );
  }
}
