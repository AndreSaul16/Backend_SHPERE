/**
 * Quién es el director: nombre, descripción y su color de identidad.
 *
 * Primera de las tres secciones que salieron de `AgentDetailPage.tsx` (7.3).
 */
import { memo } from 'react';
import { motion } from 'framer-motion';
import { Palette, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AGENT_HEX } from '@/store/useChatStore';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { panelClass } from '@/components/ui/cardStyles';
import type { BorradorDeAgente } from './tipos';

interface Props {
    borrador: BorradorDeAgente;
    cambiar: <K extends keyof BorradorDeAgente>(campo: K, valor: BorradorDeAgente[K]) => void;
    inicial: string;
}

const PRESETS = [
    AGENT_HEX.custom, AGENT_HEX.CEO, AGENT_HEX.CMO, AGENT_HEX.CFO, AGENT_HEX.CTO,
];

export const SeccionIdentidad = memo(function SeccionIdentidad({ borrador, cambiar, inicial }: Props) {
    const { name, description, color } = borrador;

    return (
        <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className={panelClass({ className: 'space-y-6' })}
        >
            <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-luxury-purple" />
                <h2 className="text-content-muted text-xs sm:text-sm uppercase tracking-widest font-mono">
                    Identidad del Agente
                </h2>
            </div>

            <div className="flex justify-center">
                <div
                    className="h-20 w-20 sm:h-24 sm:w-24 rounded-md flex items-center justify-center text-3xl sm:text-4xl font-bold border-2 shadow-2xl transition-all duration-500"
                    style={{
                        backgroundColor: `${color}15`,
                        borderColor: `${color}50`,
                        color,
                        boxShadow: `0 0 40px ${color}20`,
                    }}
                >
                    {inicial}
                </div>
            </div>

            <TextField
                label="Nombre"
                id="agent-name"
                value={name}
                onChange={(e) => cambiar('name', e.target.value)}
                placeholder="Ej: Nexus, Oberon..."
            />

            <TextAreaField
                label="Descripción"
                id="agent-description"
                value={description}
                onChange={(e) => cambiar('description', e.target.value)}
                rows={2}
                placeholder="Breve descripción del propósito del agente..."
                controlClassName="resize-none"
            />

            <div className="space-y-1.5">
                <label htmlFor="agent-color" className="text-micro text-content-muted uppercase font-mono block ml-1">
                    Color de identidad
                </label>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <input
                            id="agent-color"
                            type="color"
                            value={color}
                            onChange={(e) => cambiar('color', e.target.value)}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <div
                            className="h-10 w-10 rounded-xl border-2 transition-all duration-300 cursor-pointer hover:scale-110"
                            style={{
                                backgroundColor: `${color}30`,
                                borderColor: color,
                                boxShadow: `0 0 12px ${color}30`,
                            }}
                        />
                    </div>
                    <div className="relative flex-1">
                        <Palette className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-content-muted" aria-hidden="true" />
                        <input
                            id="agent-color-hex"
                            aria-label="Color de identidad en hexadecimal"
                            type="text"
                            value={color}
                            onChange={(e) => {
                                const val = e.target.value;
                                if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) cambiar('color', val);
                            }}
                            maxLength={7}
                            className="w-full bg-surface-0 border border-stroke-hairline rounded-xl pl-10 pr-4 py-2.5 text-sm font-mono text-content-strong uppercase focus:border-accent/50 transition-all"
                            placeholder={AGENT_HEX.custom}
                        />
                    </div>
                    <div className="hidden sm:flex items-center gap-1.5">
                        {PRESETS.map((preset) => (
                            <button
                                key={preset}
                                type="button"
                                onClick={() => cambiar('color', preset)}
                                className={cn(
                                    'h-6 w-6 rounded-lg border transition-all hover:scale-125',
                                    color === preset
                                        ? 'border-stroke-control scale-110'
                                        : 'border-transparent opacity-60',
                                )}
                                style={{ backgroundColor: preset }}
                                title={preset}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </motion.section>
    );
});
