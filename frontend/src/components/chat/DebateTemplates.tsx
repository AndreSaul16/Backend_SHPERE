import { DEBATE_TEMPLATES } from "@/lib/debateTemplates";

interface DebateTemplatesProps {
    /** Se llama con el prompt de la plantilla; el llamante rellena el input (no envía). */
    onPick: (prompt: string) => void;
}

/**
 * Plantillas de debate (F7): chips clicables que rellenan el input de la junta.
 * Presentacional puro para poder testearlo en aislamiento.
 */
export function DebateTemplates({ onPick }: DebateTemplatesProps) {
    return (
        <div className="w-full max-w-2xl">
            <p className="text-micro font-bold text-content-muted uppercase mb-3">
                O empieza con una plantilla
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {DEBATE_TEMPLATES.map((tpl) => (
                    <button
                        key={tpl.id}
                        onClick={() => onPick(tpl.prompt)}
                        className="flex items-start gap-2.5 p-3 rounded-xl bg-stroke-highlight border border-stroke-edge hover:border-electric-cyan/30 hover:bg-electric-cyan/5 transition-all text-left group"
                    >
                        <span className="text-lg leading-none group-hover:scale-110 transition-transform">{tpl.emoji}</span>
                        <span className="text-sm text-content-muted group-hover:text-content-strong font-medium">{tpl.title}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
