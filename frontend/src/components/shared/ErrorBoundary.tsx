import { Component, type ReactNode, type ErrorInfo } from "react";
import { buttonClass } from "@/components/ui/buttonStyles";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log error to console in production
    console.error("ErrorBoundary caught an error:", error);
    console.error("Component stack:", info.componentStack);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Allow custom fallback or use default
      if (this.props.fallback) {
        return this.props.fallback;
      }

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
            Ha ocurrido un error inesperado. Vuelve a intentarlo. Si el problema
            persiste, recarga la página.
          </p>
          <button
            onClick={this.handleRetry}
            className={buttonClass({ variant: "primary" })}
          >
            Reintentar
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
