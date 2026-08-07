import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import {
    ChevronRight,
    ChevronLeft,
    Sparkles,
    FileText,
    Brain,
    Palette,
    Upload,
    Check,
    AlertCircle,
    Loader2,
    SkipForward,
    Trash2,
    GraduationCap,
    Scale,
    HeartPulse,
    TrendingUp,
    Cpu,
    Pen,
    Users,
    ShoppingCart,
    LayoutTemplate,
    PenLine,
    Thermometer,
    Bot,
    File,
    CheckCircle2,
    XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { useChatStore } from '@/store/useChatStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentCreationWizardProps {
    isOpen: boolean;
    onClose: () => void;
    onAgentCreated: (agentId: string) => void;
}

interface AgentTemplate {
    template_id: string;
    name: string;
    category: string;
    description: string;
    icon: string;
    system_prompt: string;
    suggested_files: string[];
    default_temperature: number;
    default_model: string;
    tags: string[];
}

type WizardStep = 0 | 1 | 2 | 3;

interface FileEntry {
    id: string;
    file: File;
    status: 'pending' | 'uploading' | 'success' | 'error';
    progress: number;
    errorMessage?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEPS = [
    { label: 'Metodo', icon: LayoutTemplate },
    { label: 'Configurar', icon: Brain },
    { label: 'Conocimiento', icon: FileText },
    { label: 'Revisar', icon: CheckCircle2 },
] as const;

const CATEGORY_META: Record<string, { label: string; icon: typeof Scale; color: string }> = {
    legal:     { label: 'Legal',      icon: Scale,        color: 'text-blue-400' },
    health:    { label: 'Salud',      icon: HeartPulse,   color: 'text-green-400' },
    finance:   { label: 'Finanzas',   icon: TrendingUp,   color: 'text-yellow-400' },
    tech:      { label: 'Tecnologia', icon: Cpu,          color: 'text-electric-cyan' },
    creative:  { label: 'Creativo',   icon: Pen,          color: 'text-pink-400' },
    hr:        { label: 'RRHH',       icon: Users,        color: 'text-orange-400' },
    sales:     { label: 'Ventas',     icon: ShoppingCart,  color: 'text-purple-400' },
    education: { label: 'Educacion',  icon: GraduationCap, color: 'text-indigo-400' },
};

const PRESET_COLORS = [
    '#00F5D4', '#9D85FF', '#FF2E97', '#6B8AFD',
    '#E34A95', '#00C1B3', '#8A63D2', '#F59E0B',
    '#10B981', '#EF4444', '#3B82F6', '#EC4899',
];

const MODEL_OPTIONS = [
    { value: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', description: 'Razonamiento máximo (recomendado)' },
    { value: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', description: 'Rápido y económico' },
];

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve a Lucide icon component from a template icon string. */
const resolveTemplateIcon = (iconName: string) => {
    const map: Record<string, typeof Scale> = {
        scale: Scale,
        heart: HeartPulse,
        'heart-pulse': HeartPulse,
        'trending-up': TrendingUp,
        trending: TrendingUp,
        cpu: Cpu,
        pen: Pen,
        'pen-line': PenLine,
        users: Users,
        'shopping-cart': ShoppingCart,
        'graduation-cap': GraduationCap,
        brain: Brain,
        sparkles: Sparkles,
        bot: Bot,
        file: FileText,
    };
    return map[iconName.toLowerCase()] ?? Sparkles;
};

let fileIdCounter = 0;
const nextFileId = () => `file_${++fileIdCounter}_${Date.now()}`;

// ---------------------------------------------------------------------------
// Slide animation variants
// ---------------------------------------------------------------------------

const slideVariants = {
    enter: (direction: number) => ({
        x: direction > 0 ? 80 : -80,
        opacity: 0,
    }),
    center: {
        x: 0,
        opacity: 1,
    },
    exit: (direction: number) => ({
        x: direction > 0 ? -80 : 80,
        opacity: 0,
    }),
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgentCreationWizard({ isOpen, onClose, onAgentCreated }: AgentCreationWizardProps) {
    // Store
    const addCustomAgent = useChatStore((s) => s.addCustomAgent);

    // Wizard navigation
    const [step, setStep] = useState<WizardStep>(0);
    const [direction, setDirection] = useState(1);

    // Step 0: method
    const [method, setMethod] = useState<'template' | 'scratch' | null>(null);
    const [templates, setTemplates] = useState<AgentTemplate[]>([]);
    const [templatesLoading, setTemplatesLoading] = useState(false);
    const [templatesError, setTemplatesError] = useState<string | null>(null);
    const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate | null>(null);
    const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

    // Step 1: configuration
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [systemPrompt, setSystemPrompt] = useState('');
    const [color, setColor] = useState(PRESET_COLORS[0]);
    const [temperature, setTemperature] = useState(0.7);
    const [model, setModel] = useState('deepseek-v4-pro');

    // Step 2: knowledge base
    const [files, setFiles] = useState<FileEntry[]>([]);
    const dropRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragOver, setIsDragOver] = useState(false);

    // Step 3: submit
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    // -----------------------------------------------------------------------
    // Fetch templates on mount
    // -----------------------------------------------------------------------

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;

        const fetchTemplates = async () => {
            setTemplatesLoading(true);
            setTemplatesError(null);
            try {
                const res = await fetch(`${API_URL}/agents/templates`);
                if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
                const data = await res.json();
                if (!cancelled) setTemplates(Array.isArray(data) ? data : []);
            } catch (err: any) {
                if (!cancelled) setTemplatesError(err.message ?? 'Error al cargar plantillas');
            } finally {
                if (!cancelled) setTemplatesLoading(false);
            }
        };

        fetchTemplates();
        return () => { cancelled = true; };
    }, [isOpen]);

    // -----------------------------------------------------------------------
    // Reset state when modal closes
    // -----------------------------------------------------------------------

    useEffect(() => {
        if (!isOpen) {
            // Delay reset so exit animation plays
            const t = setTimeout(() => {
                setStep(0);
                setDirection(1);
                setMethod(null);
                setSelectedTemplate(null);
                setCategoryFilter(null);
                setName('');
                setDescription('');
                setSystemPrompt('');
                setColor(PRESET_COLORS[0]);
                setTemperature(0.7);
                setModel('deepseek-v4-pro');
                setFiles([]);
                setIsSubmitting(false);
                setSubmitError(null);
            }, 300);
            return () => clearTimeout(t);
        }
    }, [isOpen]);

    // -----------------------------------------------------------------------
    // Navigation helpers
    // -----------------------------------------------------------------------

    const goTo = useCallback((target: WizardStep) => {
        setDirection(target > step ? 1 : -1);
        setStep(target);
    }, [step]);

    const canProceed = (): boolean => {
        switch (step) {
            case 0: return method !== null;
            case 1: return name.trim().length > 0 && systemPrompt.trim().length > 0;
            case 2: return true; // files are optional
            case 3: return !isSubmitting;
            default: return false;
        }
    };

    const handleNext = () => {
        if (step < 3 && canProceed()) goTo((step + 1) as WizardStep);
    };

    const handleBack = () => {
        if (step > 0) goTo((step - 1) as WizardStep);
    };

    // -----------------------------------------------------------------------
    // Template selection
    // -----------------------------------------------------------------------

    const handleSelectTemplate = (template: AgentTemplate) => {
        setSelectedTemplate(template);
        setMethod('template');
        setName(template.name);
        setDescription(template.description);
        setSystemPrompt(template.system_prompt);
        setTemperature(template.default_temperature);
        setModel(template.default_model);
        // auto-advance to step 1
        setDirection(1);
        setStep(1);
    };

    const handleStartFromScratch = () => {
        setMethod('scratch');
        setSelectedTemplate(null);
        setName('');
        setDescription('');
        setSystemPrompt('');
        setTemperature(0.7);
        setModel('deepseek-chat');
        setDirection(1);
        setStep(1);
    };

    // -----------------------------------------------------------------------
    // File handling (drag & drop + picker)
    // -----------------------------------------------------------------------

    const addFiles = useCallback((incoming: FileList | File[]) => {
        const newEntries: FileEntry[] = Array.from(incoming).map((f) => ({
            id: nextFileId(),
            file: f,
            status: 'pending' as const,
            progress: 0,
        }));
        setFiles((prev) => [...prev, ...newEntries]);
    }, []);

    const removeFile = useCallback((id: string) => {
        setFiles((prev) => prev.filter((f) => f.id !== id));
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    }, [addFiles]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
    }, []);

