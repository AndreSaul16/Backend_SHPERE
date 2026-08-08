import { useMemo } from 'react';
import { useChatStore } from '@/store/useChatStore';
import { ActaSeal } from './ActaSeal';

/**
 * La cabecera de la hoja del acta — DESIGN §5.3 y tarea 2.1: «fecha y
 * recuento». Y el sitio donde aterriza el Sello (§8.3).
 *
 * Por qué la fecha y el recuento van AQUÍ y no se leen del markdown: el cuerpo
 * del acta lo escribe un modelo, así que a veces trae su propio bloque
 * «Sesión / Fecha / Quórum» y a veces no. Estos dos datos son del producto —la
 * fecha del artefacto y los votos que el store tiene registrados—, así que
 * salen siempre y salen ciertos. Si el acta además los repite en su texto, se
 * lee como el encabezamiento de un acta de verdad, que es lo que es.
 *
 * El recuento usa el vocabulario canónico de §11: «recuento», «a favor», «en
 * contra», «condicional». Nada de porcentajes agregados: el detalle por
 * director está en el hilo.
 */

const FECHA_LARGA = new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
});

interface ActaHeaderProps {
    /** Identifica el acta: elige el sangrado del sello y lo estampa una vez. */
    actaId: string;
    /** Fecha de cierre del acta. */
    date: Date;
}

export function ActaHeader({ actaId, date }: ActaHeaderProps) {
    // Selectores estrechos: esta cabecera vive dentro del panel de artefactos y
    // no puede re-renderizar con cada token del stream.
    const currentSessionId = useChatStore((s) => s.currentSessionId);
    const messagesBySession = useChatStore((s) => s.messagesBySession);
    const streamingSessionIds = useChatStore((s) => s.streamingSessionIds);

    const recuento = useMemo(() => {
        const mensajes = currentSessionId ? messagesBySession[currentSessionId] ?? [] : [];
        const cuenta = { favor: 0, contra: 0, condicional: 0 };
        for (const m of mensajes) {
            if (!m.vote) continue;
            if (m.vote.decision === 'SI') cuenta.favor++;
            else if (m.vote.decision === 'NO') cuenta.contra++;
            else if (m.vote.decision === 'CONDICIONAL') cuenta.condicional++;
        }
        return cuenta;
    }, [currentSessionId, messagesBySession]);

    const votos = recuento.favor + recuento.contra + recuento.condicional;

    // §8.3: el sello cae «cuando el CEO cierra el acta». Mientras la junta
    // sigue hablando el acta no está cerrada, así que no se sella: un sello
    // sobre un documento que todavía crece sería una mentira, y además el
    // aterrizaje —que sucede una sola vez— se gastaría en el momento
    // equivocado.
    const cerrada = !currentSessionId || !streamingSessionIds.includes(currentSessionId);

    const partes: string[] = [];
    if (recuento.favor) partes.push(`${recuento.favor} a favor`);
    if (recuento.contra) partes.push(`${recuento.contra} en contra`);
    if (recuento.condicional) partes.push(`${recuento.condicional} condicional`);

    return (
        <header className="mb-6 flex items-start justify-between gap-4 border-b border-stroke-hairline pb-4">
            <div className="min-w-0 space-y-1">
                <p className="text-micro font-sans uppercase text-content-quiet">
                    Acta de la junta
                </p>
                <p className="text-sm font-sans tabular-nums text-content-muted">
                    <time dateTime={date.toISOString().slice(0, 10)}>
                        {FECHA_LARGA.format(date)}
                    </time>
                </p>
                {votos > 0 && (
                    <p className="text-micro font-sans uppercase tabular-nums text-content-muted">
                        Recuento · {partes.join(' · ')}
                    </p>
                )}
            </div>

            {/* El tampón se elige por el id de SESIÓN, no por el del artefacto:
                el artefacto se re-crea con un uuid nuevo en cada carga del
                historial, así que hashearlo daría un sangrado distinto cada vez
                que se abre la misma acta. La junta es la que tiene su sello. */}
            {cerrada && (
                <ActaSeal sessionId={currentSessionId ?? actaId} date={date} className="-mt-1" />
            )}
        </header>
    );
}
