import { describe, it, expect } from 'vitest';
import { parseMessageParts } from '../../src/utils/parseMessageParts';

/**
 * Tarea 4.7 · D21 — el parser del turno, por fin con test.
 *
 * Estas ~180 líneas vivían DENTRO del JSX de `MessageBubble`, en una función
 * anónima invocada en el sitio: no había forma de llamarlas sin montar una
 * burbuja con su store, su avatar y su framer-motion. Deciden qué se ve en el
 * hilo —dónde va una tarjeta de artefacto, cuándo una llamada a herramienta
 * pasa de «en curso» a «hecho»— y tenían cero cobertura.
 */
describe('parseMessageParts', () => {
    it('un turno sin marcadores es una sola pieza de texto', () => {
        const partes = parseMessageParts('La junta recomienda **no** avanzar.');
        expect(partes).toEqual([{ tipo: 'texto', texto: 'La junta recomienda **no** avanzar.' }]);
    });

    it('el texto de alrededor se conserva, y en orden', () => {
        const partes = parseMessageParts('Antes\n\n[ARTIFACT:a1:Acta de la junta]\n\nDespués');
        expect(partes.map((p) => p.tipo)).toEqual(['texto', 'artefacto', 'texto']);
        expect(partes[0]).toMatchObject({ texto: 'Antes\n\n' });
        expect(partes[1]).toEqual({ tipo: 'artefacto', artifactId: 'a1', titulo: 'Acta de la junta' });
        expect(partes[2]).toMatchObject({ texto: '\n\nDespués' });
    });

    it('el texto que sólo son espacios entre marcadores no genera pieza', () => {
        // Es lo que hace que dos tarjetas seguidas no lleven un párrafo vacío
        // en medio: el store separa los marcadores con saltos de línea.
        const partes = parseMessageParts('\n[TOOL_START:buscar]\n\n[TOOL_START:leer]\n');
        expect(partes).toEqual([
            { tipo: 'utensilio', nombre: 'buscar', estado: 'running' },
            { tipo: 'utensilio', nombre: 'leer', estado: 'running' },
        ]);
    });

    it('un resultado SUSTITUYE a la tarjeta en curso del mismo utensilio, en su sitio', () => {
        // La regla que hace que una llamada a herramienta se lea como UNA
        // tarjeta que cambia de estado y no como dos apiladas.
        const partes = parseMessageParts(
            '\n[TOOL_START:calendario]\n\n[TOOL_START:correo]\n\n[TOOL_RESULT:calendario:3 huecos]\n'
        );
        expect(partes).toEqual([
            { tipo: 'utensilio', nombre: 'calendario', estado: 'completed', resultado: '3 huecos' },
            { tipo: 'utensilio', nombre: 'correo', estado: 'running' },
        ]);
    });

    it('un error también sustituye a la tarjeta en curso', () => {
        const partes = parseMessageParts('[TOOL_START:calendario]\n[TOOL_ERROR:calendario:sin permiso]');
        expect(partes).toEqual([
            { tipo: 'utensilio', nombre: 'calendario', estado: 'failed', error: 'sin permiso' },
        ]);
    });

    it('un resultado sin tarjeta en curso se añade al final', () => {
        // Pasa al rehidratar un hilo del historial: el turno guardado trae el
        // resultado pero no siempre el arranque.
        const partes = parseMessageParts('[TOOL_RESULT:calendario:3 huecos]');
        expect(partes).toEqual([
            { tipo: 'utensilio', nombre: 'calendario', estado: 'completed', resultado: '3 huecos' },
        ]);
    });

    it('dos utensilios distintos no se pisan', () => {
        const partes = parseMessageParts(
            '[TOOL_START:a]\n[TOOL_START:b]\n[TOOL_RESULT:b:ok-b]\n[TOOL_RESULT:a:ok-a]'
        );
        expect(partes).toEqual([
            { tipo: 'utensilio', nombre: 'a', estado: 'completed', resultado: 'ok-a' },
            { tipo: 'utensilio', nombre: 'b', estado: 'completed', resultado: 'ok-b' },
        ]);
    });

    it('un resultado vacío sigue siendo un resultado', () => {
        const partes = parseMessageParts('[TOOL_RESULT:contar:]');
        expect(partes).toEqual([
            { tipo: 'utensilio', nombre: 'contar', estado: 'completed', resultado: '' },
        ]);
    });

    it('el marcador a medio llegar se lee como texto, no se pierde', () => {
        // Durante el streaming el marcador llega partido por la mitad. Lo que
        // NO puede pasar es que el trozo desaparezca del hilo.
        const partes = parseMessageParts('Voy a mirarlo.\n[TOOL_STA');
        expect(partes).toEqual([{ tipo: 'texto', texto: 'Voy a mirarlo.\n[TOOL_STA' }]);
    });

    it('es puro: dos llamadas seguidas dan lo mismo', () => {
        // El regex es un literal de módulo con la bandera `g`, o sea que lleva
        // `lastIndex` propio. Sin reiniciarlo, la segunda llamada empezaría
        // donde acabó la primera y devolvería otra cosa. Es el fallo clásico y
        // es silencioso.
        const texto = 'Hola [TOOL_START:x] adiós';
        expect(parseMessageParts(texto)).toEqual(parseMessageParts(texto));
    });

    it('un turno vacío no revienta', () => {
        expect(parseMessageParts('')).toEqual([{ tipo: 'texto', texto: '' }]);
    });

    it('una petición de confirmación es una pieza propia, ni hecha ni fallida', () => {
        // El quinto marcador. Sin él, el turno enseñaría el corchete crudo y la
        // acción pendiente se leería como texto del agente.
        const partes = parseMessageParts(
            '\n[TOOL_CONFIRM:whatsapp_send_message:Enviar «llego tarde» a +34600111222]\n',
        );
        expect(partes[0].tipo).toBe('utensilio');
        expect(partes[0]).toEqual({
            tipo: 'utensilio',
            nombre: 'whatsapp_send_message',
            estado: 'awaiting_confirmation',
            resumen: 'Enviar «llego tarde» a +34600111222',
        });
    });

    it('la confirmación SUSTITUYE a la tarjeta en curso del mismo utensilio', () => {
        // Misma regla que resultado y error: una llamada es UNA tarjeta que
        // cambia de estado, no dos apiladas.
        const partes = parseMessageParts(
            '[TOOL_START:calendar_delete_event]\n[TOOL_CONFIRM:calendar_delete_event:Borrar «Comité» del jueves]',
        );
        expect(partes).toEqual([{
            tipo: 'utensilio',
            nombre: 'calendar_delete_event',
            estado: 'awaiting_confirmation',
            resumen: 'Borrar «Comité» del jueves',
        }]);
    });

    it('cien turnos de 8 KB se parsean en menos de 150 ms', () => {
        // No es una prueba de rendimiento fina: es la red que detecta si alguien
        // reintroduce un algoritmo cuadrático aquí dentro. El caso real es un
        // transcript de 100 mensajes re-renderizándose durante el streaming.
        const turno = ('El CFO estima el coste en 42.000 € anuales. ').repeat(180);
        const t0 = performance.now();
        for (let i = 0; i < 100; i++) parseMessageParts(turno);
        expect(performance.now() - t0).toBeLessThan(150);
    });
});
