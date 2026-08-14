import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/useMediaQuery';

/**
 * §8.12 «Las Cifras que Asientan» — el odómetro de contaduría.
 *
 * «Las cifras que importan (saldo de créditos, recuento de votos, confianza,
 * contador de actuaciones) no cambian por teletransporte: **ruedan** como un
 * contador mecánico de registro — el dígito saliente sube, el entrante llega
 * desde abajo — y el cambio queda subrayado un instante por un filete de latón
 * que se desvanece.»
 *
 * Tres decisiones que conviene no deshacer sin leer esto:
 *
 * 1. **Lo dirige el cambio de valor, nunca un reloj.** No hay setTimeout, no
 *    hay setInterval, no hay rAF. El rodillo es una animación CSS de una sola
 *    iteración que se relanza remontando el elemento (la `key` es el número de
 *    vuelta). Un contador que corre solo estaría inventando movimiento donde no
 *    ha pasado nada, y §7.4 lo rechaza por nombre.
 * 2. **Sólo se parte en dígitos cuando hay algo que rodar.** En reposo la cifra
 *    es un único nodo de texto: así el número sigue siendo legible como número
 *    para quien lo lee y para quien lo busca.
 * 3. **El dígito SALIENTE no es texto: es un pseudo-elemento alimentado por un
 *    atributo de datos.** Se descubrió probando, y no es cosmético. Si el
 *    saliente fuese un nodo de texto, el contenido del odómetro durante los
 *    160ms del rodillo sería la mezcla de los dos números (9 → 10 se leía
 *    «190»): un lector de pantalla lo diría, una búsqueda en la página lo
 *    encontraría y cualquier consulta por texto de la app se caería justo
 *    mientras la cifra cambia. Como pseudo-elemento, el saliente es lo que de
 *    verdad es —decoración de la transición— y el texto del componente es
 *    siempre y sólo la cifra vigente.
 *
 * Movimiento reducido (§7.6 y la letra de §8.12): «el dígito cambia sin
 * rodillo; el subrayado de latón se mantiene». O sea que el cambio es seco pero
 * la señal de «esto acaba de cambiar» NO se pierde — se queda puesta en vez de
 * desvanecerse, porque un desvanecido de 1ms (que es lo que le impondría la
 * regla global de §7.6) no es una señal, es un parpadeo.
 */

interface OdometroProps {
    /** La cifra a mostrar. Al cambiar, rueda. */
    valor: number;
    /**
     * Lo que va pegado delante de la cifra y forma parte de ella: el «+» de los
     * créditos comprados, un «€», un signo. Va DENTRO del componente y no fuera
     * a propósito: si el signo viviese en el elemento de al lado, la cifra
     * dejaría de ser un solo texto para quien la lee y para quien la busca.
     */
    prefijo?: string;
    className?: string;
}

interface Rodillo {
    /** De dónde viene la cifra. */
    de: number;
    /** Cuántas vueltas lleva: es la `key` que relanza la animación. */
    vuelta: number;
}

/** Los caracteres de `texto` alineados a la derecha dentro de `ancho` huecos. */
function porHueco(texto: string, ancho: number): string[] {
    const hueco = ancho - texto.length;
    return Array.from({ length: ancho }, (_, i) => texto[i - hueco] ?? '');
}

export function Odometro({ valor, prefijo, className }: OdometroProps) {
    const reducido = useMediaQuery('(prefers-reduced-motion: reduce)');
    const ultimo = useRef(valor);
    const vueltas = useRef(0);
    const [rodillo, setRodillo] = useState<Rodillo | null>(null);

    // De efecto de LAYOUT y no de efecto normal: se ejecuta antes de pintar, o
    // sea que el navegador nunca llega a enseñar el fotograma con la cifra
    // nueva ya puesta y el rodillo sin arrancar. Con `useEffect` habría un
    // fotograma de salto seguido del rodillo, que es justo el teletransporte
    // que esto viene a quitar.
    useLayoutEffect(() => {
        if (ultimo.current === valor) return;
        const de = ultimo.current;
        ultimo.current = valor;
        vueltas.current += 1;
        setRodillo({ de, vuelta: vueltas.current });
    }, [valor]);

    const cifra = String(valor);

    if (!rodillo) {
        return (
            <span data-testid="odometro" className={cn('odometro tnum', className)}>
                {prefijo}{cifra}
            </span>
        );
    }

    const anterior = String(rodillo.de);
    const ancho = Math.max(cifra.length, anterior.length);
    const entrantes = porHueco(cifra, ancho);
    const salientes = porHueco(anterior, ancho);

    return (
        <span data-testid="odometro" className={cn('odometro tnum', className)}>
            {prefijo}
            {entrantes.map((entrante, i) => {
                const saliente = salientes[i];
                const rueda = !reducido && saliente !== entrante;
                return (
                    <span
                        key={i}
                        data-testid="odometro-digito"
                        data-rueda={rueda ? 'si' : 'no'}
                        className="odometro-digito"
                    >
                        {rueda ? (
                            <span
                                key={rodillo.vuelta}
                                data-testid="odometro-saliente"
                                data-saliente={saliente}
                                className="odometro-rodillo"
                            >
                                <span className="odometro-entrante">{entrante}</span>
                            </span>
                        ) : (
                            entrante
                        )}
                    </span>
                );
            })}
            <span
                key={`senal-${rodillo.vuelta}`}
                data-testid="odometro-senal"
                data-persistente={reducido ? 'si' : 'no'}
                className="odometro-senal"
                aria-hidden="true"
            />
        </span>
    );
}
