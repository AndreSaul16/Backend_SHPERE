/**
 * El tema, para React — tarea 6.11.
 *
 * La lógica vive en `lib/tema.ts` porque hace falta ANTES de que React exista:
 * `main.tsx` la llama para pintar el atributo antes del primer pintado. Este
 * hook es sólo la ventana de los componentes a ese estado.
 *
 * Se suscribe a dos cosas, y las dos hacen falta:
 *   - el cambio de preferencia del sistema, para que en `system` la pantalla
 *     siga al móvil cuando pasa a modo noche;
 *   - el evento `storage`, para que dos pestañas abiertas no acaben con temas
 *     distintos después de cambiarlo en una.
 */
import { useCallback, useEffect, useState } from 'react';
import {
    CLAVE_TEMA,
    aplicarTema,
    leerTema,
    temaEfectivo,
    type Tema,
    type TemaEfectivo,
} from '@/lib/tema';

export interface UseTheme {
    /** Lo que el usuario ha elegido: puede ser `system`. */
    tema: Tema;
    /** Lo que se está pintando: nunca es `system`. */
    efectivo: TemaEfectivo;
    elegir: (tema: Tema) => void;
}

export function useTheme(): UseTheme {
    const [tema, setTema] = useState<Tema>(() => leerTema());
    const [efectivo, setEfectivo] = useState<TemaEfectivo>(() => temaEfectivo());

    const elegir = useCallback((siguiente: Tema) => {
        aplicarTema(siguiente);
        setTema(siguiente);
        setEfectivo(temaEfectivo(siguiente));
    }, []);

    useEffect(() => {
        // El estado se recalcula dentro de los manejadores, no en el cuerpo del
        // efecto: `setState` síncrono aquí es lo que la regla de lint marca, y
        // además provocaría un render de más en cada montaje.
        const sincronizar = () => {
            setTema(leerTema());
            setEfectivo(temaEfectivo());
        };

        let consulta: MediaQueryList | null = null;
        try {
            consulta = window.matchMedia?.('(prefers-color-scheme: light)') ?? null;
        } catch {
            consulta = null;
        }
        consulta?.addEventListener('change', sincronizar);

        const alCambiarElAlmacen = (e: StorageEvent) => {
            if (e.key === null || e.key === CLAVE_TEMA) sincronizar();
        };
        window.addEventListener('storage', alCambiarElAlmacen);

        return () => {
            consulta?.removeEventListener('change', sincronizar);
            window.removeEventListener('storage', alCambiarElAlmacen);
        };
    }, []);

    return { tema, efectivo, elegir };
}
