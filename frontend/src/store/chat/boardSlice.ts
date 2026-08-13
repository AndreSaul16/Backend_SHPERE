/**
 * Estado vivo del debate (war-room), Board V2.
 *
 * El slice es sólo estado, y eso es deliberado: `boardSession` no tiene
 * acciones propias porque sus dos escritores legítimos viven fuera —el stream
 * SSE (`boardStreamHandlers`) mientras el debate ocurre, y `loadSession`, que
 * lo reconstruye del historial al reabrir una junta (P0 F2)—.
 *
 * Ojo con el significado de `active`: es «hay un debate EN VUELO», y lo usan
 * `canIntervene` y `AuroraBackground`. `ChatPanel` NO monta la mesa con él,
 * sino con `hayMesaQueEnsenar` (activo, participantes o votos), porque un
 * debate cerrado se sigue enseñando.
 */
import type { BoardSlice } from './types';

export { rebuildBoardSession, nuevoBoardSession } from './boardSession';

export const createBoardSlice = (): BoardSlice => ({
    boardSession: null,
});
