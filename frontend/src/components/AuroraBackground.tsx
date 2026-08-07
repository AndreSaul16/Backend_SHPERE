import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useChatStore, getBoardAgentByRole } from '@/store/useChatStore';

export const AuroraBackground: React.FC = () => {
    // Board V2: la aurora reacciona al color del director que está hablando.
    const boardSession = useChatStore(state => state.boardSession);
    const getAgents = useChatStore(state => state.getAgents);
    // Accesibilidad: con prefers-reduced-motion los blobs quedan estáticos
    // (mantienen el tinte del agente que habla, sin loops de animación).
    const reducedMotion = useReducedMotion();

    const accentColor = React.useMemo(() => {
        if (!boardSession?.active) return null;
        const speaking = Object.entries(boardSession.statusByRole).find(([, s]) => s === 'speaking');
        if (!speaking) return null;
        const agent = getBoardAgentByRole(getAgents(), speaking[0]);
        return agent?.hexColor || null;
    }, [boardSession?.active, boardSession?.statusByRole, getAgents]);

    const reactive = !!accentColor && !reducedMotion;

    return (
        <div className="aurora-container">
            {/* Deep Blue Base */}
            <motion.div
                className="aurora-blob w-[600px] h-[600px] bg-blue-900/20 top-[-10%] left-[-10%]"
                animate={reducedMotion ? undefined : {
                    x: [0, 50, 0],
                    y: [0, 30, 0],
                    scale: [1, 1.1, 1],
                }}
                transition={{
                    duration: 20,
                    repeat: Infinity,
                    ease: "easeInOut"
                }}
            />

            {/* Electric Cyan Accent → se tiñe y agranda con el agente que habla */}
            <motion.div
                className="aurora-blob w-[500px] h-[500px] bottom-[10%] right-[-5%]"
                animate={{
                    ...(reducedMotion ? {} : {
                        x: [0, -40, 0],
                        y: [0, 50, 0],
                        scale: reactive ? [1.1, 1.35, 1.1] : [1, 1.2, 1],
                    }),
                    backgroundColor: accentColor ? `${accentColor}20` : 'rgba(0,245,212,0.10)',
                }}
                transition={{
                    duration: reactive ? 6 : 25,
                    repeat: Infinity,
                    ease: "easeInOut",
                    backgroundColor: { duration: 1.2 },
                }}
            />

            {/* Luxury Purple Glow */}
            <motion.div
                className="aurora-blob w-[700px] h-[700px] bg-luxury-purple/10 top-[20%] right-[10%]"
                animate={reducedMotion ? undefined : {
                    x: [0, -30, 0],
                    y: [0, -60, 0],
                    rotate: [0, 10, 0],
                }}
                transition={{
                    duration: 30,
                    repeat: Infinity,
                    ease: "easeInOut"
                }}
            />

            {/* Aquí vivía un velo a pantalla completa con 120px de desenfoque.
                Se retira: §P3 lo nombra literalmente como anti-patrón prohibido
                y §8.5 dice que el grano del paño lo SUSTITUYE — y el grano ya
                vive en `body`. Era una capa compuesta del tamaño del viewport
                que no aportaba nada y difuminaba el grano del tejido. */}
        </div>
    );
};
