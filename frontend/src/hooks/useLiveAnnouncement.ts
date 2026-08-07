import { useEffect, useRef, useState } from 'react';

/**
 * Anuncio para una región viva, con caudal limitado (DESIGN §12.6).
 *
 * §12.6 exige que «todo lo que cambia sin interacción se anuncie: el turno en
 * streaming (`aria-live="polite"` con *throttle* de 1s sobre un RESUMEN, no
 * token a token), el saldo de créditos, los toasts, el resultado de guardar, el
 * recuento de votos». Hoy la app tiene 0 `aria-live`.
 *
 * El throttle no es una optimización, es la diferencia entre que se anuncie y
 * que no: un `aria-live` que cambia con cada token del SSE reinicia la locución
 * del lector de pantalla decenas de veces por segundo y el resultado es que no
 * se oye nada, o peor, un tartamudeo continuo.
 *
 * Por qué un intervalo y no un `setTimeout` por cambio: con `setTimeout` cada
 * token cancelaría el temporizador anterior (borde de salida), así que durante
 * un streaming rápido NO se anunciaría nunca hasta que el turno parase. Con un
 * intervalo se publica el último resumen conocido a cadencia fija, que es lo
 * que §12.6 describe.
 *
 * Ningún `setState` cae en el cuerpo de un efecto: todos ocurren dentro de un
 * temporizador. Con `Object.is` igual, React descarta el re-render, así que el
 * intervalo en reposo no cuesta nada.
 *
 * @param message  Resumen a anunciar. Cambia tan a menudo como haga falta.
 * @param active   Mientras sea `true` se publica a cadencia de `intervalMs`.
 *                 Al pasar a `false` se hace una última publicación inmediata,
 *                 para que el final del turno («ha terminado») no se pierda.
 */
export function useLiveAnnouncement(
    message: string,
    active: boolean,
    intervalMs = 1000,
): string {
    const [announced, setAnnounced] = useState('');
    const latest = useRef(message);

    // El ref se sincroniza en un efecto, no durante el render: escribir un ref
    // en render es justo lo que el compilador de React marca como impuro.
    useEffect(() => {
        latest.current = message;
    }, [message]);

    useEffect(() => {
        if (!active) {
            // Descarga final: el último resumen sí se anuncia entero.
            const flush = setTimeout(() => setAnnounced(latest.current), 0);
            return () => clearTimeout(flush);
        }
        const id = setInterval(() => setAnnounced(latest.current), intervalMs);
        return () => clearInterval(id);
    }, [active, intervalMs]);

    return announced;
}
