/**
 * Atajos de teclado — PLAN §6 Q9 (tareas 5.2 y 5.3), DESIGN §12.4.
 *
 * El punto de partida era **un solo `onKeyDown` en 47 ficheros**: quien convoca
 * varias juntas al día vivía con el ratón. Este módulo es el único sitio donde
 * se decide qué tecla hace qué, por dos razones que no son de estilo:
 *
 * 1. **Un atajo que secuestra la escritura es peor que no tener atajo.** La
 *    regla vive aquí y no en cada sitio de uso: dentro de un campo de texto
 *    sólo pasan las combinaciones CON modificador (y `Escape`). Escribir «¿por
 *    qué?» en el compositor no puede abrir la hoja de ayuda.
 * 2. **La hoja de `?` se genera de esta misma lista.** Si el registro y la
 *    documentación fueran dos sitios, la hoja mentiría en cuanto alguien
 *    añadiera un atajo — y la hoja es, de hecho, la mejor documentación de lo
 *    que la aplicación sabe hacer.
 *
 * `mod` es ⌘ en Apple y Ctrl en el resto. El emparejamiento acepta los dos en
 * cualquier plataforma a propósito: un usuario de Mac con teclado externo de PC
 * pulsa Ctrl, y negarle el atajo no protege a nadie.
 *
 * Es un `.ts` sin JSX: aquí no hay componentes, y así el registro se puede
 * importar desde la hoja y desde los tests sin montar nada.
 */
import { useEffect } from 'react';

export type GrupoDeAtajo = 'Navegación' | 'La junta' | 'Lectura' | 'Ayuda';

export interface DefinicionDeAtajo {
    id: string;
    /** Combinación en notación interna: `mod+k`, `shift+c`, `?`, `j`. */
    combo: string;
    /** Qué hace, en la voz de §11: verbo primero, sin floritura. */
    que: string;
    grupo: GrupoDeAtajo;
    /** Dónde funciona, cuando no es en toda la aplicación. */
    donde?: string;
}

/**
 * El registro. Es la fuente única: la hoja de `?` se pinta de aquí y cada sitio
 * de uso pide su combinación por `id`, nunca por literal.
 */
export const ATAJOS: DefinicionDeAtajo[] = [
    { id: 'paleta', combo: 'mod+k', que: 'Abrir la paleta de comandos', grupo: 'Navegación' },
    { id: 'sidebar', combo: 'mod+b', que: 'Mostrar u ocultar el historial', grupo: 'Navegación' },
    { id: 'artefactos', combo: 'mod+j', que: 'Mostrar u ocultar el panel del acta', grupo: 'Navegación' },
    { id: 'buscar', combo: 'mod+/', que: 'Buscar en esta conversación', grupo: 'Navegación', donde: 'En una junta' },

    { id: 'enviar', combo: 'mod+enter', que: 'Enviar lo escrito', grupo: 'La junta', donde: 'En el compositor' },
    { id: 'convocar', combo: 'mod+shift+enter', que: 'Convocar junta con lo escrito', grupo: 'La junta', donde: 'En el compositor' },
    { id: 'detener', combo: 'escape', que: 'Detener la generación en curso', grupo: 'La junta' },

    { id: 'turno-siguiente', combo: 'j', que: 'Ir al turno siguiente', grupo: 'Lectura', donde: 'En una junta' },
    { id: 'turno-anterior', combo: 'k', que: 'Ir al turno anterior', grupo: 'Lectura', donde: 'En una junta' },

    { id: 'ayuda', combo: '?', que: 'Ver esta hoja de atajos', grupo: 'Ayuda' },
];

/** Busca la combinación de un atajo por su id. Lanza si no existe: es un bug. */
export function comboDe(id: string): string {
    const atajo = ATAJOS.find((a) => a.id === id);
    if (!atajo) throw new Error(`Atajo desconocido: ${id}`);
    return atajo.combo;
}

/** ¿El teclado de esta máquina dice ⌘ o Ctrl? Sólo afecta a cómo se DIBUJA. */
export function esApple(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');
}

const NOMBRE_DE_TECLA: Record<string, string> = {
    enter: '⏎',
    escape: 'Esc',
    arrowup: '↑',
    arrowdown: '↓',
    shift: '⇧',
    '?': '?',
};

