import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';

export function ErrorOverlay() {
    const { errorStates } = useChatStore();

    // Obtenemos el primer error activo
    const activeError = Object.values(errorStates).find(msg => msg !== null);

    if (!activeError) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="fixed bottom-6 right-6 z-[100] max-w-md w-full"
            >
                <div className="bg-oxblood-500/12 border border-oxblood-500 rounded-md p-4 shadow-2xl flex items-start gap-3">
                    <div className="p-2 bg-red-500/20 rounded-lg flex-shrink-0">
                        <AlertCircle className="h-5 w-5 text-red-500" />
                    </div>
                    <div className="flex-1 min-w-0 pt-1">
                        <h4 className="text-sm font-bold text-red-500 uppercase tracking-widest">
                            Error del Sistema
                        </h4>
                        <p className="text-xs text-red-200/80 mt-1 leading-relaxed">
                            {activeError}
                        </p>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
