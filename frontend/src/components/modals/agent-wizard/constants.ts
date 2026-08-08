/**
 * El vocabulario fijo del asistente (D41): las tablas que no dependen de nada
 * y que sus cuatro pasos comparten.
 *
 * Estaban en cabecera de las 1458 líneas de `AgentCreationWizard.tsx`. No
 * cambia ni un valor: los comentarios de §2, §2.8 y P5 que justificaban cada
 * paleta vienen con ellas, porque son la razón por la que son ésos y no otros.
 */
import {
    Bot,
    Brain,
    Cpu,
    CheckCircle2,
    FileText,
    GraduationCap,
    HeartPulse,
    LayoutTemplate,
    Pen,
    PenLine,
    Scale,
    ShoppingCart,
    Sparkles,
    TrendingUp,
    Users,
} from 'lucide-react';
import { AGENT_HEX } from '@/store/useChatStore';
import { MODELOS } from '@/lib/modelos';

export const STEPS = [
    { label: 'Metodo', icon: LayoutTemplate },
    { label: 'Configurar', icon: Brain },
    { label: 'Conocimiento', icon: FileText },
    { label: 'Revisar', icon: CheckCircle2 },
] as const;

// §2: el latón es el único metal estructural. Los ocho colores crudos que
// había aquí eran decoración: la categoría la distingue su glifo, que es el
// segundo canal que pide P5.
export const CATEGORY_META: Record<string, { label: string; icon: typeof Scale; color: string }> = {
    legal:     { label: 'Legal',      icon: Scale,         color: 'text-accent' },
    health:    { label: 'Salud',      icon: HeartPulse,    color: 'text-accent' },
    finance:   { label: 'Finanzas',   icon: TrendingUp,    color: 'text-accent' },
    tech:      { label: 'Tecnologia', icon: Cpu,           color: 'text-accent' },
    creative:  { label: 'Creativo',   icon: Pen,           color: 'text-accent' },
    hr:        { label: 'RRHH',       icon: Users,         color: 'text-accent' },
    sales:     { label: 'Ventas',     icon: ShoppingCart,  color: 'text-accent' },
    education: { label: 'Educacion',  icon: GraduationCap, color: 'text-accent' },
};

// §2.8: las seis identidades del contrato más el latón. Los doce hex de antes
// eran la paleta del sistema viejo (cian neón, morado, magenta) y ninguno
// estaba calculado contra el paño.
export const PRESET_COLORS = [
    AGENT_HEX.custom, AGENT_HEX.CTO, AGENT_HEX.CFO,
    AGENT_HEX.CEO, AGENT_HEX.CMO, AGENT_HEX.DEVIL,
    AGENT_HEX.user,
];

/** D65/D66 — una sola lista de modelos en toda la app: `lib/modelos.ts`. */
export const MODEL_OPTIONS = MODELOS;

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

/** El glifo de una plantilla, por su nombre de icono. */
const TEMPLATE_ICONS: Record<string, typeof Scale> = {
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

/** Resuelve el icono de Lucide de una plantilla. Sin coincidencia, `Sparkles`. */
export const resolveTemplateIcon = (iconName: string) =>
    TEMPLATE_ICONS[iconName.toLowerCase()] ?? Sparkles;

/** La transición entre pasos: entra por donde va y sale por donde vino. */
export const slideVariants = {
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
