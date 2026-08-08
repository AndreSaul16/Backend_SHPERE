/**
 * Cómo piensa el director: prompt de sistema, temperatura y modelo.
 *
 * Segunda de las tres secciones de `AgentDetailPage.tsx` (7.3). La lista de
 * modelos ya no vive aquí: es `lib/modelos.ts`, la misma que usan el asistente
 * de creación y los ajustes por rol (D65/D66).
 */
import { memo } from 'react';
import { motion } from 'framer-motion';
import { Brain, Cpu, Thermometer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TextAreaField } from '@/components/ui/Field';
import { MODELOS } from '@/lib/modelos';
import type { BorradorDeAgente } from './tipos';

interface Props {
    borrador: BorradorDeAgente;
    cambiar: <K extends keyof BorradorDeAgente>(campo: K, valor: BorradorDeAgente[K]) => void;
}

export const SeccionCerebro = memo(function SeccionCerebro({ borrador, cambiar }: Props) {
    const { systemPrompt, temperature, model, color } = borrador;
    const relleno = (temperature / 2) * 100;

    return (
        <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="p-6 sm:p-8 rounded-md bg-surface-2 border border-stroke-edge space-y-6"
        >
            <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-accent" />
                <h2 className="text-content-muted text-xs sm:text-sm uppercase tracking-widest font-mono">
                    Configuración Cerebral
                </h2>
            </div>

            {/* El recuento va como `hint`, o sea ligado con aria-describedby:
                antes era un <p> suelto que el lector no asociaba a nada. */}
            <TextAreaField
                label="System Prompt"
                id="agent-system-prompt"
                value={systemPrompt}
                onChange={(e) => cambiar('systemPrompt', e.target.value)}
                rows={10}
                placeholder="Eres un asistente experto en..."
                hint={`${systemPrompt.length} caracteres`}
                controlClassName="font-mono leading-relaxed resize-y min-h-[160px]"
            />

            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <label htmlFor="agent-temperature" className="text-micro text-content-muted uppercase font-mono ml-1 flex items-center gap-1.5">
                        <Thermometer className="h-3 w-3" aria-hidden="true" />
                        Temperatura
                    </label>
                    <span
                        className="text-sm font-mono font-bold px-2.5 py-1 rounded-lg border"
                        style={{
                            color,
                            borderColor: `${color}30`,
                            backgroundColor: `${color}10`,
                        }}
                    >
                        {temperature.toFixed(1)}
                    </span>
                </div>
                <div className="relative px-1">
                    <input
                        id="agent-temperature"
                        type="range"
                        min={0}
                        max={2}
                        step={0.1}
                        value={temperature}
                        onChange={(e) => cambiar('temperature', parseFloat(e.target.value))}
                        aria-valuetext={`${temperature.toFixed(1)} de 2`}
                        className="w-full h-2 rounded-full appearance-none cursor-pointer bg-surface-0 border border-stroke-hairline
                            [&::-webkit-slider-thumb]:appearance-none
                            [&::-webkit-slider-thumb]:h-5
                            [&::-webkit-slider-thumb]:w-5
                            [&::-webkit-slider-thumb]:rounded-full
                            [&::-webkit-slider-thumb]:border-2
                            [&::-webkit-slider-thumb]:border-stroke-control
                            [&::-webkit-slider-thumb]:shadow-lg
                            [&::-webkit-slider-thumb]:transition-transform
                            [&::-webkit-slider-thumb]:hover:scale-125
                            [&::-moz-range-thumb]:h-5
                            [&::-moz-range-thumb]:w-5
                            [&::-moz-range-thumb]:rounded-full
                            [&::-moz-range-thumb]:border-2
                            [&::-moz-range-thumb]:border-stroke-control
                            [&::-moz-range-thumb]:shadow-lg"
                        style={{
                            background: `linear-gradient(to right, ${color}60 0%, ${color}60 ${relleno}%, transparent ${relleno}%, transparent 100%)`,
                        }}
                    />
                    <div className="flex justify-between mt-1.5 px-0.5">
                        <span className="text-micro text-content-quiet">0.0 Preciso</span>
                        <span className="text-micro text-content-quiet">1.0 Balanceado</span>
                        <span className="text-micro text-content-quiet">2.0 Creativo</span>
                    </div>
                </div>
            </div>

            <div className="space-y-1.5">
                <span id="agent-model-label" className="text-micro text-content-muted uppercase font-mono ml-1 flex items-center gap-1.5">
                    <Cpu className="h-3 w-3" aria-hidden="true" />
                    Modelo
                </span>
                <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby="agent-model-label">
                    {MODELOS.map((m) => (
                        <button
                            key={m.value}
                            type="button"
                            onClick={() => cambiar('model', m.value)}
                            aria-pressed={model === m.value}
                            className={cn(
                                'px-4 py-3 rounded-xl border text-sm font-mono transition-all text-left',
                                model === m.value
                                    ? 'border-accent/40 bg-accent/10 text-accent'
                                    : 'border-stroke-hairline bg-surface-0 text-content-muted hover:border-stroke-edge hover:text-content-strong',
                            )}
                        >
                            <div className="flex items-center gap-2">
                                <div
                                    className={cn(
                                        'h-2 w-2 rounded-full transition-colors',
                                        model === m.value ? 'bg-accent' : 'bg-content-muted',
                                    )}
                                />
                                <span className="truncate">{m.value}</span>
                            </div>
                            <p className="text-xs mt-1 opacity-50 ml-4">{m.description}</p>
                        </button>
                    ))}
                </div>
            </div>
        </motion.section>
    );
});
