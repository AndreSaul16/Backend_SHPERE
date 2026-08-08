/**
 * Paso 2 de 4 — quién es el agente (D41).
 *
 * Recibe el formulario ENTERO y un solo `onChange`, no doce props sueltas: el
 * dueño del estado es el reducer del asistente, y esta pantalla sólo lo pinta y
 * propone retoques.
 */
import { motion } from 'framer-motion';
import { Bot, Palette, Thermometer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { MODEL_OPTIONS, PRESET_COLORS, slideVariants } from './constants';
import type { WizardForm } from './types';

interface StepConfigureProps {
    direction: number;
    /** El formulario ENTERO, no doce props sueltas: es lo que el reducer posee. */
    form: WizardForm;
    onChange: (patch: Partial<WizardForm>) => void;
    isTemplate: boolean;
}

export function StepConfigure({ direction, form, onChange, isTemplate }: StepConfigureProps) {
    const { name, description, systemPrompt, color, temperature, model } = form;
    return (
        <motion.div
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="p-8 space-y-6"
        >
            <TextField
                label="Nombre del agente"
                id="wizard-name"
                required
                value={name}
                onChange={(e) => onChange({ name: e.target.value })}
                placeholder="Ej: Analista Financiero, Redactor SEO..."
            />

            <TextField
                label="Descripción breve"
                id="wizard-description"
                value={description}
                onChange={(e) => onChange({ description: e.target.value })}
                placeholder="Una línea que describa para qué sirve este agente"
            />

            <TextAreaField
                label={
                    <>
                        System Prompt
                        {isTemplate && (
                            <span className="ms-2 px-2 py-0.5 bg-brass-600/12 text-brass-300 rounded-xs text-micro font-semibold border border-brass-600/40">
                                Pre-rellenado por plantilla
                            </span>
                        )}
                    </>
                }
                id="wizard-system-prompt"
                required
                value={systemPrompt}
                onChange={(e) => onChange({ systemPrompt: e.target.value })}
                placeholder="Instrucciones detalladas que definen la personalidad, expertise y comportamiento del agente..."
                rows={6}
                controlClassName="resize-none font-mono leading-relaxed"
            />

            {/* Color picker + Temperature + Model in a row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {/* Color picker */}
                <div className="space-y-2">
                    {/* Un grupo de muestras no es un campo: no lleva <label> sino
                        `role="group"` con `aria-labelledby` (§12.7). Y cada
                        muestra lleva `aria-pressed` porque su estado no puede
                        depender sólo del color (§P5, §9.9). */}
                    <span
                        id="wizard-color-label"
                        className="text-micro font-bold text-content-muted uppercase ml-1 flex items-center gap-1.5"
                    >
                        <Palette className="h-3 w-3" aria-hidden="true" />
                        Color
                    </span>
                    <div
                        role="group"
                        aria-labelledby="wizard-color-label"
                        className="flex flex-wrap gap-2 p-3 rounded-md bg-stroke-highlight border border-stroke-hairline"
                    >
                        {PRESET_COLORS.map((c) => (
                            <button
                                key={c}
                                type="button"
                                onClick={() => onChange({ color: c })}
                                aria-pressed={color === c}
                                aria-label={`Color ${c}`}
                                className={cn(
                                    'h-7 w-7 rounded-lg transition-all border-2',
                                    color === c
                                        ? 'border-content-strong scale-110 shadow-lg'
                                        : 'border-transparent hover:scale-105',
                                )}
                                style={{ backgroundColor: c }}
                            />
                        ))}
                    </div>
                </div>

                {/* Temperature */}
                <div className="space-y-2">
                    <label
                        htmlFor="wizard-temperature"
                        className="text-micro font-bold text-content-muted uppercase ml-1 flex items-center gap-1.5"
                    >
                        <Thermometer className="h-3 w-3" aria-hidden="true" />
                        Temperatura
                    </label>
                    <div className="p-3 rounded-md bg-stroke-highlight border border-stroke-hairline space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-content-muted">Preciso</span>
                            <span className="text-sm font-mono font-bold text-electric-cyan">
                                {temperature.toFixed(1)}
                            </span>
                            <span className="text-xs text-content-muted">Creativo</span>
                        </div>
                        <input
                            id="wizard-temperature"
                            type="range"
                            min={0}
                            max={2}
                            step={0.1}
                            value={temperature}
                            onChange={(e) => onChange({ temperature: parseFloat(e.target.value) })}
                            aria-valuetext={`${temperature.toFixed(1)} de 2`}
                            className="w-full accent-accent h-1.5 bg-surface-inset rounded-full appearance-none cursor-pointer
                                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
                                       [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-fill
                                       [&::-webkit-slider-thumb]:cursor-pointer"
                        />
                    </div>
                </div>

                {/* Model selector */}
                <div className="space-y-2">
                    <span
                        id="wizard-model-label"
                        className="text-micro font-bold text-content-muted uppercase ml-1 flex items-center gap-1.5"
                    >
                        <Bot className="h-3 w-3" aria-hidden="true" />
                        Modelo
                    </span>
                    <div className="space-y-2" role="group" aria-labelledby="wizard-model-label">
                        {MODEL_OPTIONS.map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => onChange({ model: opt.value })}
                                aria-pressed={model === opt.value}
                                className={cn(
                                    'w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left',
                                    model === opt.value
                                        ? 'bg-electric-cyan/10 border-electric-cyan/30 text-content-strong'
                                        : 'bg-stroke-highlight border-stroke-hairline text-content-muted hover:border-stroke-edge hover:text-content-muted',
                                )}
                            >
                                <div className={cn(
                                    'h-3 w-3 rounded-full border-2 shrink-0',
                                    model === opt.value
                                        ? 'border-electric-cyan bg-electric-cyan'
                                        : 'border-stroke-control',
                                )} />
                                <div className="min-w-0">
                                    <p className="text-xs font-bold">{opt.label}</p>
                                    <p className="text-xs text-content-muted">{opt.description}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Preview pill */}
            <div className="flex items-center gap-3 p-4 rounded-md bg-surface-1 border border-stroke-hairline">
                <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center text-content-strong font-bold text-sm border border-stroke-edge"
                    style={{ backgroundColor: color + '30', borderColor: color + '50' }}
                >
                    {name.trim() ? name.trim().charAt(0).toUpperCase() : '?'}
                </div>
                <div className="min-w-0">
                    <p className="text-sm font-bold text-content-strong truncate">
                        {name.trim() || 'Nombre del agente'}
                    </p>
                    <p className="text-xs text-content-muted truncate">
                        {description.trim() || 'Sin descripcion'}
                    </p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-stroke-highlight text-content-muted rounded text-micro font-mono">
                        {model}
                    </span>
                    <span className="px-2 py-0.5 bg-stroke-highlight text-content-muted rounded text-micro font-mono">
                        t={temperature.toFixed(1)}
                    </span>
                </div>
            </div>
        </motion.div>
    );
}
