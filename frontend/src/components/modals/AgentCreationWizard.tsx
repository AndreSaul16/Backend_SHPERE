/**
 * El asistente de creación de agentes: cuatro pasos dentro de un <Modal>.
 *
 * Eran 1458 líneas con dieciocho `useState` en el cuerpo (D41). Ahora este
 * fichero sólo hace de ORQUESTADOR —qué paso se ve, qué pasa al avanzar y qué
 * se le da a cada pantalla—, y el reparto de `agent-wizard/` es por
 * responsabilidad, no por tipo:
 *
 * - `wizardReducer`      todo el estado del formulario, con un `reset` que no
 *                        se puede dejar un campo sin borrar
 * - `useAgentTemplates`  el catálogo, que es estado del SERVIDOR
 * - `useAgentSubmission` crear el agente y subir sus documentos
 * - `WizardProgress`     la barra de pasos, que además navega
 * - `Step*`              las cuatro pantallas, que sólo pintan
 *
 * Lo que este fichero conserva a propósito, porque es suyo: el contrato con
 * `<Modal>` (§9.4 —trampa de foco, `Escape`, foco restaurado— y el velo que
 * aquí NO cierra, porque dentro hay trabajo del usuario), y las dos reglas de
 * navegación: no se avanza con el paso inválido y volver atrás no pierde nada.
 */
import { useEffect, useReducer, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { STEPS } from './agent-wizard/constants';
import type { WizardStep } from './agent-wizard/types';
import {
    canProceed,
    initialWizardState,
    newFileEntry,
    wizardReducer,
} from './agent-wizard/wizardReducer';
import { useAgentSubmission } from './agent-wizard/useAgentSubmission';
import { useAgentTemplates } from './agent-wizard/useAgentTemplates';
import { WizardProgress } from './agent-wizard/WizardProgress';
import { StepChooseMethod } from './agent-wizard/StepChooseMethod';
import { StepConfigure } from './agent-wizard/StepConfigure';
import { StepKnowledge } from './agent-wizard/StepKnowledge';
import { StepReview } from './agent-wizard/StepReview';

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
                <WizardProgress step={step} onGoTo={goTo} />

                {/* ---- Los cuatro pasos, uno cada vez ---- */}
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
