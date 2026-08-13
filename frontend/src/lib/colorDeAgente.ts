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
