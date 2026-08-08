import { useMemo, useState } from 'react';
import { motion, type PanInfo } from 'framer-motion';
import { useReducedMotion } from 'framer-motion';
import { Users } from 'lucide-react';
import type { Agent } from '@/types';
import { AGENT_HEX, getBoardAgentByRole, type BoardSessionState } from '@/store/useChatStore';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { conMovimiento, CURVA, DURACION, SPRING_PLATE } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { ConfidenceNeedle } from './ConfidenceNeedle';
import { Pista } from '@/components/ui/Pista';
import { colorDeAgente, colorDeAgenteAlpha } from '@/lib/colorDeAgente';
import { useFirstTimeHint } from '@/hooks/useFirstTimeHint';
import { VoteChip } from './VoteChip';

/**
 * La Mesa — en móvil el Palco, y el Palco es la versión de referencia
 * (DESIGN §8.1, §4.3).
 *
 * Lo que había antes era una banda de placas de 36px con un porcentaje debajo y
 * un resplandor en bucle infinito bajo el que hablaba. Ni era la Mesa ni era el
 * Palco: no había asiento en foco, ni gesto, ni lámpara, ni arco.
 *
 * Cómo está construido, y por qué así:
 *
 * - **Un solo juego de placas para los dos mundos.** El Palco (banda) y la Sala
 *   (arco de `lg+`) son el MISMO `role="tablist"` con distinta colocación: en
 *   vertical los asientos reparten el ancho a partes iguales, y en `lg+` cada
 *   uno se coloca por rumbo con `left`/`top` estáticos más `translate`+`scale`.
 *   Duplicar el marcado habría duplicado también el foco y el orden de lectura.
 * - **El patrón de pestañas, literal.** Placa = `tab`, asiento en foco =
 *   `tabpanel`. Sale gratis lo que el contrato pide: navegación con ←/→,
 *   Inicio/Fin, un solo tabulador para toda la mesa y la relación anunciada
 *   entre la placa y lo que abre.
 * - **El foco sigue a quien habla** hasta que alguien toca una placa; entonces
 *   se fija y aparece «Seguir la sala» para devolverlo al automático.
 * - **La lámpara es UNA** capa: un gradiente radial estático dentro de un
 *   envoltorio del ancho del contenedor, que se desliza con `x` en porcentaje
 *   del propio envoltorio. Así la misma lámpara sirve para la banda y para el
 *   arco sin medir nada en el DOM.
 *
 * Lo que NO se construye aquí, a propósito: el arco con `preserve-3d`. §8.1 lo
 * deja como mejora opcional tras QA en dispositivo real, porque el texto de
 * 12px sobre planos rotados se rasteriza fuera de eje y se empasta — y un arco
 * borroso lee como maqueta en la primera pantalla del producto.
 */

/** Grados que abarca el arco de la Sala, de extremo a extremo. */
const APERTURA_ARCO = 116;

interface Rumbo {
    izquierda: number;
    arriba: number;
    escala: number;
}

/**
 * Posiciones por rumbo (§8.1: «`translate` + `scale` sutil por profundidad, sin
 * `rotate3d`»). El asiento del centro está al fondo de la sala —más pequeño y
 * más arriba— y los de los extremos, más cerca del espectador.
 */
function rumbos(n: number): Rumbo[] {
    return Array.from({ length: n }, (_, i) => {
        const t = n === 1 ? 0.5 : i / (n - 1);
        const a = (t - 0.5) * ((APERTURA_ARCO * Math.PI) / 180);
        return {
            izquierda: 50 + Math.sin(a) * 40,
            arriba: 92 - Math.cos(a) * 58,
            escala: 0.92 + Math.abs(Math.sin(a)) * 0.12,
        };
    });
}

/** Nombre corto para la placa: «Nexus (CTO)» → «Nexus». */
function nombreCorto(nombre: string | undefined, rol: string): string {
    if (!nombre) return rol;
    const sinRol = nombre.replace(/\s*\([^)]*\)\s*$/, '').trim();
    return sinRol || rol;
}

interface PlacaProps {
    rol: string;
    agente: Agent | undefined;
    hex: string;
    activa: boolean;
    hablando: boolean;
    despachado: boolean;
    confianza: number | null;
    esSala: boolean;
    rumbo: Rumbo | null;
    reducido: boolean | null;
    onElegir: () => void;
}

