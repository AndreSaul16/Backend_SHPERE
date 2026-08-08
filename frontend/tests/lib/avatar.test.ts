/**
 * D56 — lo que NO llega a `localStorage`.
 *
 * El encogido a 256 px no se puede probar aquí: jsdom trae un `<canvas>` sin
 * contexto 2D y `toDataURL` no existe. Lo que sí se prueba —y es lo que
 * protegía a `localStorage` de un `QuotaExceededError` silencioso— es que un
 * fichero que no es una imagen, o que pesa como una foto de cámara sin
 * recortar, se rechaza ANTES de leerse.
 */
import { describe, expect, it } from 'vitest';
import {
    ErrorDeAvatar,
    LADO_DEL_AVATAR,
    TAMANO_MAXIMO_BYTES,
    TIPOS_ACEPTADOS_ATTR,
    prepararAvatar,
} from '@/lib/avatar';

/** Un `File` de `n` bytes con el tipo que se le diga. */
function ficheroDe(n: number, type: string, nombre = 'foto'): File {
    const f = new File([new Uint8Array(1)], nombre, { type });
    Object.defineProperty(f, 'size', { value: n });
    return f;
}

describe('prepararAvatar', () => {
    it('rechaza lo que no es una imagen, con un motivo que se puede enseñar', async () => {
        await expect(prepararAvatar(ficheroDe(1024, 'application/pdf', 'contrato.pdf')))
            .rejects.toThrow(ErrorDeAvatar);
        await expect(prepararAvatar(ficheroDe(1024, 'application/pdf', 'contrato.pdf')))
            .rejects.toThrow(/imagen JPG, PNG, WebP o GIF/i);
    });

    it('rechaza una foto descomunal sin llegar a leerla', async () => {
        await expect(prepararAvatar(ficheroDe(TAMANO_MAXIMO_BYTES + 1, 'image/jpeg')))
            .rejects.toThrow(/10 MB/);
    });

    /* El camino feliz NO se prueba aquí a propósito: jsdom ni decodifica la
       imagen (`new Image()` nunca dispara `onload` con un blob) ni trae
       contexto 2D en `<canvas>`. Probarlo exigiría un navegador de verdad, y
       eso es de la fase 8. Lo que sí se fija es que la lista de tipos que
       anuncia el `accept` del input es la misma que valida el filtro. */
    it('el `accept` del input anuncia exactamente los tipos que se aceptan', () => {
        expect(TIPOS_ACEPTADOS_ATTR.split(',')).toEqual([
            'image/jpeg', 'image/png', 'image/webp', 'image/gif',
        ]);
    });
});

describe('el contrato del avatar', () => {
    it('guarda un cuadrado pequeño, no la foto original', () => {
        expect(LADO_DEL_AVATAR).toBeLessThanOrEqual(256);
        // El cupo de `localStorage` son 5 MB: el margen tiene que ser enorme.
        expect(TAMANO_MAXIMO_BYTES).toBeGreaterThan(5 * 1024 * 1024);
    });
});
