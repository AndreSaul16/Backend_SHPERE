/**
 * Paso 1 de 4 — de dónde sale el agente (D41).
 *
 * Dos caminos y ningún tercero: partir de cero o partir de una plantilla. La
 * plantilla no es un atajo cosmético —rellena el prompt, la temperatura y el
 * modelo—, así que elegirla salta directamente al paso siguiente: quedarse aquí
 * después de elegir no tendría nada que hacer.
 */
import { motion } from 'framer-motion';
import { ChevronRight, PenLine, Sparkles } from 'lucide-react';
import { InlineError } from '@/components/ui/InlineError';
import { cn } from '@/lib/utils';
import { CATEGORY_META, resolveTemplateIcon, slideVariants } from './constants';
import type { AgentTemplate } from './types';
import { EsqueletoDeTarjetas } from '@/components/ui/Esqueleto';

interface StepChooseMethodProps {
    direction: number;
    templates: AgentTemplate[];
    templatesLoading: boolean;
    templatesError: string | null;
    categories: string[];
    categoryFilter: string | null;
    onCategoryFilter: (cat: string | null) => void;
    onSelectTemplate: (t: AgentTemplate) => void;
    onStartFromScratch: () => void;
}

export function StepChooseMethod({
    direction,
    templates,
    templatesLoading,
    templatesError,
    categories,
    categoryFilter,
    onCategoryFilter,
    onSelectTemplate,
    onStartFromScratch,
}: StepChooseMethodProps) {
    return (
        <motion.div
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="p-8 space-y-8"
        >
            {/* From Scratch card */}
            <motion.button
                whileHover={{ y: -2, scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={onStartFromScratch}
                className="w-full flex items-center gap-5 p-6 rounded-md bg-stroke-highlight border-2 border-dashed border-stroke-edge hover:border-electric-cyan/40 hover:bg-stroke-highlight transition-all text-left group"
            >
                <div className="p-4 bg-electric-cyan/10 rounded-md group-hover:bg-electric-cyan/20 transition-colors shrink-0">
                    <PenLine className="h-7 w-7 text-electric-cyan" />
                </div>
                <div className="min-w-0">
                    <p className="font-bold text-content-strong text-lg group-hover:text-electric-cyan transition-colors">
                        Crear desde cero
                    </p>
                    <p className="text-sm text-content-muted mt-1">
                        Define cada aspecto de tu agente manualmente. Control total.
                    </p>
                </div>
                <ChevronRight className="h-5 w-5 text-content-muted group-hover:text-accent transition-colors shrink-0 ml-auto" aria-hidden="true" />
            </motion.button>

            {/* Divider */}
            <div className="flex items-center gap-4">
                <div className="flex-1 h-px bg-stroke-highlight" />
                <span className="text-micro font-bold text-content-muted uppercase">
                    o usa una plantilla
                </span>
                <div className="flex-1 h-px bg-stroke-highlight" />
            </div>

            {/* Category filters */}
            {categories.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => onCategoryFilter(null)}
                        className={cn(
                            'px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border',
                            categoryFilter === null
                                ? 'bg-electric-cyan/10 text-electric-cyan border-electric-cyan/30'
                                : 'bg-stroke-highlight text-content-muted border-stroke-hairline hover:border-stroke-edge hover:text-content-strong',
                        )}
                    >
                        Todas
                    </button>
                    {categories.map((cat) => {
                        const meta = CATEGORY_META[cat];
                        const CatIcon = meta?.icon ?? Sparkles;
                        return (
                            <button
                                key={cat}
                                onClick={() => onCategoryFilter(cat === categoryFilter ? null : cat)}
                                className={cn(
                                    'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border',
                                    categoryFilter === cat
                                        ? 'bg-stroke-hairline text-content-strong border-stroke-control'
                                        : 'bg-stroke-highlight text-content-muted border-stroke-hairline hover:border-stroke-edge hover:text-content-strong',
                                )}
                            >
                                <CatIcon className="h-3 w-3" />
                                {meta?.label ?? cat}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Templates grid */}
            {/* 6.13 · §9.12: la forma de lo que viene SÍ se conoce —una rejilla
                de plantillas con su glifo, su nombre y su frase—, así que el
                giro con la palabra «Cargando» se sustituye por su silueta. Con
                el giro, además, al llegar las plantillas la rejilla aparecía de
                golpe y empujaba el pie del asistente hacia abajo. */}
            {templatesLoading && (
                <EsqueletoDeTarjetas etiqueta="Cargando las plantillas de agente" filas={4} className="py-4" />
            )}

            {templatesError && (
                /* Sin plantillas el asistente sigue sirviendo: la salida es
                   crear el agente desde cero, y hay que decirlo. Antes esto era
                   un renglón rojo con el motivo técnico y punto. */
                <InlineError
                    className="my-6"
                    tone="warning"
                    title="No se han podido cargar las plantillas"
                    detail="Puedes crear tu agente desde cero con el botón de arriba: el asistente funciona igual sin ellas."
                    reason={templatesError}
                />
            )}

            {!templatesLoading && !templatesError && templates.length === 0 && (
                <div className="text-center py-12 text-content-muted text-sm">
                    No hay plantillas disponibles. Crea tu agente desde cero.
                </div>
            )}

            {!templatesLoading && templates.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {templates.map((template) => {
                        const TemplateIcon = resolveTemplateIcon(template.icon);
                        const meta = CATEGORY_META[template.category];
                        return (
                            <motion.button
                                key={template.template_id}
                                whileHover={{ y: -3, scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => onSelectTemplate(template)}
                                className="flex items-start gap-4 p-5 rounded-md bg-stroke-highlight border border-stroke-hairline hover:border-luxury-purple/40 hover:bg-stroke-highlight transition-all text-left group"
                            >
                                <div className={cn(
                                    'p-3 rounded-xl bg-stroke-highlight border border-stroke-hairline shrink-0',
                                    meta?.color ?? 'text-content-muted',
                                )}>
                                    <TemplateIcon className="h-5 w-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="font-bold text-content-strong text-sm group-hover:text-luxury-purple transition-colors truncate">
                                        {template.name}
                                    </p>
                                    <p className="text-xs text-content-muted mt-1 line-clamp-2">
                                        {template.description}
                                    </p>
                                    {template.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {template.tags.slice(0, 3).map((tag) => (
                                                <span
                                                    key={tag}
                                                    className="px-2 py-0.5 bg-stroke-highlight text-content-muted rounded-md text-micro font-medium"
                                                >
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </motion.button>
                        );
                    })}
                </div>
            )}
        </motion.div>
    );
}
