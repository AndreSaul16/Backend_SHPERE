/**
 * 6.11 — el conmutador de tema, tres estados.
 *
 * Mismo patrón que el conmutador de densidad de §4.4: tres radios de verdad
 * dentro de un `<fieldset>`, no tres botones con `aria-pressed`. Son opciones
 * excluyentes de un mismo ajuste, y los radios traen de serie el recorrido con
 * flechas y el «2 de 3» que un grupo de botones no da.
 *
 * **Se aplica al elegir, sin botón de guardar.** Un tema que hay que confirmar
 * aparte se queda sin confirmar la mitad de las veces y el usuario cree que la
 * opción está rota — que es literalmente lo que pasaba antes (D61), aunque por
 * otro motivo. Además, el efecto de elegirlo se ve en el acto en toda la
 * pantalla: no hace falta ningún acuse.
 *
 * Bajo «Sistema» se dice cuál está siguiendo ahora mismo. Sin eso, «Sistema» es
 * la única de las tres opciones cuyo resultado no se puede predecir leyéndola.
 */
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import type { Tema } from '@/lib/tema';

const OPCIONES: { valor: Tema; etiqueta: string; detalle: string; icono: typeof Sun }[] = [
    { valor: 'system', etiqueta: 'Sistema', detalle: 'Sigue lo que tenga puesto tu aparato.', icono: Monitor },
    { valor: 'dark', etiqueta: 'Paño', detalle: 'La sala capitular, en verde oscuro.', icono: Moon },
    { valor: 'light', etiqueta: 'Papel', detalle: 'Fondo claro, para leer con luz de día.', icono: Sun },
];

export interface ConmutadorDeTemaProps {
    /**
     * Aviso a quien lo compone. `ProfileSettings` lo usa para escribir además
     * el campo del perfil, que es lo que hereda un aparato nuevo. El tema ya
     * está aplicado y guardado localmente cuando esto se llama.
     */
    onElegir?: (tema: Tema) => void;
}

export function ConmutadorDeTema({ onElegir }: ConmutadorDeTemaProps = {}) {
    const { tema, efectivo, elegir } = useTheme();

    const seleccionar = (valor: Tema) => {
        elegir(valor);
        onElegir?.(valor);
    };

    return (
        <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-content-muted">Tema</legend>
            <div className="grid gap-2 sm:grid-cols-3">
                {OPCIONES.map((opcion) => {
                    const Icono = opcion.icono;
                    const elegido = tema === opcion.valor;
                    return (
                        <label
                            key={opcion.valor}
                            className={`grid cursor-pointer grid-cols-[auto_1fr] items-start gap-x-2 gap-y-0.5 rounded-sm border p-3 transition-colors duration-(--duration-tap) ${
                                elegido
                                    ? 'border-brass-600 bg-accent/12'
                                    : 'border-stroke-hairline hover:border-stroke-control'
                            }`}
                        >
                            {/* El texto va DIRECTO bajo la etiqueta, sin envoltorio:
                                anidarlo un nivel más deja al `<label>` sin texto
                                accesible. Mismo motivo que en el de densidad. */}
                            <input
                                type="radio"
                                name="tema"
                                value={opcion.valor}
                                checked={elegido}
                                onChange={() => seleccionar(opcion.valor)}
                                className="row-span-2 mt-0.5 accent-brass-500"
                            />
                            <span className="flex min-w-0 items-center gap-1.5 text-sm text-content-strong">
                                <Icono className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                {opcion.etiqueta}
                            </span>
                            <span className="col-start-2 min-w-0 text-xs text-content-muted">
                                {opcion.detalle}
                            </span>
                        </label>
                    );
                })}
            </div>
            {tema === 'system' && (
                <p className="text-xs text-content-quiet">
                    Ahora mismo tu aparato pide el tema{' '}
                    <strong className="text-content-muted">
                        {efectivo === 'light' ? 'claro' : 'oscuro'}
                    </strong>
                    , y cambiará solo cuando él cambie.
                </p>
            )}
        </fieldset>
    );
}
