/**
 * Paso 3 de 4 — la base de conocimiento (D41).
 *
 * Es el paso OPCIONAL, y lo dice dos veces: en el texto y con «Saltar por
 * ahora». Los ficheros no se suben aquí: se apuntan, y viajan cuando el agente
 * ya existe y tiene identificador.
 */
import { motion } from 'framer-motion';
import { CheckCircle2, File, SkipForward, Sparkles, Trash2, Upload, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { slideVariants } from './constants';
import type { FileEntry } from './types';

interface StepKnowledgeProps {
    direction: number;
    files: FileEntry[];
    isDragOver: boolean;
    dropRef: React.RefObject<HTMLDivElement | null>;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    suggestedFiles: string[];
    onDrop: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onAddFiles: (files: FileList | File[]) => void;
    onRemoveFile: (id: string) => void;
    onSkip: () => void;
}

export function StepKnowledge({
    direction,
    files,
    isDragOver,
    dropRef,
    fileInputRef,
    suggestedFiles,
    onDrop,
    onDragOver,
    onDragLeave,
    onAddFiles,
    onRemoveFile,
    onSkip,
}: StepKnowledgeProps) {
    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

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
            <div className="space-y-1">
                <h3 className="text-base font-bold text-content-strong">Base de Conocimiento</h3>
                <p className="text-sm text-content-muted">
                    Sube documentos para que tu agente tenga contexto especializado. Este paso es opcional.
                </p>
            </div>

            {/* Suggested files hint */}
            {suggestedFiles.length > 0 && (
                <div className="p-4 rounded-md bg-luxury-purple/5 border border-luxury-purple/20">
                    <p className="text-xs font-bold text-luxury-purple mb-2 flex items-center gap-1.5">
                        <Sparkles className="h-3 w-3" />
                        Archivos sugeridos por la plantilla
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {suggestedFiles.map((sf) => (
                            <span
                                key={sf}
                                className="px-2.5 py-1 bg-stroke-highlight text-content-muted rounded-lg text-xs border border-stroke-hairline"
                            >
                                {sf}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Zona de subida — D14 (1.10), segunda de las dos.
                Era un <div onClick> con el <input type="file"> en `hidden`: sin
                ratón no había forma de adjuntar un documento, porque el div no
                recibe foco y el input oculto tampoco está en el árbol de
                accesibilidad. Mismo patrón que `KnowledgeBasePanel`:

                  · el disparador es un <button type="button"> real, que trae
                    foco, Enter y Espacio de serie;
                  · el input pasa de `hidden` a `sr-only`, porque `display:none`
                    lo saca del árbol de accesibilidad y además algunos
                    navegadores se niegan a abrir el selector de un input que no
                    está pintado;
                  · arrastrar y soltar se conserva como ATAJO DE RATÓN sobre el
                    mismo contenedor —el botón lo llena entero—, nunca como
                    único camino. */}
            <div ref={dropRef} className="relative">
                <button
                    type="button"
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                        'flex w-full flex-col items-center justify-center gap-4 p-10 rounded-md border-2 border-dashed cursor-pointer transition-all',
                        isDragOver
                            ? 'border-accent/60 bg-accent/5'
                            : 'border-stroke-edge bg-surface-2 hover:border-brass-600 hover:bg-surface-3',
                    )}
                >
                    <span className={cn(
                        'p-4 rounded-md transition-colors',
                        isDragOver ? 'bg-accent/20' : 'bg-surface-3',
                    )}>
                        <Upload
                            className={cn(
                                'h-8 w-8 transition-colors',
                                isDragOver ? 'text-accent' : 'text-content-muted',
                            )}
                            aria-hidden="true"
                        />
                    </span>
                    <span className="text-center">
                        <span className={cn(
                            'block text-sm font-semibold transition-colors',
                            isDragOver ? 'text-accent' : 'text-content',
                        )}>
                            {isDragOver ? 'Suelta los archivos aquí' : 'Adjuntar documentos'}
                        </span>
                        <span className="block text-xs text-content-muted mt-1">
                            PDF, TXT, DOCX, CSV, MD — Máx 50 MB por archivo
                        </span>
                        <span className="block text-xs text-content-muted mt-1">
                            También puedes arrastrarlos aquí.
                        </span>
                    </span>
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.txt,.docx,.csv,.md,.doc,.xlsx,.json"
                    aria-label="Adjuntar documentos a la base de conocimiento del agente"
                    className="sr-only"
                    onChange={(e) => {
                        if (e.target.files?.length) {
                            onAddFiles(e.target.files);
                            e.target.value = '';
                        }
                    }}
                />
            </div>

            {/* File list */}
            {files.length > 0 && (
                <div className="space-y-2">
                    <p className="text-micro font-bold text-content-muted uppercase ml-1">
                        Archivos ({files.length})
                    </p>
                    <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
                        {files.map((entry) => (
                            <div
                                key={entry.id}
                                data-row
                                className="flex items-center gap-3 p-3 rounded-xl bg-stroke-highlight border border-stroke-hairline group"
                            >
                                <div className="p-2 bg-stroke-highlight rounded-lg shrink-0">
                                    <File className="h-4 w-4 text-content-muted" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-content-strong truncate">
                                        {entry.file.name}
                                    </p>
                                    <p className="text-xs text-content-muted">
                                        {formatSize(entry.file.size)}
                                    </p>
                                </div>
                                {/* Status indicator */}
                                <div className="shrink-0">
                                    {entry.status === 'pending' && (
                                        <span className="text-xs text-content-muted font-medium">Listo</span>
                                    )}
                                    {entry.status === 'uploading' && (
                                        <div className="flex items-center gap-2">
                                            <div className="w-16 h-1.5 bg-stroke-hairline rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-electric-cyan rounded-full transition-all duration-300"
                                                    style={{ width: `${entry.progress}%` }}
                                                />
                                            </div>
                                            <span className="text-xs text-electric-cyan font-mono tabular-nums">
                                                {entry.progress}%
                                            </span>
                                        </div>
                                    )}
                                    {entry.status === 'success' && (
                                        <CheckCircle2 className="h-4 w-4 text-success" />
                                    )}
                                    {entry.status === 'error' && (
                                        <div className="flex items-center gap-1.5" title={entry.errorMessage}>
                                            <XCircle className="h-4 w-4 text-danger" />
                                        </div>
                                    )}
                                </div>
                                {/* Quitar un adjunto — D16 (1.11). Era
                                    `opacity-0 group-hover:opacity-100`: sin ratón
                                    no había forma de retirar un fichero mal
                                    elegido. El contrato vive en `index.css`
                                    (`[data-row]`/`[data-row-actions]`) y parte de
                                    VISIBLE. Sin etiqueta era además un botón sin
                                    nombre accesible. */}
                                {(entry.status === 'pending' || entry.status === 'error') && (
                                    <button
                                        type="button"
                                        onClick={() => onRemoveFile(entry.id)}
                                        data-row-actions
                                        aria-label={`Quitar ${entry.file.name} de la lista`}
                                        className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-dissent/10 text-content-muted hover:text-dissent transition-all shrink-0"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Skip button */}
            {files.length === 0 && (
                <button
                    onClick={onSkip}
                    className="w-full flex items-center justify-center gap-2 py-3 text-sm text-content-muted hover:text-content-strong transition-colors"
                >
                    <SkipForward className="h-4 w-4" />
                    Saltar por ahora
                </button>
            )}
        </motion.div>
    );
}
