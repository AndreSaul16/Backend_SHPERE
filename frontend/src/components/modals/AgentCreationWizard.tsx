import { useEffect, useReducer, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import {
    ChevronRight,
    ChevronLeft,
    Sparkles,
    FileText,
    Palette,
    Upload,
    Check,
    AlertCircle,
    Loader2,
    SkipForward,
    Trash2,
    PenLine,
    Thermometer,
    Bot,
    File,
    CheckCircle2,
    XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TextAreaField, TextField } from '@/components/ui/Field';
import {
    CATEGORY_META,
    MODEL_OPTIONS,
    PRESET_COLORS,
    STEPS,
    resolveTemplateIcon,
    slideVariants,
} from './agent-wizard/constants';
import type { AgentTemplate, FileEntry, WizardForm, WizardStep } from './agent-wizard/types';
import {
    canProceed,
    initialWizardState,
    newFileEntry,
    wizardReducer,
} from './agent-wizard/wizardReducer';
import { useAgentSubmission } from './agent-wizard/useAgentSubmission';
import { useAgentTemplates } from './agent-wizard/useAgentTemplates';

interface AgentCreationWizardProps {
    isOpen: boolean;
    onClose: () => void;
    onAgentCreated: (agentId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgentCreationWizard({ isOpen, onClose, onAgentCreated }: AgentCreationWizardProps) {
    // Todo el estado del asistente, en un reducer (D41): un `reset` en vez de
    // catorce setters, y ningún campo que se pueda quedar sin borrar.
    const [state, dispatch] = useReducer(wizardReducer, initialWizardState);
    const { step, direction, files, isDragOver, isSubmitting, submitError } = state;

    // El catálogo es estado del servidor y vive fuera del reducer.
    const catalog = useAgentTemplates(isOpen);

    const handleSubmit = useAgentSubmission(state, dispatch, onAgentCreated, onClose);

    const dropRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // -----------------------------------------------------------------------
    // Borrado al cerrar
    // -----------------------------------------------------------------------

    useEffect(() => {
        if (!isOpen) {
            // Con retraso, para que la animación de salida no enseñe el
            // formulario vaciándose por debajo.
            const t = setTimeout(() => dispatch({ type: 'reset' }), 300);
            return () => clearTimeout(t);
        }
    }, [isOpen]);

    // -----------------------------------------------------------------------
    // Navegación
    // -----------------------------------------------------------------------

    const goTo = (target: WizardStep) => dispatch({ type: 'goTo', step: target });
    const handleNext = () => {
        if (step < 3 && canProceed(state)) goTo((step + 1) as WizardStep);
    };
    const handleBack = () => {
        if (step > 0) goTo((step - 1) as WizardStep);
    };

    // -----------------------------------------------------------------------
    // Ficheros
    // -----------------------------------------------------------------------

    const addFiles = (incoming: FileList | File[]) =>
        dispatch({ type: 'addFiles', entries: Array.from(incoming).map(newFileEntry) });

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        dispatch({ type: 'setDragOver', over: false });
        if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        dispatch({ type: 'setDragOver', over: true });
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        dispatch({ type: 'setDragOver', over: false });
    };

    // -----------------------------------------------------------------------
    // Derivados
    // -----------------------------------------------------------------------

    const filteredTemplates = state.categoryFilter
        ? catalog.templates.filter((t) => t.category === state.categoryFilter)
        : catalog.templates;

    const categories = Array.from(new Set(catalog.templates.map((t) => t.category)));

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            size="lg"
            // Un asistente de cuatro pasos puede tener trabajo del usuario
            // dentro: §9.4 sólo autoriza cerrar con el velo si no se pierde
            // nada, así que aquí no.
            dismissOnBackdrop={false}
            title="Crear agente"
            description={`${STEPS[step].label} — Paso ${step + 1} de ${STEPS.length}`}
            bodyClassName="px-0 py-0"
            footer={
                <div className="flex w-full items-center justify-between gap-3">
                    <Button variant="secondary" onClick={step === 0 ? onClose : handleBack}>
                        {step === 0 ? (
                            <>Cancelar</>
                        ) : (
                            <>
                                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                                Atrás
                            </>
                        )}
                    </Button>

                    {step < 3 ? (
                        <Button variant="primary" onClick={handleNext} disabled={!canProceed(state)}>
                            Siguiente
                            <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        </Button>
                    ) : (
                        <Button
                            variant="primary"
                            onClick={handleSubmit}
                            loading={isSubmitting}
                            loadingLabel="Creando"
                        >
                            <Sparkles className="h-4 w-4" aria-hidden="true" />
                            Crear agente
                        </Button>
                    )}
                </div>
            }
        >
                    <div className="flex flex-col">
                        {/* ---- Progress Bar ---- */}
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
                                                onClick={() => i < step && goTo(i as WizardStep)}
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

                        {/* ---- Content ---- */}
                        <div className="relative">
                            <AnimatePresence mode="wait" custom={direction}>
                                {step === 0 && (
                                    <StepChooseMethod
                                        key="step-0"
                                        direction={direction}
                                        templates={filteredTemplates}
                                        templatesLoading={catalog.loading}
                                        templatesError={catalog.error}
                                        categories={categories}
                                        categoryFilter={state.categoryFilter}
                                        onCategoryFilter={(category) => dispatch({ type: 'filterCategory', category })}
                                        onSelectTemplate={(template) => dispatch({ type: 'selectTemplate', template })}
                                        onStartFromScratch={() => dispatch({ type: 'startFromScratch' })}
                                    />
                                )}
                                {step === 1 && (
                                    <StepConfigure
                                        key="step-1"
                                        direction={direction}
                                        form={state.form}
                                        onChange={(patch) => dispatch({ type: 'patchForm', patch })}
                                        isTemplate={state.method === 'template'}
                                    />
                                )}
                                {step === 2 && (
                                    <StepKnowledge
                                        key="step-2"
                                        direction={direction}
                                        files={files}
                                        isDragOver={isDragOver}
                                        dropRef={dropRef}
                                        fileInputRef={fileInputRef}
                                        suggestedFiles={state.selectedTemplate?.suggested_files ?? []}
                                        onDrop={handleDrop}
                                        onDragOver={handleDragOver}
                                        onDragLeave={handleDragLeave}
                                        onAddFiles={addFiles}
                                        onRemoveFile={(id) => dispatch({ type: 'removeFile', id })}
                                        onSkip={handleNext}
                                    />
                                )}
                                {step === 3 && (
                                    <StepReview
                                        key="step-3"
                                        direction={direction}
                                        form={state.form}
                                        files={files}
                                        templateName={state.selectedTemplate?.name ?? null}
                                        isSubmitting={isSubmitting}
                                        submitError={submitError}
                                    />
                                )}
                            </AnimatePresence>
                        </div>

                    </div>
        </Modal>
    );
}

// ===========================================================================
// Step 0 - Choose Method
// ===========================================================================

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

function StepChooseMethod({
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
            {templatesLoading && (
                <div className="flex items-center justify-center py-12 gap-3 text-content-muted">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-sm">Cargando plantillas...</span>
                </div>
            )}

            {templatesError && (
                <div className="flex items-center justify-center py-12 gap-3 text-danger">
                    <AlertCircle className="h-5 w-5" aria-hidden="true" />
                    <span className="text-sm">{templatesError}</span>
                </div>
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

// ===========================================================================
// Step 1 - Configure
// ===========================================================================

interface StepConfigureProps {
    direction: number;
    /** El formulario ENTERO, no doce props sueltas: es lo que el reducer posee. */
    form: WizardForm;
    onChange: (patch: Partial<WizardForm>) => void;
    isTemplate: boolean;
}

function StepConfigure({ direction, form, onChange, isTemplate }: StepConfigureProps) {
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

// ===========================================================================
// Step 2 - Knowledge Base
// ===========================================================================

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

function StepKnowledge({
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

// ===========================================================================
// Step 3 - Review & Create
// ===========================================================================

interface StepReviewProps {
    direction: number;
    form: WizardForm;
    files: FileEntry[];
    templateName: string | null;
    isSubmitting: boolean;
    submitError: string | null;
}

function StepReview({
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
