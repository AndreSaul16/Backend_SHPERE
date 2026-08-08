/**
 * El hilo entre las superficies de teclado y quien las abre desde fuera.
 *
 * Son dos superficies montadas en la raíz —la paleta de comandos y la hoja de
 * atajos— que no se conocen, no comparten padre y aun así tienen que poder
 * abrirse desde sitios que no son su combinación de teclas:
 *
 * · la paleta, desde el cajón, porque un ⌘K que sólo existe como combinación
 *   deja la función inalcanzable en móvil;
 * · la hoja, desde la propia paleta, que es la forma de descubrirla para quien
 *   no va a pulsar `?` porque no sabe que existe.
 *
 * Un bus de módulo y no estado en el store de chat: esto no es del dominio del
 * chat, y meterlo ahí obligaría a las superficies suscritas al store a
 * re-evaluar por abrir una hoja de ayuda. Mismo patrón que `toastBus`, y por el
 * mismo motivo: se puede probar sin montar nada.
 */
type Escucha = () => void;

const porCanal: Record<string, Set<Escucha>> = {};

function emitir(canal: string): void {
    for (const escucha of porCanal[canal] ?? []) escucha();
}

function suscribir(canal: string, escucha: Escucha): () => void {
    (porCanal[canal] ??= new Set()).add(escucha);
    return () => {
        porCanal[canal]?.delete(escucha);
    };
}

/** Pide que se abra la hoja de atajos. Si nadie escucha, no pasa nada. */
export function abrirHojaDeAtajos(): void {
    emitir('hoja');
}

/** Se suscribe la hoja. Devuelve la baja. */
export function alPedirLaHojaDeAtajos(escucha: Escucha): () => void {
    return suscribir('hoja', escucha);
}

/** Pide que se abra la paleta de comandos. */
export function abrirPaletaDeComandos(): void {
    emitir('paleta');
}

/** Se suscribe la paleta. Devuelve la baja. */
export function alPedirLaPaleta(escucha: Escucha): () => void {
    return suscribir('paleta', escucha);
}