function Placa({
    rol,
    agente,
    hex,
    activa,
    hablando,
    despachado,
    confianza,
    esSala,
    rumbo,
    reducido,
    onElegir,
}: PlacaProps) {
    const corto = nombreCorto(agente?.name, rol);
    const inicial = corto.charAt(0).toUpperCase();
    const nombreAccesible = confianza === null
        ? `${corto}, ${rol}${hablando ? ', tiene la palabra' : ''}`
        : `${corto}, ${rol}, confianza ${confianza} de 100`;

    return (
        <motion.button
            type="button"
            role="tab"
            id={`asiento-placa-${rol}`}
            data-asiento={rol}
            aria-selected={activa}
            aria-controls="asiento-en-foco"
            {...(hablando ? { 'aria-current': true as const } : {})}
            tabIndex={activa ? 0 : -1}
            aria-label={nombreAccesible}
            onClick={onElegir}
            className={cn(
                // §9.10 la placa: radio corto, filete, sin degradado ni sombra.
                'group relative flex flex-col items-center justify-end gap-1 rounded-sm border bg-surface-2 px-1 pb-1 pt-1.5 outline-offset-2 transition-colors duration-(--duration-tap)',
                esSala && 'absolute w-[76px]',
                activa ? 'border-brass-500' : 'border-stroke-edge hover:border-brass-600',
                despachado && !activa && 'opacity-70',
            )}
            style={esSala && rumbo ? { left: `${rumbo.izquierda}%`, top: `${rumbo.arriba}px` } : undefined}
            /* El centrado sobre el rumbo y la profundidad viajan por Framer y
               NO por `style`: Framer se adueña de `transform` para animar `y`,
               y un `transform` escrito a mano en `style` lo pisa —los asientos
               de la Sala salían medio ancho a la derecha de su posición y la
               lámpara no caía sobre ninguno—. */
            animate={{
                x: esSala ? '-50%' : 0,
                scale: esSala && rumbo ? rumbo.escala : 1,
                y: hablando && !reducido ? -2 : 0,
            }}
            transition={conMovimiento(reducido, SPRING_PLATE)}
        >
            <span
                aria-hidden="true"
                className="flex h-6 w-6 items-center justify-center rounded-xs border text-xs font-bold leading-none"
                style={{ color: colorDeAgente(rol, hex), borderColor: colorDeAgenteAlpha(rol, hex, 35), backgroundColor: colorDeAgenteAlpha(rol, hex, 12) }}
            >
                {inicial}
            </span>
            {confianza === null ? (
                <span className="h-5" aria-hidden="true" />
            ) : (
                <ConfidenceNeedle
                    valor={confianza}
                    etiqueta={corto}
                    tamano="banda"
                    decorativa
                />
            )}
            <span
                aria-hidden="true"
                className="w-full truncate text-center font-mono text-micro uppercase leading-none text-content-muted"
            >
                {esSala ? corto : rol}
            </span>
            {/* §8.11: el punto de 4px es el único bucle presupuestado de esta
                superficie, y sólo corre mientras hay un turno de verdad en
                curso. Con movimiento reducido la regla global de §7.6 lo
                congela encendido y la información se conserva. */}
            {hablando && (
                <span
                    aria-hidden="true"
                    className="punto-hablando absolute -top-1 right-1 h-1 w-1 rounded-full bg-accent"
                />
            )}
            {/* Filete de identidad al pie: §2.8 dice que los hex de agente no
                valen como texto, así que la identidad va en el filete. */}
            <span
                aria-hidden="true"
                className="absolute inset-x-1 bottom-0 h-0.5 rounded-full"
                style={{ backgroundColor: activa || hablando ? colorDeAgente(rol, hex) : 'transparent' }}
            />
        </motion.button>
    );
}

interface BoardTableProps {
    board: BoardSessionState;
    agents: Agent[];
    /** Última intervención por rol, para citarla en el asiento en foco (§8.1). */
    intervencionPorRol?: Record<string, string>;
}

