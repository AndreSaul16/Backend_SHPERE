# error-handling

> **Source**: production-readiness (archived 2026-08-14)
> **TDD**: ACTIVE (vitest)
> **Promoción retroactiva (2026-08-14)**: estos requisitos se implementaron y sus tareas
> se cerraron al 100 % en su ciclo, pero nunca se promovieron a las specs principales.
> Se promueven ahora tal y como se escribieron, sin reescribirlos.

## Purpose

Guarantee that an unhandled render error degrades into a readable, recoverable UI rather
than a blank white screen.

## Requirements

| ID | Requirement | N |
|----|------------|---|
| EH-001 | The component tree SHALL be wrapped in a React ErrorBoundary with a graceful fallback | 3 |

### EH-001: ErrorBoundary

The application SHALL wrap the component tree in a React ErrorBoundary that displays a
graceful error UI instead of a blank white screen.

- GIVEN a component throws an unhandled error during render
  WHEN React renders the component tree
  THEN the ErrorBoundary catches the error
  AND the fallback UI is displayed

- GIVEN the ErrorBoundary has caught an error
  WHEN the fallback renders
  THEN the message "Algo salió mal" is displayed with a retry button

- GIVEN the ErrorBoundary has caught a render error
  WHEN the fallback renders
  THEN the error details are logged to the console (sanitized in production)
