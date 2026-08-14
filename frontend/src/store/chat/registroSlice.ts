/**
 * El Registro de Actuaciones — DESIGN §8.7.
 *
 * «El diferenciador del producto es que los agentes **actúan en el mundo**
 * (n8n: WhatsApp, Notion, GitHub, webhooks). Cada actuación real se asienta en
 * un registro visible.»
 *
 * Sus únicos escritores son `onToolStart`, `onToolResult` y `onToolError` —los
 * manejadores del stream, no un reloj—, y por eso este almacén no tiene ninguna
 * acción que «avance» nada: sólo se puede anotar lo que ha ocurrido.
 */
import { v4 as uuidv4 } from 'uuid';
import type { Actuacion, ChatSet, RegistroSlice } from './types';

/**
 * Cuántas actuaciones se conservan.
 *
 * Una junta larga puede encadenar decenas, y el registro sólo enseña la última
 * más un contador: guardar las mil de una sesión maratón sería memoria que
 * nadie va a mirar. Veinte cubre de sobra el «+N hoy» que §8.7 describe.
 */
export const TOPE_DEL_REGISTRO = 20;

export const createRegistroSlice = (set: ChatSet): RegistroSlice => ({
    registroDeActuaciones: [],

    anotarActuacion: (herramienta, estado) => set((state) => {
        const registro = state.registroDeActuaciones;

        // Una herramienta que se resuelve NO añade una entrada nueva: cierra la
        // suya. Es la misma regla que ya aplica el parseo de los marcadores del
        // turno (`parseMessageParts`), y sin ella una sola llamada aparecería
        // dos veces en el registro —«creando página» y «creando página»— como
        // si el agente hubiera actuado dos veces en el mundo. Que es justo lo
        // que este registro existe para no mentir.
        //
        // Se busca desde el final a mano y no con `findLastIndex` porque la
        // librería de tipos del proyecto es anterior a ES2023: subirla entera
        // por una llamada sería un cambio de compilación con más alcance que
        // el motivo que lo pide.
        if (estado !== 'en-curso') {
            let i = registro.length - 1;
            while (i >= 0 && !(registro[i].herramienta === herramienta && registro[i].estado === 'en-curso')) {
                i -= 1;
            }
            if (i >= 0) {
                const actualizado = [...registro];
                actualizado[i] = { ...actualizado[i], estado };
                return { registroDeActuaciones: actualizado };
            }
        }

        const actuacion: Actuacion = {
            id: uuidv4(),
            herramienta,
            estado,
            hora: new Date(),
        };
        return {
            registroDeActuaciones: [...registro, actuacion].slice(-TOPE_DEL_REGISTRO),
        };
    }),
});
