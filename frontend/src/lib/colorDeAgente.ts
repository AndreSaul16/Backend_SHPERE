/**
 * El color de identidad de un director, apto para los DOS temas — FASE 8.
 *
 * El problema medido (auditoría final, DOM vivo): `AGENT_HEX` está calibrado
 * contra el paño oscuro (7.3-8.4:1 sobre `baize-950`), pero los componentes lo
 * pintaban con `style={{ color: hex }}`, que no cambia con `data-theme`. En
 * tema claro los cinco directores median 2.2-2.6:1 sobre el papel — ilegibles.
 * Los tokens `--agent-*` del bloque claro de `index.css` existían desde la
 * fase 0 y nadie los consumía desde JS (limitación declarada en
 * `agentCatalog.ts`).
 *
 * La salida no es recalcular el hex al cambiar de tema (eso exigía un punto de
 * recálculo que `useAgentes` no puede dar sin perder la estabilidad de
 * referencia de la tarea 4.6): es dejar que lo haga el CSS. Para los seis
 * roles con token, el color que viaja al `style` es `var(--agent-…)` con el
 * hex de respaldo; el navegador lo re-resuelve solo al conmutar el tema. Los
 * agentes A MEDIDA conservan su hex elegido por el usuario, como siempre.
 */
import { AGENT_HEX } from '@/store/chat/agentCatalog';

const VAR_POR_ROL: Record<string, string> = {
    CEO: '--agent-ceo',
    CTO: '--agent-cto',
    CFO: '--agent-cfo',
    CMO: '--agent-cmo',
    DEVIL: '--agent-devil',
    user: '--agent-user',
};

/**
 * Color pleno: `var(--agent-x, hex)` si el rol tiene token Y el hex es el
 * canónico del catálogo. Si el hex viene de otro sitio (el color de sesión
 * que eligió el usuario en un chat 1-a-1, un agente a medida), se respeta tal
 * cual: la identidad de tema sólo sustituye a la identidad de catálogo.
 */
export function colorDeAgente(rol: string | undefined, hex: string): string {
    const variable = rol ? VAR_POR_ROL[rol] : undefined;
    if (!variable) return hex;
    const canonico = AGENT_HEX[rol as keyof typeof AGENT_HEX];
    if (hex && canonico && hex.toLowerCase() !== canonico.toLowerCase()) return hex;
    return `var(${variable}, ${canonico ?? hex})`;
}

/**
 * Color con transparencia (sustituye a los sufijos `${hex}40`, `${hex}1F`…,
 * que no funcionan sobre un `var()`). `pct` es la opacidad en 0-100.
 */
export function colorDeAgenteAlpha(rol: string | undefined, hex: string, pct: number): string {
    return `color-mix(in srgb, ${colorDeAgente(rol, hex)} ${pct}%, transparent)`;
}

/**
 * El RELLENO de identidad de §2.8 — Viveza-1.
 *
 * §2.8 firma la receta desde el principio («un agente puede teñir un fondo a
 * 12% de alpha sobre `baize-900`… e `ink-100` encima sigue en 12.80:1»), pero
 * el transcript nunca la cobró: las burbujas de agente compartían todas
 * `bg-ai-bubble` (= `--surface-2`, plano) y la identidad quedaba en el filete
 * de 2px más el nombre. En móvil, donde la placa va `hidden sm:flex`, ese
 * filete era la señal ENTERA.
 *
 * Dos decisiones que parecen detalles y no lo son:
 *
 *  - **Deriva de `colorDeAgente`**, no de una segunda tabla. Es lo que hace que
 *    un override de sesión y un agente a medida hereden el tinte sin tocar
 *    nada: el relleno y el filete no pueden discrepar porque leen lo mismo.
 *  - **El suelo y la proporción los pone el TEMA** (`--relleno-identidad-base`
 *    y `--relleno-identidad-pct` en `index.css`), no esta función. Escribir
 *    aquí «12% sobre baize-900» habría teñido el tema claro contra el paño
 *    oscuro. Con las variables, el navegador re-resuelve el relleno al conmutar
 *    de tema igual que ya hace con el filete.
 *
 * `oklab` y no `srgb` (que es lo que usa `colorDeAgenteAlpha` para las
 * transparencias): es una mezcla de dos colores opacos, y en oklab el 12% se
 * percibe como 12% en los seis tonos por igual. Es la receta literal de §2.8.
 */
export function rellenoDeIdentidad(rol: string | undefined, hex: string): string {
    return `color-mix(in oklab, ${colorDeAgente(rol, hex)} var(--relleno-identidad-pct), var(--relleno-identidad-base))`;
}
