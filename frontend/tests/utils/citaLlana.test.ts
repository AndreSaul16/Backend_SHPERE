import { describe, it, expect } from 'vitest';
import { citaLlana } from '../../src/utils/citaLlana';

/**
 * Defecto visto en la verificación de la fase 3: el asiento en foco del Palco
 * enseñaba MARKDOWN CRUDO. En pantalla, a 390px, se leía literalmente
 * `**Voto en contra.** Nadie ha puesto número al coste de equivocarse.`
 *
 * La cita es un extracto de tres líneas, así que se limpia en vez de
 * renderizarse: un recorte de 220 caracteres parte la sintaxis por la mitad, y
 * renderizar un `**` sin pareja o una valla de código sin cerrar da peor
 * resultado que el texto llano.
 */
describe('citaLlana', () => {
    it('quita la negrita, que es el caso que se vio en pantalla', () => {
        expect(citaLlana('**Voto en contra.** Nadie ha puesto número al coste de equivocarse.'))
            .toBe('Voto en contra. Nadie ha puesto número al coste de equivocarse.');
    });

    it('quita cursiva, tachado y código en línea', () => {
        // Del tachado se quita la SINTAXIS y se conserva el texto. Es
        // deliberado: esto limpia marcas, no censura contenido, y un extracto
        // que borrase palabras estaría citando al director diciendo algo que no
        // dijo. Lo tachado se ve tachado en el turno completo, que es donde esa
        // distinción importa.
        expect(citaLlana('El *margen* cayó ~~dos~~ tres puntos según `balance.csv`.'))
            .toBe('El margen cayó dos tres puntos según balance.csv.');
    });

    it('un guion bajo dentro de una palabra NO es cursiva', () => {
        // `pro_messages_balance` es un nombre de campo real de este producto.
        expect(citaLlana('El saldo vive en pro_messages_balance.'))
            .toBe('El saldo vive en pro_messages_balance.');
    });

    it('de un enlace se queda el texto, no la URL', () => {
        expect(citaLlana('Ver el [informe del trimestre](https://ejemplo.com/q3) antes de votar.'))
            .toBe('Ver el informe del trimestre antes de votar.');
    });

    it('encabezados, citas y viñetas se quedan en su texto', () => {
        expect(citaLlana('## Conclusión\n\n> No hay datos\n\n- Primero\n- Segundo\n\n1. Uno'))
            .toBe('Conclusión No hay datos Primero Segundo Uno');
    });

    it('los saltos de línea se colapsan: el extracto es una tirada', () => {
        expect(citaLlana('Primera línea.\n\n\nSegunda línea.')).toBe('Primera línea. Segunda línea.');
    });

    it('los restos de sintaxis de un recorte no llegan a pantalla', () => {
        // El caso que hace que renderizar markdown aquí sea mala idea: el
        // recorte deja un `**` huérfano.
        expect(citaLlana('Una frase con **negrita sin cerrar')).toBe('Una frase con negrita sin cerrar');
    });

    it('el bloque de artefacto y los marcadores del store desaparecen', () => {
        const contenido = 'Aquí va el acta. <sphere_artifact title="Acta">contenido</sphere_artifact> Fin.';
        expect(citaLlana(contenido)).toBe('Aquí va el acta. Fin.');
        expect(citaLlana('Miro el calendario.\n[TOOL_START:calendario]\nTres huecos.'))
            .toBe('Miro el calendario. Tres huecos.');
    });

    it('el marcador de confirmación tampoco se cuela crudo en la cita', () => {
        // Es el marcador nuevo; si se olvida en esta lista, el Palco cita
        // literalmente «[TOOL_CONFIRM:whatsapp_send_message:…]».
        expect(citaLlana('a [TOOL_CONFIRM:x:y] b')).toBe('a b');
    });

    it('recorta por palabra y lo dice con una elipsis', () => {
        const largo = 'palabra '.repeat(60);
        const r = citaLlana(largo, 40);
        expect(r.length).toBeLessThanOrEqual(41);
        expect(r.endsWith('…')).toBe(true);
        // Nunca a mitad de palabra.
        expect(r).not.toMatch(/pala…$/);
    });

    it('el recorte se cuenta sobre el texto LIMPIO, no sobre el markdown', () => {
        // Recortando antes de limpiar, los asteriscos se comerían caracteres de
        // la cita y saldría más corta de lo pedido.
        const conSintaxis = '**' + 'a'.repeat(30) + '**' + ' ' + 'b'.repeat(30);
        expect(citaLlana(conSintaxis, 40)).toHaveLength(31); // 30 aes + la elipsis
    });

    it('un texto que ya cabe se devuelve sin elipsis', () => {
        expect(citaLlana('Corto y claro.', 220)).toBe('Corto y claro.');
    });

    it('una cadena vacía no revienta', () => {
        expect(citaLlana('')).toBe('');
    });
});
