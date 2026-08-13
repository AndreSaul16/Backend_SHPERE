/**
 * El tema de resaltado que toca ahora mismo (7.6).
 *
 * `temaCodigo` era una constante importada: un solo tema, el oscuro, para los
 * dos temas de la aplicación. Esto lo convierte en una pregunta que se hace en
 * cada render y que se responde con el tema efectivo, o sea el mismo que pinta
 * `data-theme` en la raíz. Un cambio de tema repinta el código sin recargar.
 */
import { useMemo } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { temaCodigoClaro, temaCodigoOscuro } from '@/lib/resaltado';

/** El objeto de estilos de Prism correspondiente al tema en pantalla. */
export function useTemaDeCodigo() {
    const { efectivo } = useTheme();
    return useMemo(
        () => (efectivo === 'light' ? temaCodigoClaro : temaCodigoOscuro),
        [efectivo],
    );
}
