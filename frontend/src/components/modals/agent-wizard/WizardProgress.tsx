/**
 * La barra de pasos (D41).
 *
 * Es NAVEGACIÓN, no decoración: los pasos ya hechos son botones de verdad y
 * llevan de vuelta, y los que aún no tocan van `disabled` —no sólo apagados con
 * color— para que el teclado no se meta en un paso al que el formulario todavía
 * no da derecho.
 *
 * `aria-current="step"` marca dónde está el usuario, que es lo que un lector de
 * pantalla necesita para no perder el hilo entre cuatro pantallas iguales.
 */
import { cn } from '@/lib/utils';
import { STEPS } from './constants';
import type { WizardStep } from './types';

interface WizardProgressProps {
    step: WizardStep;
    onGoTo: (step: WizardStep) => void;
}

export function WizardProgress({ step, onGoTo }: WizardProgressProps) {
    return (
        <div className="px-5 pt-4 pb-2 shrink-0">
            <div className="flex items-center gap-2" role="group" aria-label="Pasos del asistente">
                {STEPS.map((s, i) => {
                    const StepIcon = s.icon;
                    const isActive = i === step;
                    const isDone = i < step;
                    return (
                        <div key={i} className="flex items-center gap-2 flex-1">
                            <button
                                type="button"
                                onClick={() => i < step && onGoTo(i as WizardStep)}
                                disabled={i > step}
                                aria-current={isActive ? 'step' : undefined}
                                className={cn(
                                    'flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all',
                                    isActive && 'bg-electric-cyan/10 text-electric-cyan',
                                    isDone && 'bg-stroke-highlight text-content-muted hover:bg-stroke-hairline cursor-pointer',
                                    !isActive && !isDone && 'text-content-quiet cursor-not-allowed',
                                )}
                            >
                                <StepIcon className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">{s.label}</span>
                            </button>
                            {i < STEPS.length - 1 && (
                                <div className={cn(
                                    'flex-1 h-px transition-colors',
                                    i < step ? 'bg-electric-cyan/30' : 'bg-stroke-highlight',
                                )} />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
