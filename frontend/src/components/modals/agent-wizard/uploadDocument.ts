/**
 * Subir un documento a la base de conocimiento de un agente (D41).
 *
 * Sigue siendo `XMLHttpRequest` y no `fetch` por una razón concreta: es la
 * única forma de tener PROGRESO de subida en el navegador. `fetch` no expone
 * los bytes enviados, y sin barra de progreso un PDF de 40 MB parece colgado.
 *
 * El `Content-Type` no se fija a mano a propósito: lo pone el navegador con el
 * `boundary` del multipart, y ponerlo rompe la subida.
 */
import { API_URL } from './constants';

export function uploadDocument(
    agentId: string,
    file: File,
    onProgress: (pct: number) => void,
): Promise<void> {
    const formData = new FormData();
    formData.append('file', file);

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_URL}/agents/${agentId}/documents`);

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                onProgress(Math.round((e.loaded / e.total) * 100));
            }
        });

        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
            } else {
                reject(new Error(`Upload failed: ${xhr.status}`));
            }
        });

        xhr.addEventListener('error', () => reject(new Error('Network error')));
        xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

        xhr.send(formData);
    });
}
