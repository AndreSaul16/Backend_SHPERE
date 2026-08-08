/**
 * Paso 4 de 4 — la última mirada antes de crear (D41).
 *
 * No decide nada: el botón «Crear agente» vive en el pie del modal, que es
 * donde §9.4 pone las acciones. Aquí sólo se resume lo elegido y se enseña el
 * progreso de las subidas cuando el envío ya está en marcha.
 */
import { motion } from 'framer-motion';
import {
    AlertCircle,
    Bot,
    Check,
    File,
    FileText,
    Loader2,
    Palette,
    Thermometer,
    XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MODEL_OPTIONS, slideVariants } from './constants';
import type { FileEntry, WizardForm } from './types';

interface StepReviewProps {
    direction: number;
    form: WizardForm;
    files: FileEntry[];
    templateName: string | null;
    isSubmitting: boolean;
    submitError: string | null;
}

export function StepReview({
    direction,
    form,
    files,
    templateName,
    isSubmitting,
    submitError,
}: StepReviewProps) {
    const { name, description, systemPrompt, color, temperature, model } = form;
    const modelLabel = MODEL_OPTIONS.find((m) => m.value === model)?.label ?? model;

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
            {/* Summary card */}
            <div className="rounded-md bg-stroke-highlight border border-stroke-hairline overflow-hidden">
                {/* Agent header */}
                <div className="p-6 flex flex-wrap items-center gap-4 border-b border-stroke-hairline">
                    <div
                        className="h-14 w-14 rounded-md flex items-center justify-center text-content-strong font-bold text-xl border border-stroke-edge shadow-lg"
                        style={{
                            backgroundColor: color + '25',
                            borderColor: color + '40',
                            boxShadow: `0 0 30px ${color}15`,
                        }}
                    >
                        {name.trim().charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-lg font-bold text-content-strong truncate">{name}</p>
                        {description && (
                            <p className="text-sm text-content-muted truncate mt-0.5">{description}</p>
                        )}
                    </div>
                    {templateName && (
                        <span className="px-3 py-1 bg-luxury-purple/10 text-luxury-purple border border-luxury-purple/20 rounded-xl text-micro font-bold shrink-0">
                            Plantilla: {templateName}
                        </span>
                    )}
                </div>

                {/* Details grid */}
                <div className="p-6 grid grid-cols-2 gap-4">
                    <ReviewField
                        label="Modelo"
                        value={modelLabel}
                        icon={<Bot className="h-3.5 w-3.5" />}
                    />
                    <ReviewField
                        label="Temperatura"
                        value={temperature.toFixed(1)}
                        icon={<Thermometer className="h-3.5 w-3.5" />}
                    />
                    <ReviewField
                        label="Color"
                        value={
                            <div className="flex items-center gap-2">
                                <div
                                    className="h-4 w-4 rounded-md border border-stroke-edge"
                                    style={{ backgroundColor: color }}
                                />
                                <span className="font-mono text-xs">{color}</span>
                            </div>
                        }
                        icon={<Palette className="h-3.5 w-3.5" />}
                    />
                    <ReviewField
                        label="Documentos"
                        value={files.length > 0 ? `${files.length} archivo${files.length > 1 ? 's' : ''}` : 'Ninguno'}
                        icon={<FileText className="h-3.5 w-3.5" />}
                    />
                </div>

                {/* System prompt preview */}
                <div className="px-6 pb-6">
                    <p className="text-micro font-bold text-content-muted uppercase mb-2">
                        System Prompt
                    </p>
                    <div className="p-4 rounded-xl bg-midnight/60 border border-stroke-hairline max-h-32 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
                        <p className="text-xs text-content-muted font-mono leading-relaxed whitespace-pre-wrap">
                            {systemPrompt.length > 500
                                ? systemPrompt.substring(0, 500) + '...'
                                : systemPrompt}
                        </p>
                    </div>
                </div>

                {/* File list preview */}
                {files.length > 0 && (
                    <div className="px-6 pb-6">
                        <p className="text-micro font-bold text-content-muted uppercase mb-2">
                            Archivos a subir
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {files.map((f) => (
                                <span
                                    key={f.id}
                                    className="flex items-center gap-1.5 px-2.5 py-1 bg-stroke-highlight text-content-muted rounded-lg text-xs border border-stroke-hairline"
                                >
                                    <File className="h-3 w-3" />
                                    {f.file.name}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Error message */}
            {submitError && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 p-4 rounded-md bg-oxblood-500/5 border border-oxblood-500/20"
                >
                    <AlertCircle className="h-5 w-5 text-danger shrink-0" />
                    <p className="text-sm text-danger">{submitError}</p>
                </motion.div>
            )}

            {/* Submission progress for files */}
            {isSubmitting && files.some((f) => f.status === 'uploading') && (
                <div className="space-y-2">
                    {files.map((f) => (
                        <div key={f.id} className="flex items-center gap-3">
                            <span className="text-xs text-content-muted truncate w-32">{f.file.name}</span>
                            <div className="flex-1 h-1.5 bg-stroke-hairline rounded-full overflow-hidden">
                                <div
                                    className={cn(
                                        'h-full rounded-full transition-all duration-300',
                                        f.status === 'error' ? 'bg-oxblood-500' : 'bg-electric-cyan',
                                    )}
                                    style={{ width: `${f.progress}%` }}
                                />
                            </div>
                            {f.status === 'success' && <Check className="h-4 w-4 text-success" />}
                            {f.status === 'error' && <XCircle className="h-4 w-4 text-danger" />}
                            {f.status === 'uploading' && (
                                <Loader2 className="h-4 w-4 text-electric-cyan animate-spin" />
                            )}
                        </div>
                    ))}
                </div>
            )}
        </motion.div>
    );
}

// ---------------------------------------------------------------------------
// Small helper components
// ---------------------------------------------------------------------------

function ReviewField({
    label,
    value,
    icon,
}: {
    label: string;
    value: React.ReactNode;
    icon: React.ReactNode;
}) {
    return (
        <div className="p-3 rounded-xl bg-surface-1 border border-stroke-hairline space-y-1.5">
            <p className="text-micro font-bold text-content-muted uppercase flex items-center gap-1.5">
                {icon}
                {label}
            </p>
            <div className="text-sm font-semibold text-content-strong">{value}</div>
        </div>
    );
}
