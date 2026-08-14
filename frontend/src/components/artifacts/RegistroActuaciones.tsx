import { Check, Wrench, X } from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';
import { TOOL_LABELS } from '@/components/chat/toolLabels';
import { Odometro } from '@/components/ui/Odometro';
import { cn } from '@/lib/utils';
import type { EstadoDeActuacion } from '@/store/chat/types';

/**
 * §8.7 «El Registro de Actuaciones» — el telégrafo de eventos reales.
 *
 * «El diferenciador del producto es que los agentes **actúan en el mundo**
 * (n8n: WhatsApp, Notion, GitHub, webhooks). Cada actuación real se asienta en
 * un registro visible (…) donde cada evento entra como una entrada de telégrafo
 * — glifo de la herramienta, etiqueta, hora — que se desliza desde el canto
 * derecho y se asienta. Al completarse, gana un check; si falla, el filete pasa
 * a oxblood. Las antiguas se comprimen a un contador: «+4 hoy».»
 *
 * **Ésta es la versión de una línea, que §8.7 declara caso base**: «en 390px
 * una cinta de 3 entradas robaría al transcript exactamente el espacio que el
 * debate necesita». Se ve la última actuación y el recuento de las anteriores,
 * con el rodillo de §8.12 en el contador.
 *
 * Tres reglas que gobiernan el fichero:
 *
 *  · **Cero coste en reposo.** Sin actuaciones no se monta ningún elemento
 *    animado. La región viva sí está siempre —vacía— porque varios lectores no
 *    anuncian una región que aparece a la vez que su contenido.
 *  · **Cero bucles.** La entrada nueva se desliza UNA vez y se queda quieta. La
 *    animación se relanza remontando el elemento (la `key` es el id de la
 *    actuación), que es lo que hace que cada telegrama entre por su cuenta sin
 *    que nada corra entre uno y otro.
 *  · **Lo dirigen los eventos, nunca un reloj.** El almacén sólo lo escriben
 *    `onToolStart`/`onToolResult`/`onToolError`.
 */

const HORA_CORTA = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });

/** El glifo dice en qué punto está la actuación; el color no va solo (P5). */
function Glifo({ estado }: { estado: EstadoDeActuacion }) {
    if (estado === 'hecha') return <Check className="h-3 w-3 text-success" aria-hidden="true" />;
    if (estado === 'fallida') return <X className="h-3 w-3 text-dissent" aria-hidden="true" />;
    return <Wrench className="h-3 w-3 text-accent" aria-hidden="true" />;
}

export function RegistroActuaciones({ className }: { className?: string }) {
    const registro = useChatStore((s) => s.registroDeActuaciones);

    const ultima = registro.length > 0 ? registro[registro.length - 1] : undefined;
    const anteriores = Math.max(0, registro.length - 1);
    const etiqueta = ultima ? TOOL_LABELS[ultima.herramienta] || ultima.herramienta : '';

    return (
        <ol
            role="log"
            aria-live="polite"
            aria-label="Registro de actuaciones"
            className={cn('registro-actuaciones', className)}
        >
            {ultima && (
                <li
                    /* La `key` es el id de la actuación, así que cada telegrama
                       nuevo monta su propio elemento y su animación arranca de
                       cero. Sin eso, el navegador reutilizaría el nodo y la
                       entrada siguiente aparecería sin entrar. */
                    key={ultima.id}
                    data-testid="actuacion-entrante"
                    data-estado={ultima.estado}
                    className={cn(
                        'actuacion-entrante',
                        ultima.estado === 'fallida' && 'actuacion-fallida',
                    )}
                    style={{
                        animationName: 'entrada-de-registro',
                        animationDuration: '160ms',
                        animationTimingFunction: 'var(--ease-settle)',
                        animationIterationCount: 1,
                        animationFillMode: 'both',
                    }}
                >
                    <Glifo estado={ultima.estado} />
                    <span className="truncate">{etiqueta}</span>
                    <time
                        dateTime={ultima.hora.toISOString()}
                        className="tnum text-content-quiet shrink-0"
                    >
                        {HORA_CORTA.format(ultima.hora)}
                    </time>
                    {anteriores > 0 && (
                        <span
                            data-testid="registro-anteriores"
                            className="text-content-quiet shrink-0"
                        >
                            {/* §8.7 pide el contador «con rodillo (§8.12)» —y es
                                el sitio donde más se nota: sube de uno en uno,
                                cada vez que un agente hace algo de verdad. */}
                            <Odometro valor={anteriores} prefijo="+" />
                        </span>
                    )}
                </li>
            )}
        </ol>
    );
}
