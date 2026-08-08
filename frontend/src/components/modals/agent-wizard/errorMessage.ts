/**
 * El texto de un fallo, sin `any` y sin cambiar lo que se ve (D41).
 *
 * Los tres `catch (err: any)` del asistente hacían `err.message ?? fallback`.
 * Esto es lo mismo, letra por letra —incluida la parte fea: un objeto suelto
 * con `.message` también sirve, y un `throw null` sigue reventando aquí igual
 * que reventaba antes—, pero sin pedirle a TypeScript que mire para otro lado.
 */
export function errorMessage(error: unknown, fallback: string): string {
    return (error as { message?: string }).message ?? fallback;
}
