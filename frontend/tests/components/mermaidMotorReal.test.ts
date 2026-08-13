/**
 * AV-005, tercer escenario: el motor REAL, sin dobles.
 *
 * Todo lo demás sobre este visor se prueba con un motor guionizado, y está
 * bien: lo que se comprueba ahí es la degradación del componente. Pero la
 * premisa de esa degradación —«mermaid rechaza lo que el modelo escribe mal»—
 * es una afirmación sobre el motor, y probarla contra un doble sería probar el
 * doble.
 *
 * Vive en su propio fichero porque `vi.mock('mermaid')` se iza al ámbito del
 * módulo: en el fichero de al lado el motor está doblado y aquí no puede estarlo.
 */
import { describe, it, expect } from 'vitest';
import mermaid from 'mermaid';

describe('el motor real de Mermaid', () => {
    it('rechaza un texto que no es un diagrama', async () => {
        await expect(mermaid.parse('esto no es un diagrama')).rejects.toThrow();
    });

    it('acepta un diagrama bien escrito', async () => {
        await expect(mermaid.parse('graph TD; A-->B;')).resolves.toBeTruthy();
    });
});
