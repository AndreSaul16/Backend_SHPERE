/**
 * Estados que se apagan solos, sin dejar el temporizador vivo (D49).
 *
 * El patrón «pinta el ✓ y quítalo a los dos segundos» estaba escrito a mano
 * en ocho sitios, siempre igual y siempre igual de mal:
 *
 *     setCopied(true);
 *     setTimeout(() => setCopied(false), 2000);
 *
 * Sin `clearTimeout`. Si el componente se desmonta antes —cerrar el panel de
 * artefactos, cambiar de conversación, navegar— React avisa de un `setState`
 * sobre un árbol desmontado, y si se pulsa dos veces seguidas el primer
 * temporizador apaga el segundo antes de tiempo. Ninguna de las dos cosas
 * rompe nada visible, que es exactamente por lo que llevaba ahí desde el
 * principio.
 *
 * Aquí el temporizador es uno solo por hook, se reinicia en cada marca y se
 * limpia al desmontar.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Un valor que vuelve a `reposo` pasados `ms` milisegundos.
 *
 * @example
 *   const [copiado, marcarCopiado] = useEstadoEfimero(false, 2000);
 *   ...
 *   marcarCopiado(true);
 */
export function useEstadoEfimero<T>(reposo: T, ms: number): [T, (valor: T) => void] {
    const [valor, setValor] = useState<T>(reposo);
    const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

    const limpiar = useCallback(() => {
        if (temporizador.current !== null) {
            clearTimeout(temporizador.current);
            temporizador.current = null;
        }
    }, []);

    /* `reposo` entra como dependencia en vez de por una `ref` escrita durante
       el render: escribir una `ref` mientras se renderiza rompe la
       memoización de React (`react-hooks/refs`). Todos los usos pasan un
       valor de reposo constante (`false`, `null`, `'idle'`), así que `marcar`
       no se recrea nunca en la práctica. */
    const marcar = useCallback((nuevo: T) => {
        limpiar();
        setValor(nuevo);
        temporizador.current = setTimeout(() => {
            temporizador.current = null;
            setValor(reposo);
        }, ms);
    }, [limpiar, ms, reposo]);

    useEffect(() => limpiar, [limpiar]);

    return [valor, marcar];
}

/**
 * Temporizadores sueltos que mueren con el componente.
 *
 * Para lo que no es «un valor que se apaga»: reintentos escalonados tras
 * volver de Stripe, una navegación con medio segundo de cortesía para que se
 * lea el aviso. Todos se cancelan al desmontar.
 */
export function useTemporizadores(): (fn: () => void, ms: number) => void {
    const vivos = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

    useEffect(() => {
        const conjunto = vivos.current;
        return () => {
            conjunto.forEach(clearTimeout);
            conjunto.clear();
        };
    }, []);

    return useCallback((fn: () => void, ms: number) => {
        const id = setTimeout(() => {
            vivos.current.delete(id);
            fn();
        }, ms);
        vivos.current.add(id);
    }, []);
}
