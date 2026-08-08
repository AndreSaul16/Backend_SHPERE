/**
 * El avatar del usuario, encogido antes de tocar `localStorage` (D56).
 *
 * Lo que había: `FileReader.readAsDataURL(file)` y directo a
 * `localStorage.setItem`. Sin mirar el tipo —un `.pdf` entraba igual y se
 * pintaba como imagen rota—, sin mirar el tamaño, y sin comprimir. Una foto
 * de cámara de 5 MB son unos 6,7 MB de base64: por encima del cupo de
 * `localStorage` de todos los navegadores (5 MB), así que el `setItem`
 * lanzaba `QuotaExceededError`, nadie lo capturaba, y el avatar
 * silenciosamente no se guardaba. Con una foto algo menor sí cabía, y entonces
 * el problema era el contrario: cada arranque de la app leía y decodificaba
 * megabytes de cadena para pintar un círculo de 40 píxeles.
 *
 * Ahora: se comprueba el tipo, se rechaza lo descomunal antes de leerlo, y lo
 * que se guarda es un cuadrado de 256 px en JPEG — entre 8 y 25 KB.
 */

/** Lado del cuadrado que se guarda. 256 basta para el círculo de 96 px @2x. */
export const LADO_DEL_AVATAR = 256;

/** Por encima de esto no se lee ni el fichero: es una foto sin recortar. */
export const TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024;

const TIPOS_ACEPTADOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** El `accept` del `<input type=file>`, derivado de la misma lista. */
export const TIPOS_ACEPTADOS_ATTR = TIPOS_ACEPTADOS.join(',');

export class ErrorDeAvatar extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ErrorDeAvatar';
    }
}

/**
 * Recorta al cuadrado central y escala a `LADO_DEL_AVATAR`.
 *
 * Recorta en vez de deformar porque el avatar se pinta redondo: una foto
 * apaisada estirada a cuadrado sale con la cara aplastada.
 */
function dibujarCuadrado(imagen: HTMLImageElement): string {
    const lienzo = document.createElement('canvas');
    lienzo.width = LADO_DEL_AVATAR;
    lienzo.height = LADO_DEL_AVATAR;
    const ctx = lienzo.getContext('2d');
    if (!ctx) throw new ErrorDeAvatar('Este navegador no puede procesar la imagen.');

    const lado = Math.min(imagen.naturalWidth, imagen.naturalHeight);
    const x = (imagen.naturalWidth - lado) / 2;
    const y = (imagen.naturalHeight - lado) / 2;
    ctx.drawImage(imagen, x, y, lado, lado, 0, 0, LADO_DEL_AVATAR, LADO_DEL_AVATAR);
    return lienzo.toDataURL('image/jpeg', 0.85);
}

/**
 * De un fichero elegido a la cadena que se guarda.
 *
 * Lanza `ErrorDeAvatar` con un texto que se puede enseñar tal cual: el motivo
 * es del usuario («esto no es una imagen»), no del sistema.
 */
export async function prepararAvatar(file: File): Promise<string> {
    if (!TIPOS_ACEPTADOS.includes(file.type)) {
        throw new ErrorDeAvatar('Elige una imagen JPG, PNG, WebP o GIF.');
    }
    if (file.size > TAMANO_MAXIMO_BYTES) {
        throw new ErrorDeAvatar('La imagen pesa más de 10 MB. Recórtala antes de subirla.');
    }

    const url = URL.createObjectURL(file);
    try {
        const imagen = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new ErrorDeAvatar('No se ha podido leer la imagen.'));
            img.src = url;
        });
        return dibujarCuadrado(imagen);
    } finally {
        URL.revokeObjectURL(url);
    }
}