/**
 * La combinación como teclas sueltas, para pintarlas en `<kbd>`.
 * `mod` se resuelve al símbolo de la plataforma: escribir «Ctrl» en un Mac es
 * documentación equivocada, y la hoja de atajos es documentación.
 */
export function teclasDe(combo: string, apple = esApple()): string[] {
    return combo.split('+').map((parte) => {
        if (parte === 'mod') return apple ? '⌘' : 'Ctrl';
        if (parte === 'shift') return '⇧';
        if (parte === 'alt') return apple ? '⌥' : 'Alt';
        return NOMBRE_DE_TECLA[parte] ?? parte.toUpperCase();
    });
}

/** ¿El foco está donde se escribe? */
export function esCampoDeTexto(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el || typeof el.tagName !== 'string') return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select';
}

/** ¿Hay un diálogo modal abierto ahora mismo? */
export function hayDialogoAbierto(): boolean {
    return document.querySelector('[role="dialog"][aria-modal="true"]') !== null;
}

/**
 * ¿Este evento de teclado es esta combinación?
 *
 * Se compara por `event.key` en minúsculas y no por `code`: `code` es la
 * POSICIÓN física de la tecla, así que en un teclado francés `KeyQ` está donde
 * un teclado español tiene la A, y los atajos de una letra saldrían movidos.
 */
export function coincide(e: KeyboardEvent, combo: string): boolean {
    const partes = combo.split('+');
    const tecla = partes[partes.length - 1];
    const quiereMod = partes.includes('mod');
    const quiereShift = partes.includes('shift');
    const quiereAlt = partes.includes('alt');

    const hayMod = e.metaKey || e.ctrlKey;
    if (quiereMod !== hayMod) return false;
    if (quiereAlt !== e.altKey) return false;

    const pulsada = (e.key || '').toLowerCase();
    // `?` viaja con Shift en casi todas las distribuciones, y en unas cuantas
    // ni siquiera con Shift. Comparar el carácter resultante es lo único que
    // funciona en todas: pedir `shift+/` dejaría fuera al teclado español.
    if (tecla === '?') return e.key === '?';

    if (quiereShift !== e.shiftKey) return false;
    return pulsada === tecla;
}

export interface OpcionesDeAtajo {
    /** Desactiva el atajo sin desmontar nada (una ruta donde no aplica). */
    activo?: boolean;
    /**
     * Deja que dispare aunque el foco esté en un campo de texto. Sólo para
     * combinaciones con modificador: sin él, secuestra la escritura.
     */
    permitirEnCampos?: boolean;
    /**
     * Por defecto un atajo calla mientras hay un diálogo abierto: el usuario
     * está en otra conversación con la aplicación. Lo desactivan los que TIENEN
     * que funcionar dentro (el propio conmutador de la paleta).
     */
    silenciarConDialogo?: boolean;
}

/**
 * Registra una combinación global.
 *
 * El escuchador va en `document` en fase de captura, como el de `<Modal>`: así
 * responde también cuando el foco ha caído en el `<body>` — que es justo donde
 * cae tras cerrar un desplegable nativo.
 */
export function useAtajo(
    combo: string,
    manejador: (e: KeyboardEvent) => void,
    opciones: OpcionesDeAtajo = {},
): void {
    const {
        activo = true,
        permitirEnCampos = false,
        silenciarConDialogo = true,
    } = opciones;

    useEffect(() => {
        if (!activo) return;
        const alPulsar = (e: KeyboardEvent) => {
            if (e.defaultPrevented) return;
            if (!coincide(e, combo)) return;
            // Regla dura: dentro de un campo sólo pasan las combinaciones con
            // modificador y `Escape`. Un atajo de una letra que se cuela en el
            // compositor le come una letra al borrador.
            const enCampo = esCampoDeTexto(e.target);
            const conModificador = e.metaKey || e.ctrlKey;
            if (enCampo && !permitirEnCampos && !conModificador && combo !== 'escape') return;
            if (silenciarConDialogo && hayDialogoAbierto()) return;
            manejador(e);
        };
        document.addEventListener('keydown', alPulsar, true);
        return () => document.removeEventListener('keydown', alPulsar, true);
    }, [combo, manejador, activo, permitirEnCampos, silenciarConDialogo]);
}
