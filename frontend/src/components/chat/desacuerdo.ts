/**
 * El grado de desacuerdo, como dato — PLAN §6 Q8, DESIGN §P2.
 *
 * «La interfaz existe para hacer visible el conflicto entre directores.» Hasta
 * aquí, la cabecera decía el RECUENTO («2 a favor · 1 en contra») y dejaba al
 * usuario la aritmética de qué significa eso. Y no significa lo mismo un 2-1
 * donde el que discrepa lo hace con un 91% de confianza que uno donde lo hace
 * con un 55%: el primero es una junta partida, el segundo es una mayoría con
 * una reserva. Ésa es la lectura que este módulo calcula.
 *
 * Es un `.ts` sin JSX a propósito: la regla `react-refresh/only-export-components`
 * no deja que el fichero del componente exporte además la función pura, y esta
 * función es justo lo que hay que poder probar sin montar nada.
 *
 * El umbral de 70 no es nuevo: es el mismo de la Aguja de Confianza (§8.2), que
 * cruza a oxblood pasado el 70 «en cualquier dirección de voto, porque la
 * certeza alta a favor o en contra es la información que más importa».
 */
import type { BoardVote } from '@/types';

/** Umbral de certeza de §8.2. Por encima, el voto pesa. */
export const UMBRAL_DE_CONFIANZA = 70;

export type NivelDeDesacuerdo = 'sin-datos' | 'unanime' | 'mayoria' | 'dividida';

export interface GradoDeDesacuerdo {
    nivel: NivelDeDesacuerdo;
    /** El veredicto en dos palabras: lo primero que se quiere saber. */
    etiqueta: string;
    /** La frase larga, para el nombre accesible y el `title`. */
    detalle: string;
    /** 0-100. Es la medida que expone el `role="meter"`. */
    grado: number;
    /** Recuento por decisión, ya normalizado a los tres valores. */
    recuento: { SI: number; NO: number; CONDICIONAL: number };
    total: number;
    /** Confianza más alta entre los votos que NO son de la mayoría. */
    confianzaDelDisenso: number | null;
}

const VACIO: GradoDeDesacuerdo['recuento'] = { SI: 0, NO: 0, CONDICIONAL: 0 };

function frase(recuento: GradoDeDesacuerdo['recuento']): string {
    const partes = [
        recuento.SI ? `${recuento.SI} a favor` : null,
        recuento.NO ? `${recuento.NO} en contra` : null,
        recuento.CONDICIONAL ? `${recuento.CONDICIONAL} condicional` : null,
    ].filter(Boolean);
    return partes.join(', ');
}

/**
 * Calcula el grado de desacuerdo a partir de los votos del debate.
 *
 * `votes` es lo que ya vive en el store (`boardSession.votes`), un voto por
 * director con su decisión y su confianza. `tally` no hace falta: se deriva de
 * los votos, y derivarlo aquí evita que las dos cifras puedan discrepar.
 */
export function gradoDeDesacuerdo(
    votes: Record<string, BoardVote> | null | undefined,
): GradoDeDesacuerdo {
    const lista = Object.values(votes ?? {});
    const recuento = { ...VACIO };
    for (const v of lista) {
        if (v.decision === 'SI' || v.decision === 'NO' || v.decision === 'CONDICIONAL') {
            recuento[v.decision] += 1;
        }
    }
    const total = recuento.SI + recuento.NO + recuento.CONDICIONAL;

    // Un voto solo no es un desacuerdo, y cero votos no es nada. Enseñar
    // «Unanimidad» con un único director sería una mentira estadística.
    if (total < 2) {
        return {
            nivel: 'sin-datos',
            etiqueta: total === 1 ? 'Un voto' : 'Sin votos',
            detalle: total === 1
                ? 'Todavía sólo ha votado un director.'
                : 'La junta aún no ha votado.',
            grado: 0,
            recuento,
            total,
            confianzaDelDisenso: null,
        };
    }

    const mayor = Math.max(recuento.SI, recuento.NO, recuento.CONDICIONAL);
    const decisionMayoritaria = (
        ['SI', 'NO', 'CONDICIONAL'] as const
    ).filter((d) => recuento[d] === mayor);
    const disidentes = lista.filter(
        (v) => !(decisionMayoritaria.length === 1 && v.decision === decisionMayoritaria[0]),
    );
    const confianzaDelDisenso = disidentes.length
        ? Math.max(...disidentes.map((v) => v.confidence ?? 0))
        : null;

    if (mayor === total) {
        // Todos han votado lo mismo. Sigue siendo interesante CUÁNTO: una
        // unanimidad con confianzas de 55 no es la misma señal que una de 90.
        const confianzaMedia = Math.round(
            lista.reduce((suma, v) => suma + (v.confidence ?? 0), 0) / total,
        );
        return {
            nivel: 'unanime',
            etiqueta: 'Unanimidad',
            detalle: `Los ${total} directores votan lo mismo: ${frase(recuento)}. Confianza media del ${confianzaMedia}%.`,
            grado: 0,
            recuento,
            total,
            confianzaDelDisenso: null,
        };
    }

    // Cuánto pesa la minoría sobre el total: 2-1 → 33, 2-2 → 50.
    const pesoDeLaMinoria = Math.round(((total - mayor) / total) * 100);
    const disensoConCerteza =
        confianzaDelDisenso !== null && confianzaDelDisenso >= UMBRAL_DE_CONFIANZA;
    // Empate real o disenso por encima del umbral de §8.2: junta partida. Una
    // discrepancia con un 55% de confianza es una reserva, no una fractura.
    const dividida = mayor * 2 <= total || disensoConCerteza;

    return {
        nivel: dividida ? 'dividida' : 'mayoria',
        etiqueta: dividida ? 'Junta dividida' : 'Mayoría con reserva',
        detalle: dividida
            ? `${frase(recuento)}${
                confianzaDelDisenso !== null
                    ? `. El disenso vota con un ${confianzaDelDisenso}% de confianza`
                    : ''
            }.`
            : `${frase(recuento)}${
                confianzaDelDisenso !== null
                    ? `. La reserva se expresa con un ${confianzaDelDisenso}% de confianza`
                    : ''
            }.`,
        // Un disenso con certeza cuenta más que su peso numérico: es lo que P2
        // pide que se encuentre antes.
        grado: Math.min(100, disensoConCerteza ? Math.max(pesoDeLaMinoria, 60) : pesoDeLaMinoria),
        recuento,
        total,
        confianzaDelDisenso,
    };
}
