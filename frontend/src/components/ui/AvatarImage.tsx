/**
 * <AvatarImage> — D37: una imagen que no carga cae a su placa de texto.
 *
 * Los ocho `<img>` de avatar de la app no tenían `onError`. Un avatar que da
 * 404 —una `photoURL` de Google caducada, un `visual_config.avatar` que ya no
 * está— dejaba el glifo de imagen rota del navegador dentro de un círculo de
 * 32px, o un hueco vacío según el navegador. Y los ocho sitios YA tenían
 * escrita la alternativa correcta: la inicial, el emoji del agente o la placa
 * del director, que era lo que se pintaba cuando no había URL ninguna. El
 * arreglo es usar esa misma alternativa también cuando la imagen falla.
 *
 * Es un componente y no un `onError` suelto en cada sitio porque uno de los
 * ocho vive dentro de un `.map()` de sesiones, donde un `useState` por fila no
 * se puede declarar.
 *
 * No es el `<Avatar>` de DESIGN §9.10 (la Placa) — ése es otra tarea, con sus
 * estados de sesión. Esto sólo resuelve la carga de la imagen.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';

interface AvatarImageProps {
    /** URL de la imagen. Nula o vacía: se pinta `fallback` sin intentar nada. */
    src?: string | null;
    /** `alt=""` (el valor por defecto) cuando el nombre ya está escrito al lado. */
    alt?: string;
    className?: string;
    /** Lo que se pinta si no hay URL, o si la imagen no llega a cargar. */
    fallback: ReactNode;
}

export function AvatarImage({ src, alt = '', className, fallback }: AvatarImageProps) {
    // Se guarda QUÉ url falló, no un booleano: así una url nueva vuelve a
    // intentarse sola, sin efecto de reinicio. Con un booleano, subir otra
    // imagen después de una rota seguiría enseñando la placa.
    const [urlFallida, setUrlFallida] = useState<string | null>(null);

    if (!src || urlFallida === src) return <>{fallback}</>;

    return (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- `onError` no es un manejador de ratón ni de teclado: es el aviso de carga fallida de la propia imagen, y es justo lo que esta regla vino a proteger. El plugin lo mete en la lista por defecto junto a `onLoad` (`eventHandlersByType.image`); es el falso positivo conocido de la regla.
        <img
            src={src}
            alt={alt}
            className={className}
            onError={() => setUrlFallida(src)}
            data-testid="avatar-image"
        />
    );
}