    // -----------------------------------------------------------------------
    // Submit: Create agent + upload documents
    // -----------------------------------------------------------------------

    const handleSubmit = async () => {
        setIsSubmitting(true);
        setSubmitError(null);

        try {
            // 1. Create the agent via store action (which calls chatService.createCustomAgent)
            await addCustomAgent({
                identity: {
                    name: name.trim(),
                    role: 'specialist',
                    color,
                },
                brain_config: {
                    model,
                    temperature,
                    system_prompt: systemPrompt.trim(),
                },
                owner_user_id: 'default_user',
                is_public: false,
            });

            // Retrieve the newly created agent ID from the store
            const customAgents = useChatStore.getState().customAgents;
            const createdAgent = customAgents[0]; // addCustomAgent prepends
            const agentId = createdAgent?.id;

            if (!agentId) {
                throw new Error('No se pudo obtener el ID del agente creado');
            }

            // 2. Upload files sequentially (if any)
            if (files.length > 0) {
                for (const entry of files) {
                    setFiles((prev) =>
                        prev.map((f) =>
                            f.id === entry.id ? { ...f, status: 'uploading', progress: 0 } : f
                        )
                    );

                    try {
                        await uploadDocument(agentId, entry.file, (progress) => {
                            setFiles((prev) =>
                                prev.map((f) =>
                                    f.id === entry.id ? { ...f, progress } : f
                                )
                            );
                        });

                        setFiles((prev) =>
                            prev.map((f) =>
                                f.id === entry.id ? { ...f, status: 'success', progress: 100 } : f
                            )
                        );
                    } catch (uploadErr: any) {
                        setFiles((prev) =>
                            prev.map((f) =>
                                f.id === entry.id
                                    ? { ...f, status: 'error', errorMessage: uploadErr.message ?? 'Error al subir' }
                                    : f
                            )
                        );
                    }
                }
            }

            onAgentCreated(agentId);
            onClose();
        } catch (err: any) {
            setSubmitError(err.message ?? 'Error al crear el agente');
        } finally {
            setIsSubmitting(false);
        }
    };

