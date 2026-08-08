/**
 * Lo irreversible, separado y avisado.
 *
 * Tercera de las tres secciones de `AgentDetailPage.tsx` (7.3).
 */
import { memo } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Trash2 } from 'lucide-react';

interface Props {
    onEliminar: () => void;
}

export const SeccionPeligro = memo(function SeccionPeligro({ onEliminar }: Props) {
    return (
        <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="p-6 sm:p-8 rounded-md bg-oxblood-500/12 border border-oxblood-500 space-y-4"
        >
            <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-danger" />
                <h2 className="text-danger text-xs sm:text-sm uppercase tracking-widest font-mono">
                    Zona de Peligro
                </h2>
            </div>

            <p className="text-xs text-content-quiet leading-relaxed">
                Eliminar este agente es una acción irreversible. Se perderá toda la configuración,
                el system prompt, la base de conocimiento y los datos asociados.
            </p>

            <button
                type="button"
                onClick={onEliminar}
                className="flex items-center gap-2 px-4 py-2.5 bg-oxblood-500/10 border border-oxblood-500/30 rounded-xl text-sm font-medium text-danger hover:bg-oxblood-500 hover:text-content-strong transition-all"
            >
                <Trash2 className="h-4 w-4" />
                Eliminar Agente
            </button>
        </motion.section>
    );
});
