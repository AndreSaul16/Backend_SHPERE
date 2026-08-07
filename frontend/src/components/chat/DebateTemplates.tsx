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
            <p className="text-[10px] font-bold text-content-muted uppercase tracking-widest mb-3">
                O empieza con una plantilla
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {DEBATE_TEMPLATES.map((tpl) => (
                    <button
                        key={tpl.id}
                        onClick={() => onPick(tpl.prompt)}
                        className="flex items-start gap-2.5 p-3 rounded-xl bg-white/[0.03] border border-white/10 hover:border-electric-cyan/30 hover:bg-electric-cyan/5 transition-all text-left group"
                    >
                        <span className="text-lg leading-none group-hover:scale-110 transition-transform">{tpl.emoji}</span>
                        <span className="text-sm text-gray-300 group-hover:text-white font-medium">{tpl.title}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