    // -----------------------------------------------------------------------
    // Document upload helper
    // -----------------------------------------------------------------------

    const uploadDocument = async (
        agentId: string,
        file: File,
        onProgress: (pct: number) => void,
    ): Promise<void> => {
        const formData = new FormData();
        formData.append('file', file);

        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${API_URL}/agents/${agentId}/documents`);

            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    onProgress(Math.round((e.loaded / e.total) * 100));
                }
            });

            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve();
                } else {
                    reject(new Error(`Upload failed: ${xhr.status}`));
                }
            });

            xhr.addEventListener('error', () => reject(new Error('Network error')));
            xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

            xhr.send(formData);
        });
    };

    // -----------------------------------------------------------------------
    // Derived values
    // -----------------------------------------------------------------------

    const filteredTemplates = categoryFilter
        ? templates.filter((t) => t.category === categoryFilter)
        : templates;

    const categories = Array.from(new Set(templates.map((t) => t.category)));

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
                        <Button variant="primary" onClick={handleNext} disabled={!canProceed()}>
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
                                                    isDone && 'bg-white/5 text-content-muted hover:bg-white/10 cursor-pointer',
                                                    !isActive && !isDone && 'text-content-quiet cursor-not-allowed',
                                                )}
                                            >
                                                <StepIcon className="h-3.5 w-3.5" />
                                                <span className="hidden sm:inline">{s.label}</span>
                                            </button>
                                            {i < STEPS.length - 1 && (
                                                <div className={cn(
                                                    'flex-1 h-px transition-colors',
                                                    i < step ? 'bg-electric-cyan/30' : 'bg-white/5',
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
                                        templatesLoading={templatesLoading}
                                        templatesError={templatesError}
                                        categories={categories}
                                        categoryFilter={categoryFilter}
                                        onCategoryFilter={setCategoryFilter}
                                        onSelectTemplate={handleSelectTemplate}
                                        onStartFromScratch={handleStartFromScratch}
                                    />
                                )}
                                {step === 1 && (
                                    <StepConfigure
                                        key="step-1"
                                        direction={direction}
                                        name={name}
                                        setName={setName}
                                        description={description}
                                        setDescription={setDescription}
                                        systemPrompt={systemPrompt}
                                        setSystemPrompt={setSystemPrompt}
                                        color={color}
                                        setColor={setColor}
                                        temperature={temperature}
                                        setTemperature={setTemperature}
                                        model={model}
                                        setModel={setModel}
                                        isTemplate={method === 'template'}
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
                                        suggestedFiles={selectedTemplate?.suggested_files ?? []}
                                        onDrop={handleDrop}
                                        onDragOver={handleDragOver}
                                        onDragLeave={handleDragLeave}
                                        onAddFiles={addFiles}
                                        onRemoveFile={removeFile}
                                        onSkip={handleNext}
                                    />
                                )}
                                {step === 3 && (
                                    <StepReview
                                        key="step-3"
                                        direction={direction}
                                        name={name}
                                        description={description}
                                        systemPrompt={systemPrompt}
                                        color={color}
                                        temperature={temperature}
                                        model={model}
                                        files={files}
                                        templateName={selectedTemplate?.name ?? null}
                                        isSubmitting={isSubmitting}
                                        submitError={submitError}
                                        onSubmit={handleSubmit}
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
                className="w-full flex items-center gap-5 p-6 rounded-3xl bg-white/[0.03] border-2 border-dashed border-white/10 hover:border-electric-cyan/40 hover:bg-white/[0.06] transition-all text-left group"
            >
                <div className="p-4 bg-electric-cyan/10 rounded-2xl group-hover:bg-electric-cyan/20 transition-colors shrink-0">
                    <PenLine className="h-7 w-7 text-electric-cyan" />
                </div>
                <div className="min-w-0">
                    <p className="font-bold text-white text-lg group-hover:text-electric-cyan transition-colors">
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
                <div className="flex-1 h-px bg-white/5" />
                <span className="text-[10px] font-bold text-content-muted uppercase tracking-widest">
                    o usa una plantilla
                </span>
                <div className="flex-1 h-px bg-white/5" />
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
                                : 'bg-white/[0.03] text-content-muted border-white/5 hover:border-white/10 hover:text-content-strong',
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
                                        ? 'bg-white/10 text-white border-white/20'
                                        : 'bg-white/[0.03] text-content-muted border-white/5 hover:border-white/10 hover:text-content-strong',
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
                <div className="flex items-center justify-center py-12 gap-3 text-red-400/80">
                    <AlertCircle className="h-5 w-5" />
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
                                className="flex items-start gap-4 p-5 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-luxury-purple/40 hover:bg-white/[0.06] transition-all text-left group"
                            >
                                <div className={cn(
                                    'p-3 rounded-xl bg-white/[0.05] border border-white/5 shrink-0',
                                    meta?.color ?? 'text-gray-400',
                                )}>
                                    <TemplateIcon className="h-5 w-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="font-bold text-white text-sm group-hover:text-luxury-purple transition-colors truncate">
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
                                                    className="px-2 py-0.5 bg-white/5 text-content-muted rounded-md text-[10px] font-medium"
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
    name: string;
    setName: (v: string) => void;
    description: string;
    setDescription: (v: string) => void;
    systemPrompt: string;
    setSystemPrompt: (v: string) => void;
    color: string;
    setColor: (v: string) => void;
    temperature: number;
    setTemperature: (v: number) => void;
    model: string;
    setModel: (v: string) => void;
    isTemplate: boolean;
}

function StepConfigure({
    direction,
    name, setName,
    description, setDescription,
    systemPrompt, setSystemPrompt,
    color, setColor,
    temperature, setTemperature,
    model, setModel,
    isTemplate,
}: StepConfigureProps) {
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
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Analista Financiero, Redactor SEO..."
            />

            <TextField
                label="Descripción breve"
                id="wizard-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
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
                onChange={(e) => setSystemPrompt(e.target.value)}
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
                        className="flex flex-wrap gap-2 p-3 rounded-2xl bg-white/[0.03] border border-white/5"
                    >
                        {PRESET_COLORS.map((c) => (
                            <button
                                key={c}
                                type="button"
                                onClick={() => setColor(c)}
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
                    <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 space-y-3">
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
                            onChange={(e) => setTemperature(parseFloat(e.target.value))}
                            aria-valuetext={`${temperature.toFixed(1)} de 2`}
                            className="w-full accent-electric-cyan h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer
                                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
                                       [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-electric-cyan
                                       [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(0,245,212,0.4)]
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
                                onClick={() => setModel(opt.value)}
                                aria-pressed={model === opt.value}
                                className={cn(
                                    'w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left',
                                    model === opt.value
                                        ? 'bg-electric-cyan/10 border-electric-cyan/30 text-white'
                                        : 'bg-white/[0.03] border-white/5 text-gray-400 hover:border-white/10 hover:text-gray-300',
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
                                    <p className="text-[10px] text-content-muted">{opt.description}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Preview pill */}
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center text-white font-bold text-sm border border-white/10"
                    style={{ backgroundColor: color + '30', borderColor: color + '50' }}
                >
                    {name.trim() ? name.trim().charAt(0).toUpperCase() : '?'}
                </div>
                <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">
                        {name.trim() || 'Nombre del agente'}
                    </p>
                    <p className="text-xs text-content-muted truncate">
                        {description.trim() || 'Sin descripcion'}
                    </p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-white/5 text-content-muted rounded text-[10px] font-mono">
                        {model}
                    </span>
                    <span className="px-2 py-0.5 bg-white/5 text-content-muted rounded text-[10px] font-mono">
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
                <h3 className="text-base font-bold text-white">Base de Conocimiento</h3>
                <p className="text-sm text-content-muted">
                    Sube documentos para que tu agente tenga contexto especializado. Este paso es opcional.
                </p>
            </div>

            {/* Suggested files hint */}
            {suggestedFiles.length > 0 && (
                <div className="p-4 rounded-2xl bg-luxury-purple/5 border border-luxury-purple/20">
                    <p className="text-xs font-bold text-luxury-purple mb-2 flex items-center gap-1.5">
                        <Sparkles className="h-3 w-3" />
                        Archivos sugeridos por la plantilla
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {suggestedFiles.map((sf) => (
                            <span
                                key={sf}
                                className="px-2.5 py-1 bg-white/5 text-gray-400 rounded-lg text-xs border border-white/5"
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
                        'flex w-full flex-col items-center justify-center gap-4 p-10 rounded-2xl border-2 border-dashed cursor-pointer transition-all',
                        isDragOver
                            ? 'border-accent/60 bg-accent/5'
                            : 'border-stroke-edge bg-surface-2 hover:border-brass-600 hover:bg-surface-3',
                    )}
                >
                    <span className={cn(
                        'p-4 rounded-2xl transition-colors',
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
                    <p className="text-[10px] font-bold text-content-muted uppercase tracking-widest ml-1">
                        Archivos ({files.length})
                    </p>
                    <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
                        {files.map((entry) => (
                            <div
                                key={entry.id}
                                data-row
                                className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5 group"
                            >
                                <div className="p-2 bg-white/5 rounded-lg shrink-0">
                                    <File className="h-4 w-4 text-gray-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-white truncate">
                                        {entry.file.name}
                                    </p>
                                    <p className="text-[10px] text-content-muted">
                                        {formatSize(entry.file.size)}
                                    </p>
                                </div>
                                {/* Status indicator */}
                                <div className="shrink-0">
                                    {entry.status === 'pending' && (
                                        <span className="text-[10px] text-content-muted font-medium">Listo</span>
                                    )}
                                    {entry.status === 'uploading' && (
                                        <div className="flex items-center gap-2">
                                            <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-electric-cyan rounded-full transition-all duration-300"
                                                    style={{ width: `${entry.progress}%` }}
                                                />
                                            </div>
                                            <span className="text-[10px] text-electric-cyan font-mono">
                                                {entry.progress}%
                                            </span>
                                        </div>
                                    )}
                                    {entry.status === 'success' && (
                                        <CheckCircle2 className="h-4 w-4 text-green-400" />
                                    )}
                                    {entry.status === 'error' && (
                                        <div className="flex items-center gap-1.5" title={entry.errorMessage}>
                                            <XCircle className="h-4 w-4 text-red-400" />
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
    name: string;
    description: string;
    systemPrompt: string;
    color: string;
    temperature: number;
    model: string;
    files: FileEntry[];
    templateName: string | null;
    isSubmitting: boolean;
    submitError: string | null;
    onSubmit: () => void;
}

function StepReview({
    direction,
    name,
    description,
    systemPrompt,
    color,
    temperature,
    model,
    files,
    templateName,
    isSubmitting,
    submitError,
}: StepReviewProps) {
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
            <div className="rounded-2xl bg-white/[0.03] border border-white/5 overflow-hidden">
                {/* Agent header */}
                <div className="p-6 flex items-center gap-4 border-b border-white/5">
                    <div
                        className="h-14 w-14 rounded-2xl flex items-center justify-center text-white font-bold text-xl border border-white/10 shadow-lg"
                        style={{
                            backgroundColor: color + '25',
                            borderColor: color + '40',
                            boxShadow: `0 0 30px ${color}15`,
                        }}
                    >
                        {name.trim().charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-lg font-bold text-white truncate">{name}</p>
                        {description && (
                            <p className="text-sm text-content-muted truncate mt-0.5">{description}</p>
                        )}
                    </div>
                    {templateName && (
                        <span className="px-3 py-1 bg-luxury-purple/10 text-luxury-purple border border-luxury-purple/20 rounded-xl text-[10px] font-bold shrink-0">
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
                                    className="h-4 w-4 rounded-md border border-white/10"
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
                    <p className="text-[10px] font-bold text-content-muted uppercase tracking-widest mb-2">
                        System Prompt
                    </p>
                    <div className="p-4 rounded-xl bg-midnight/60 border border-white/5 max-h-32 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
                        <p className="text-xs text-gray-400 font-mono leading-relaxed whitespace-pre-wrap">
                            {systemPrompt.length > 500
                                ? systemPrompt.substring(0, 500) + '...'
                                : systemPrompt}
                        </p>
                    </div>
                </div>

                {/* File list preview */}
                {files.length > 0 && (
                    <div className="px-6 pb-6">
                        <p className="text-[10px] font-bold text-content-muted uppercase tracking-widest mb-2">
                            Archivos a subir
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {files.map((f) => (
                                <span
                                    key={f.id}
                                    className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 text-gray-400 rounded-lg text-xs border border-white/5"
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
                    className="flex items-center gap-3 p-4 rounded-2xl bg-red-500/5 border border-red-500/20"
                >
                    <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
                    <p className="text-sm text-red-400">{submitError}</p>
                </motion.div>
            )}

            {/* Submission progress for files */}
            {isSubmitting && files.some((f) => f.status === 'uploading') && (
                <div className="space-y-2">
                    {files.map((f) => (
                        <div key={f.id} className="flex items-center gap-3">
                            <span className="text-xs text-content-muted truncate w-32">{f.file.name}</span>
                            <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <div
                                    className={cn(
                                        'h-full rounded-full transition-all duration-300',
                                        f.status === 'error' ? 'bg-red-400' : 'bg-electric-cyan',
                                    )}
                                    style={{ width: `${f.progress}%` }}
                                />
                            </div>
                            {f.status === 'success' && <Check className="h-4 w-4 text-green-400" />}
                            {f.status === 'error' && <XCircle className="h-4 w-4 text-red-400" />}
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
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1.5">
            <p className="text-[10px] font-bold text-content-muted uppercase tracking-widest flex items-center gap-1.5">
                {icon}
                {label}
            </p>
            <div className="text-sm font-semibold text-white">{value}</div>
        </div>
    );
}
