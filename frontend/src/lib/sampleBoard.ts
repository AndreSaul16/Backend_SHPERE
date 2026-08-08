/**
 * La junta de muestra, pregrabada — PLAN §6 Q7 (tarea 5.10).
 *
 * `docs/BOARD_FRONTERA_Y_QA §5.4` la pedía y seguía abierta: una cuenta nueva
 * llega, ve un botón que dice «Convocar junta · 5 créditos» y no tiene ni idea
 * de qué va a pasar cuando lo pulse. Esto lo enseña **sin gastar un crédito**:
 * es el mismo reproductor de Q7 sobre datos horneados aquí.
 *
 * Por qué el guion está escrito a mano y no es una captura de producción: una
 * captura trae el nombre de la empresa de alguien y su decisión real, y esto se
 * enseña a todo el que abre una cuenta. Además una muestra tiene que enseñar el
 * caso INTERESANTE —una junta dividida, con el CFO discrepando con confianza
 * alta— y no el 2-0 sin gracia que suele salir.
 *
 * Los roles y las fases son los del backend (`board_v2.py`: opening → analysis
 * → rebuttal → devil → synthesis), así que el reproductor no distingue esta
 * junta de una de verdad.
 */
import type { BoardPhase, BoardVote, Message, Role } from '@/types';

interface TurnoDeMuestra {
    role: string;
    phase: BoardPhase;
    content: string;
    vote?: BoardVote;
}

const GUION: TurnoDeMuestra[] = [
    {
        role: 'CEO',
        phase: 'opening',
        content:
            'Abro la sesión. La decisión sobre la mesa: subir el precio del plan de 29 a 49 euros al mes, con los clientes actuales congelados un año. Quiero de cada uno una posición y su confianza. Empieza el análisis.',
    },
    {
        role: 'CFO',
        phase: 'analysis',
        content:
            '**En contra, y con pocas dudas.** El margen no es el problema: el problema es la cola larga. El 41% de los ingresos recurrentes viene de cuentas por debajo de los 50 euros al mes, y ese tramo es el que trae las recomendaciones. Un salto del 69% de golpe no es un ajuste de precio, es cambiar de cliente.',
        vote: { decision: 'NO', confidence: 91 },
    },
    {
        role: 'CTO',
        phase: 'analysis',
        content:
            '**A favor, con reservas técnicas.** La plataforma aguanta el tramo alto sin tocar nada: el coste marginal por cuenta es prácticamente cero. Lo que no aguanta es una migración de precios a mitad de trimestre — necesitamos dos semanas para el prorrateo y las facturas.',
        vote: { decision: 'SI', confidence: 82 },
    },
    {
        role: 'CMO',
        phase: 'analysis',
        content:
            '**Condicional.** El precio no es el mensaje: hoy vendemos «un asistente» y a 49 hay que vender «una junta directiva». Si subimos sin cambiar la promesa, la conversión cae y lo achacaremos al precio, que es lo cómodo. Con la promesa nueva, me la juego a que sube.',
        vote: { decision: 'CONDICIONAL', confidence: 74 },
    },
    {
        role: 'CFO',
        phase: 'rebuttal',
        content:
            'Al CTO: que el coste marginal sea cero no justifica el precio, lo justifica el valor percibido, y ése todavía no lo hemos medido. Pido una prueba con cohortes antes de tocar la lista.',
    },
    {
        role: 'CTO',
        phase: 'rebuttal',
        content:
            'Acepto la prueba con cohortes, pero no la uses para aplazar la decisión seis meses. Dos cohortes, cuatro semanas, y volvemos a esta mesa con datos.',
    },
    {
        role: 'DEVIL',
        phase: 'devil',
        content:
            'Una objeción que nadie ha puesto: los clientes congelados un año son un problema DIFERIDO, no resuelto. Dentro de doce meses hay que subírselo a todos a la vez, y para entonces habrán construido encima. La cancelación no se evita, se aplaza y se concentra.',
    },
    {
        role: 'CEO',
        phase: 'synthesis',
        content:
            '## Recomendación\n\nSubir a 49, **pero no ahora y no así**. Cuatro semanas de prueba con dos cohortes y la promesa reescrita; si la conversión aguanta, se sube en el siguiente trimestre con el prorrateo listo.\n\nEl congelado de un año se sustituye por una escalera de tres tramos: la objeción del diablo es correcta y una subida diferida en bloque concentra la cancelación en vez de evitarla.\n\n## Próximos pasos\n\n- Definir las dos cohortes y la métrica de corte\n- Reescribir la promesa de la página de precios\n- Preparar el prorrateo y las facturas\n- Volver a esta mesa en cuatro semanas con los datos',
        vote: { decision: 'CONDICIONAL', confidence: 78 },
    },
];

/** El identificador de la sesión de muestra. No es una sesión real del backend. */
export const SESION_DE_MUESTRA = 'muestra';

/** La consulta que abrió la junta, para pintarla como primer turno. */
export const CONSULTA_DE_MUESTRA =
    '¿Subimos el precio del plan de 29 a 49 euros al mes? Nuestro público son fundadores en solitario y equipos de menos de diez personas.';

/**
 * Los turnos, como los devolvería el historial.
 *
 * Las marcas de tiempo se calculan desde una base fija y no desde `Date.now()`:
 * así dos llamadas dan lo mismo y la muestra no cambia entre renders — que es lo
 * que haría que el reproductor la tratara como contenido nuevo.
 */
const BASE = new Date('2026-07-12T10:00:00Z').getTime();

export function mensajesDeMuestra(): Message[] {
    const turnos: Message[] = [
        {
            id: 'muestra-0',
            role: 'user',
            content: CONSULTA_DE_MUESTRA,
            timestamp: new Date(BASE),
        },
    ];
    GUION.forEach((t, i) => {
        turnos.push({
            id: `muestra-${i + 1}`,
            role: t.role as Role,
            content: t.content,
            timestamp: new Date(BASE + (i + 1) * 12_000),
            phase: t.phase,
            ...(t.vote ? { vote: t.vote } : {}),
            isConclusion: t.phase === 'synthesis',
        });
    });
    return turnos;
}

/** El acta de la muestra: la síntesis del CEO, que es lo que el backend guarda. */
export function actaDeMuestra(): string {
    const sintesis = GUION.find((t) => t.phase === 'synthesis');
    return `# Acta de la junta · Precios 2026\n\n${sintesis?.content ?? ''}`;
}