export function BoardTable({ board, agents, intervencionPorRol }: BoardTableProps) {
    const reducido = useReducedMotion();
    const esSala = useMediaQuery('(min-width: 64rem)');
    const [fijado, setFijado] = useState<string | null>(null);

    const roles = useMemo(() => {
        const lista = ['CEO', ...board.participants.filter((r) => r !== 'CEO')];
        if (board.devil && !lista.includes('DEVIL')) lista.push('DEVIL');
        return lista;
    }, [board.participants, board.devil]);

    /* 5.12 · Q13 — las dos pistas de la mesa. Los hooks van antes del early
       return de abajo: llamarlos condicionalmente rompería las reglas de
       hooks, y el `activo` es justo lo que evita que se gasten cuando la cosa
       que explican todavía no está en pantalla. */
    const hablando = roles.find((r) => board.statusByRole[r] === 'speaking') ?? null;
    const enFoco = (fijado && roles.includes(fijado) ? fijado : null) ?? hablando ?? roles[0] ?? null;
    const indice = Math.max(0, roles.indexOf(enFoco ?? ''));
    const arco = useMemo(() => rumbos(roles.length), [roles.length]);

    const pistaMesa = useFirstTimeHint('mesa', roles.length > 0);
    const pistaAguja = useFirstTimeHint(
        'aguja',
        enFoco !== null && typeof board.votes[enFoco]?.confidence === 'number',
    );

    if (roles.length === 0 || enFoco === null) return null;

    const agenteEnFoco = getBoardAgentByRole(agents, enFoco);
    const votoEnFoco = board.votes[enFoco];
    const hexEnFoco = agenteEnFoco?.hexColor || AGENT_HEX.custom;

    const irA = (i: number, contenedor?: HTMLElement | null) => {
        const destino = roles[(i + roles.length) % roles.length];
        setFijado(destino);
        contenedor?.querySelector<HTMLElement>(`[data-asiento="${destino}"]`)?.focus();
    };

    const alTeclear = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const salto: Record<string, number | 'inicio' | 'fin'> = {
            ArrowRight: 1,
            ArrowLeft: -1,
            ArrowDown: 1,
            ArrowUp: -1,
        };
        if (e.key === 'Home' || e.key === 'End') {
            e.preventDefault();
            irA(e.key === 'Home' ? 0 : roles.length - 1, e.currentTarget);
            return;
        }
        const d = salto[e.key];
        if (typeof d !== 'number') return;
        e.preventDefault();
        irA(indice + d, e.currentTarget);
    };

    const alSoltar = (_e: unknown, info: PanInfo) => {
        // §8.1: umbral de 40px. El arrastre nativo de Framer, sin listeners de
        // scroll propios.
        if (Math.abs(info.offset.x) < 40) return;
        setFijado(roles[(indice + (info.offset.x < 0 ? 1 : -1) + roles.length) % roles.length]);
    };

    // La lámpara se desliza en porcentaje de SU PROPIO ancho, que es el del
    // contenedor: sirve igual para la banda y para el arco.
    const lamparaX = esSala
        ? (arco[indice]?.izquierda ?? 50) - 50
        : ((indice + 0.5) / roles.length - 0.5) * 100;
    const lamparaY = esSala ? (arco[indice]?.arriba ?? 0) - 24 : 0;

    return (
        <section aria-label="La mesa de la junta" className="lg:flex lg:flex-wrap lg:items-start lg:gap-x-4">
            {/* 5.12 · Q13 — la pista de la mesa, la primera vez que hay mesa.
                El orden de los asientos es la primera pregunta que se hace
                cualquiera al ver la banda, y no se contestaba en ningún sitio. */}
            {/* FASE 8 — era `lg:absolute lg:z-20` y en la Sala caía ENCIMA de
                las placas: a 1280 y a 1440 tapaba CEO, CTO y CFO (57-84% de su
                área, medido) y el click del primer uso se lo quedaba la nota.
                Ahora ocupa su propia fila bajo la mesa. */}
            {pistaMesa.mostrar && (
                <Pista
                    onDescartar={pistaMesa.descartar}
                    className="mb-2 lg:order-last lg:mb-0 lg:mt-2 lg:basis-full"
                    testId="pista-mesa"
                >
                    El CEO preside la mesa; a su lado se sientan los directores convocados
                    para esta decisión. El punto de latón marca a quien tiene la palabra.
                </Pista>
            )}
            {/* ── El Palco: la banda con TODOS los asientos ──────────────── */}
            <div
                className={cn(
                    'relative shrink-0 overflow-hidden',
                    esSala ? 'h-[184px] flex-1' : 'mx-auto w-full py-2',
                )}
                /* El Palco reparte el ancho en columnas iguales y se recorta al
                   ancho natural de sus placas (§8.1: 48-56px, y estrechan hasta
                   44 antes de plantearse una segunda fila). Que la banda tenga
                   exactamente el ancho de sus columnas es lo que deja la
                   lámpara alineada con la placa: su recorrido es un porcentaje
                   del contenedor, no una medida del DOM. */
                style={esSala ? undefined : { maxWidth: roles.length * 60 }}
            >
                <motion.div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0"
                    animate={{ x: `${lamparaX}%`, y: lamparaY }}
                    transition={conMovimiento(reducido, {
                        duration: DURACION.panel,
                        ease: CURVA.travel,
                    })}
                >
                    <span className="palco-lampara" />
                </motion.div>

                <div
                    role="tablist"
                    aria-label="Directores de la junta"
                    aria-orientation="horizontal"
                    onKeyDown={alTeclear}
                    className={cn('relative', esSala ? 'h-full' : 'grid items-end gap-1')}
                    style={esSala ? undefined : { gridTemplateColumns: `repeat(${roles.length}, minmax(0, 1fr))` }}
                >
                    {roles.map((rol, i) => {
                        const agente = getBoardAgentByRole(agents, rol);
                        const voto = board.votes[rol];
                        return (
                            <Placa
                                key={rol}
                                rol={rol}
                                agente={agente}
                                hex={agente?.hexColor || AGENT_HEX.custom}
                                activa={rol === enFoco}
                                hablando={rol === hablando}
                                despachado={board.statusByRole[rol] === 'done'}
                                confianza={typeof voto?.confidence === 'number' ? voto.confidence : null}
                                esSala={esSala}
                                rumbo={arco[i] ?? null}
                                reducido={reducido}
                                onElegir={() => setFijado(rol)}
                            />
                        );
                    })}
                </div>
            </div>

            {/* ── El asiento en foco ─────────────────────────────────────── */}
            <motion.div
                id="asiento-en-foco"
                role="tabpanel"
                aria-labelledby={`asiento-placa-${enFoco}`}
                tabIndex={0}
                key={enFoco}
                drag={reducido ? false : 'x'}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.12}
                onDragEnd={alSoltar}
                initial={reducido ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={conMovimiento(reducido, { duration: DURACION.pop, ease: CURVA.settle })}
                className="mt-2 rounded-md border border-stroke-edge bg-surface-2 p-3 shadow-e2 lg:mt-0 lg:w-[300px] lg:shrink-0 touch-pan-y"
            >
                <div className="flex items-start gap-3">
                    <span
                        aria-hidden="true"
                        className="mt-0.5 h-8 w-1 shrink-0 rounded-full"
                        style={{ backgroundColor: colorDeAgente(enFoco, hexEnFoco) }}
                    />
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-content-strong">
                            {agenteEnFoco?.name ?? enFoco}
                        </p>
                        <p className="font-mono text-micro uppercase text-content-muted">
                            {enFoco === hablando ? 'Tiene la palabra' : board.statusByRole[enFoco] === 'done' ? 'Ha terminado' : 'En la mesa'}
                        </p>
                    </div>
                    {votoEnFoco && (
                        <ConfidenceNeedle
                            valor={votoEnFoco.confidence ?? 0}
                            etiqueta={nombreCorto(agenteEnFoco?.name, enFoco)}
                            tamano="asiento"
                            mostrarCifra
                            className="shrink-0"
                        />
                    )}
                </div>

                {votoEnFoco && (
                    <div className="mt-2">
                        <VoteChip decision={votoEnFoco.decision} confidence={votoEnFoco.confidence} />
                    </div>
                )}

                {/* 5.12 · Q13 — la pista de la aguja, la primera vez que hay un
                    voto que mirar. Enseñar el umbral de 70 CUANDO la aguja se
                    mueve es la única vez que el usuario tiene contexto para
                    entenderlo; el checklist lo explicaba en abstracto en la
                    pantalla de bienvenida, o sea nunca. */}
                {pistaAguja.mostrar && (
                    <Pista onDescartar={pistaAguja.descartar} className="mt-2" testId="pista-aguja">
                        La aguja mide la confianza del voto. Pasado el 70 se tiñe de oxblood:
                        una certeza alta, a favor o en contra, es lo que más pesa en el acta.
                    </Pista>
                )}

                {intervencionPorRol?.[enFoco] && (
                    <blockquote className="mt-2 border-l-2 border-stroke-edge pl-2 text-xs italic text-content-muted line-clamp-3">
                        {intervencionPorRol[enFoco]}
                    </blockquote>
                )}

                {fijado && (
                    <button
                        type="button"
                        onClick={() => setFijado(null)}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-xs border border-stroke-edge px-2 py-1 font-mono text-micro uppercase text-content-muted transition-colors duration-(--duration-tap) hover:border-brass-600 hover:text-content-strong"
                    >
                        <Users className="h-3 w-3" aria-hidden="true" />
                        Seguir la sala
                    </button>
                )}
            </motion.div>
        </section>
    );
}
