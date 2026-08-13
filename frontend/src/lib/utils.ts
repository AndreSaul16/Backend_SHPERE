import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * `tailwind-merge` no conoce las escalas propias del sistema (DESIGN §3.2, §5),
 * así que las clasifica por su prefijo y las hace chocar con otro grupo. Medido
 * con la versión 3.4.0 que trae el proyecto:
 *
 *   twMerge('text-micro uppercase', 'text-dissent')  →  'uppercase text-dissent'
 *   twMerge('shadow-e2 shadow-black/40')             →  'shadow-black/40'
 *
 * Es decir: **el tamaño de letra y la sombra desaparecían en silencio** cada vez
 * que un `cn()` los juntaba con un color. Y es una mina que crece: la tarea 1.15
 * convierte 155 `text-[8..11px]` en `text-micro`, y `--text-micro` es el suelo
 * tipográfico de §3.2 — el token más usado del sistema en cuanto entre.
 *
 * Declarando las escalas, `tailwind-merge` vuelve a acertar en ambos sentidos:
 * `text-micro` convive con un color, y sigue chocando con `text-sm`, que es lo
 * correcto porque los dos son tamaños.
 */
const twMerge = extendTailwindMerge({
    extend: {
        theme: {
            // §3.2 (`--text-micro`) y §3.4 (los dos pasos display de marketing).
            text: ['micro', 'display', 'hero'],
            // §5: la escala de elevación e0-e4.
            shadow: ['e1', 'e2', 'e3', 'e4'],
        },
    },
})

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}
