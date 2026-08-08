/**
 * ¿Hay red? — el aviso que llega ANTES del fallo.
 *
 * Sin esto, quedarse sin cobertura en el metro se descubre pulsando «Enviar» y
 * viendo un error de red genérico veinte segundos después. Decirlo antes
 * convierte un fallo en una espera, que es la diferencia entre «esto está roto»
 * y «esto está esperándome».
 *
 * `navigator.onLine` es conservador a propósito: `false` significa que NO hay
 * red con seguridad (no hay interfaz, o el sistema lo dice), mientras que `true`
 * sólo significa «hay una interfaz levantada», y puede mentir con un portal
 * cautivo. Por eso `false` se usa para AVISAR y nunca para bloquear el envío:
 * si mintiese al revés dejaríamos al usuario sin poder enviar teniendo red.
 */
import { useEffect, useState } from 'react';

function leerEstado(): boolean {
    if (typeof navigator === 'undefined') return true;
    // `onLine` puede no existir en entornos de prueba: ausente = suponemos red.
    return navigator.onLine !== false;
}

export function useOnlineStatus(): boolean {
    const [online, setOnline] = useState(leerEstado);

    useEffect(() => {
        const subir = () => setOnline(true);
        const bajar = () => setOnline(false);
        window.addEventListener('online', subir);
        window.addEventListener('offline', bajar);
        return () => {
            window.removeEventListener('online', subir);
            window.removeEventListener('offline', bajar);
        };
    }, []);

    return online;
}
