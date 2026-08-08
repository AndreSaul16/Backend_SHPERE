/**
 * Una frontera de error POR REGIÓN.
 *
 * Hasta ahora sólo había `<ErrorBoundary>` en la raíz y otro alrededor del
 * chat. Consecuencia: si reventaba el panel de artefactos —un mermaid mal
 * formado, una tabla con una fila rara— desaparecía la pantalla entera, junta
 * incluida, y el usuario perdía de vista el debate por culpa de un diagrama.
 *
 * Esto aísla la región: lo que se cae es la región, y la región dice qué se ha
 * caído, qué sigue funcionando y ofrece volver a montarse ella sola. Tres
 * reglas que la hacen distinta de la frontera de raíz:
 *
 *   1. **Se reinicia sola cuando cambia el contexto** (`resetKeys`): al cambiar
 *      de artefacto o de sesión la región vuelve a intentarlo sin que nadie
 *      pulse nada. Un panel que se queda roto para siempre porque un artefacto
 *      concreto falló es un callejón sin salida disfrazado.
 *   2. **Cuenta los reintentos.** Un error determinista reventaría en bucle:
 *      pulsar «Reintentar» → renderiza → revienta → «Reintentar». A partir del
 *      tercer intento deja de prometer lo que no puede cumplir y ofrece la
 *      salida que sí funciona: recargar la página.
 *   3. **Nunca enseña la pila.** El motivo técnico no es accionable para quien
 *      mira, y §11 lo prohíbe en el título. Va al registro, no a la pantalla.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { buttonClass } from '@/components/ui/buttonStyles';

const MAX_REINTENTOS = 3;

interface Props {
    children: ReactNode;
    /** Cómo se llama esto para el usuario: «el panel de artefactos». */
    region: string;
    /** Qué sigue en pie mientras esta región está caída. */
    reassurance?: string;
    /** Al cambiar cualquiera de estos valores, la región se vuelve a montar. */
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

export class RegionBoundary extends Component<Props, State> {
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
        // Cambió el contexto: la región se vuelve a intentar, y el contador de
        // reintentos se pone a cero porque ya no es el mismo fallo.
        return { error: null, intentos: 0, llaves };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        console.error(`[${this.props.region}] no se ha podido pintar:`, error);
        if (import.meta.env.DEV) console.error(info.componentStack);
    }

    reintentar = (): void => {
        this.setState((s) => ({ error: null, intentos: s.intentos + 1 }));
    };

    render(): ReactNode {
        const { error, intentos } = this.state;
        if (!error) return this.props.children;

        const agotado = intentos >= MAX_REINTENTOS;

        return (
            <div
                role="alert"
                data-testid="region-caida"
                className="flex h-full min-h-[180px] w-full flex-col items-center justify-center gap-4 p-6 text-center"
            >
                <div className="space-y-1.5">
                    <h2 className="text-base font-semibold text-content-strong">
                        {`No se ha podido mostrar ${this.props.region}`}
                    </h2>
                    <p className="mx-auto max-w-xs text-xs leading-relaxed text-content-muted">
                        {agotado
                            ? 'Ya lo hemos intentado varias veces y sigue fallando. Recarga la página; no se pierde nada de lo que hay en la conversación.'
                            : (this.props.reassurance ?? 'El resto de la pantalla sigue funcionando y no se ha perdido nada.')}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={agotado ? () => window.location.reload() : this.reintentar}
                    className={buttonClass({ variant: 'secondary' })}
                >
                    {agotado ? 'Recargar la página' : 'Volver a intentarlo'}
                </button>
            </div>
        );
    }
}
