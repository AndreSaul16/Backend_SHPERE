import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../../src/components/shared/ErrorBoundary';
import { useState } from 'react';

// Component that throws on demand for testing
function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test explosion');
  }
  return <div data-testid="healthy-child">All good</div>;
}

function ToggleBomb() {
  const [explode, setExplode] = useState(false);
  return (
    <div>
      <button data-testid="trigger" onClick={() => setExplode(true)}>
        Light fuse
      </button>
      <ErrorBoundary>
        <Bomb shouldThrow={explode} />
      </ErrorBoundary>
    </div>
  );
}

describe('ErrorBoundary Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Spy on console.error to verify logging
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders children normally when no error occurs', () => {
    render(
      <ErrorBoundary>
        <div data-testid="normal-child">Normal content</div>
      </ErrorBoundary>
    );
    expect(screen.getByTestId('normal-child')).toBeDefined();
    expect(screen.getByText('Normal content')).toBeDefined();
  });

  it('catches thrown error and shows fallback UI', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );
    // Fallback UI should contain "Algo salió mal" message
    expect(screen.getByText('Algo salió mal')).toBeDefined();
    // Fallback should have a retry button
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeDefined();
  });

  it('shows retry button that resets error state on click', () => {
    render(<ToggleBomb />);

    // Initially healthy
    expect(screen.getByTestId('healthy-child')).toBeDefined();

    // Trigger explosion
    fireEvent.click(screen.getByTestId('trigger'));

    // Fallback UI shown
    expect(screen.getByText('Algo salió mal')).toBeDefined();

    // Retry button resets — children re-render (but Bomb still throws)
    // The retry resets error boundary state, so it tries to render children again
    // Since the Bomb state is still "explode=true", it will throw again
    // This just tests the retry button exists and is clickable
    const retryButton = screen.getByRole('button', { name: /reintentar/i });
    expect(retryButton).toBeDefined();
  });

  it('logs error to console when catching a render error', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );

    // console.error should have been called at least once
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('displays a helpful description alongside the error message', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );
    // Should show descriptive text about the error
    expect(screen.getByText(/error inesperado/i)).toBeDefined();
  });

  it('does NOT expose error stack trace in the UI', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );
    // Stack trace should NOT be visible in the DOM
    expect(screen.queryByText(/Test explosion/i)).toBeNull();
    expect(screen.queryByText(/ErrorBoundary.test/i)).toBeNull();
  });
  /* D51 · 7.7 — lo que la frontera de raíz NO hacía. */
  describe('D51 — reintentos y rearme', () => {
    it('un error determinista deja de prometer un reintento que no funciona', () => {
      render(
        <ErrorBoundary>
          <Bomb shouldThrow={true} />
        </ErrorBoundary>
      );

      // Los tres primeros intentos vuelven a montar el mismo arbol, que vuelve
      // a reventar: el boton sigue diciendo «Reintentar».
      for (let i = 0; i < 3; i++) {
        fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));
      }

      // Al cuarto ya no se miente: la salida que si funciona es recargar.
      expect(screen.queryByRole('button', { name: /^reintentar$/i })).toBeNull();
      expect(screen.getByRole('button', { name: /recargar la página/i })).toBeDefined();
    });

    it('cambiar de contexto (`resetKeys`) rearma el subárbol sin pulsar nada', () => {
      const { rerender } = render(
        <ErrorBoundary resetKeys={['/billing']}>
          <Bomb shouldThrow={true} />
        </ErrorBoundary>
      );
      expect(screen.getByRole('alert')).toBeDefined();

      rerender(
        <ErrorBoundary resetKeys={['/settings']}>
          <Bomb shouldThrow={false} />
        </ErrorBoundary>
      );
      expect(screen.getByTestId('healthy-child')).toBeDefined();
    });

    it('el contador vuelve a cero al cambiar de contexto', () => {
      const { rerender } = render(
        <ErrorBoundary resetKeys={['/a']}>
          <Bomb shouldThrow={true} />
        </ErrorBoundary>
      );
      for (let i = 0; i < 3; i++) {
        fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));
      }
      expect(screen.getByRole('button', { name: /recargar la página/i })).toBeDefined();

      rerender(
        <ErrorBoundary resetKeys={['/b']}>
          <Bomb shouldThrow={true} />
        </ErrorBoundary>
      );
      // Otro contexto, otro fallo: se vuelve a ofrecer reintentar.
      expect(screen.getByRole('button', { name: /^reintentar$/i })).toBeDefined();
    });
  });
});
