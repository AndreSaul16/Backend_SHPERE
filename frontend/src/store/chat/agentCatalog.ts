/**
 * El reparto fijo de SPHERE: quién es cada director, de qué color y qué dice al
 * abrir un canal.
 *
 * Es dato, no estado: nada de aquí depende de `set`/`get`. El slice de agentes
 * lo consume para nacer y `resetState` para devolver los directores a fábrica.
 */
import { v4 as uuidv4 } from 'uuid';
import type { Agent, Message } from '../../types';

// Saludos personalizados por agente (sin gastar tokens)
const AGENT_GREETINGS: Record<string, string> = {
    'group-chat': 'Bienvenido a la **Junta Directiva** de SPHERE. El Router analizará tu consulta y delegará al agente más adecuado.',
    'ceo-1': '¡Hola! Soy **Oberon**, tu CEO estratégico. Estoy aquí para ofrecerte visión de alto nivel, decisiones ejecutivas y liderazgo empresarial. ¿En qué puedo ayudarte?',
    'cto-1': '¡Saludos! Soy **Nexus**, tu CTO. Mi expertise incluye arquitectura cloud, DevOps, seguridad técnica y decisiones de infraestructura. ¿Cuál es tu desafío técnico?',
    'cmo-1': '¡Bienvenido! Soy **Vortex**, tu CMO. Me especializo en estrategia de marketing, branding, growth hacking y posicionamiento de mercado. ¿Qué necesitas impulsar?',
    'cfo-1': '¡Hola! Soy **Ledger**, tu CFO. Puedo ayudarte con análisis financiero, gestión de riesgos, proyecciones y optimización de costes. ¿Qué números analizamos?',
};

// Lista de Agentes
/**
 * Identidades de director — DESIGN §2.8.
 *
 * Los hex que había aquí eran la columna «Hex hoy» del contrato, la que §2.8
 * viene precisamente a sustituir: se preserva la FAMILIA DE TONO de cada
 * director (es compromiso de marca) y se unifican lightness y croma para que
 * los cinco lean como un solo sistema y todos pasen AA sobre las cuatro
 * superficies de paño. Oberon con el hex viejo (`#8A63D2`) daba ≈4,47:1 sobre
 * `baize-950`, por debajo de AA.
 *
 * Estos valores son `hexColor`, o sea los que viajan a SVG, `style` y al color
 * picker, donde no hay `var()`. El equivalente en token es `--agent-*`.
 */
/**
 * ⚠ LIMITACIÓN DECLARADA DE 7.6 — estos seis hex NO se han migrado a tokens.
 *
 * Los ratios de los comentarios están medidos contra `baize-950` y
 * `baize-800`, o sea contra el paño: en tema claro, `#B290EC` sobre `paper-100`
 * da 2.4:1. Los tokens `--agent-*` del bloque `[data-theme="light"]` de
 * `index.css` SÍ tienen valores recalculados para papel, y hoy no los consume
 * nadie desde JavaScript.
 *
 * Por qué no se ha hecho aquí, dicho en claro: `hexColor` no es un color de
 * pintura, es un DATO. Se usa en 43 sitios de 16 ficheros para componer
 * cadenas de opacidad a mano (`${color}15`, `${color}40`), viaja al backend
 * como el color elegido de un agente a medida y vuelve del backend en
 * `identity.color`. Convertirlo en algo que dependa del tema es una migración
 * de una tarde entera con riesgo sobre los dos efectos de firma —la Mesa y el
 * Palco— y no cabía en esta fase sin dejarla a medias.
 *
 * El camino ya está abierto y probado: `mermaidTheme.aHex()` convierte el
 * `oklch()` de un token a hex y `MermaidDiagram` lo usa desde D29 para seguir
 * al tema sin literales. Lo que falta es un `coloresDeAgente()` que lea
 * `--agent-ceo`… con `AGENT_HEX` de respaldo, y un punto donde recalcularlo al
 * cambiar de tema — que NO puede ser `useAgentes`, porque su `useShallow`
 * perdería la estabilidad de referencia que costó la tarea 4.6.
 *
 * Los colores de los agentes A MEDIDA no entran en esto: los elige el usuario
 * y no son de nadie más.
 */
export const AGENT_HEX: Record<
    'CEO' | 'CTO' | 'CFO' | 'CMO' | 'DEVIL' | 'user' | 'group' | 'custom',
    string
> = {
    CEO: '#B290EC',    // hue 300 · 7.50:1 sobre baize-950 · 5.81:1 sobre baize-800
    CTO: '#00BFB0',    // hue 185 · 8.42:1 · 6.52:1
    CFO: '#7BA2F9',    // hue 265 · 7.77:1 · 6.02:1
    CMO: '#DF80B8',    // hue 345 · 7.34:1 · 5.69:1
    DEVIL: '#ED7F84',  // hue 18  · 7.39:1 · 5.72:1
    user: '#2EB2EA',   // hue 232 · 8.04:1 · 6.23:1
    // La junta entera y los agentes a medida nacen en latón: §2.8 sólo asigna
    // identidad a los cinco directores, y el cian de antes era el acento del
    // sistema viejo que §0 rechaza.
    group: '#D7A94F',
    custom: '#D7A94F',
};

export const MOCK_AGENTS: Agent[] = [
    {
        id: 'group-chat',
        name: 'Junta Directiva',
        role: 'system',
        avatar: 'J',   // §10: inicial en la placa, nunca emoji
        description: 'Orquestación completa - El Router decide quién responde.',
        color: 'text-content-muted',
        hexColor: AGENT_HEX.group, // latón: la junta es la sala, no un color más
        isOnline: true,
        capabilities: ['Análisis Estratégico', 'Decisiones Ejecutivas', 'Coordinación Multi-agente'],
    },
    {
        id: 'ceo-1',
        name: 'Oberon (CEO)',
        role: 'CEO',
        avatar: 'O',
        description: 'Visión estratégica y liderazgo ejecutivo.',
        color: 'text-agent-ceo',
        hexColor: AGENT_HEX.CEO,
        isOnline: true,
        capabilities: ['Estrategia Corporativa', 'Toma de Decisiones', 'Visión de Negocio'],
    },
    {
        id: 'cto-1',
        name: 'Nexus (CTO)',
        role: 'CTO',
        avatar: 'N',
        description: 'Experto en Arquitectura Cloud y DevOps.',
        color: 'text-agent-cto',
        hexColor: AGENT_HEX.CTO,
        isOnline: true,
        capabilities: ['Cloud Architecture', 'DevOps', 'Seguridad Técnica'],
    },
    {
        id: 'cmo-1',
        name: 'Vortex (CMO)',
        role: 'CMO',
        avatar: 'V',
        description: 'Estratega de Mercado y Posicionamiento.',
        color: 'text-agent-cmo',
        hexColor: AGENT_HEX.CMO,
        isOnline: true,
        capabilities: ['Marketing Digital', 'Branding', 'Growth Hacking'],
    },
    {
        id: 'cfo-1',
        name: 'Ledger (CFO)',
        role: 'CFO',
        avatar: 'L',
        description: 'Auditor Financiero y Gestión de Riesgos.',
        color: 'text-agent-cfo',
        hexColor: AGENT_HEX.CFO,
        isOnline: true,
        capabilities: ['Análisis Financiero', 'Gestión de Riesgos', 'Proyecciones'],
    },
];

// Board V2: el Abogado del Diablo NO es un experto seleccionable (no entra en
// MOCK_AGENTS ni en getGroupMembers). Es un asiento opcional del debate; su
// identidad visual se resuelve aquí cuando aparece en el war-room / burbujas.
export const BOARD_DEVIL_AGENT: Agent = {
    id: 'devil-1',
    name: 'Némesis (Abogado del Diablo)',
    role: 'DEVIL',
    avatar: 'N',   // Némesis. §10: inicial en la placa, nunca emoji
    description: 'Estresa la decisión: busca el fallo que el consenso ignora.',
    color: 'text-agent-devil',
    hexColor: AGENT_HEX.DEVIL,
    isOnline: true,
};

// Resuelve la identidad visual de un rol de board (incluido DEVIL, que no está
// en la lista de agentes seleccionables).
export const getBoardAgentByRole = (agents: Agent[], role: string): Agent | undefined => {
    if (role === 'DEVIL') return BOARD_DEVIL_AGENT;
    return agents.find(a => a.role === role && a.id !== 'group-chat');
};

// Helper: crear mensaje de saludo
export const createGreeting = (agentId: string, agents: Agent[]): Message => {
    const agent = agents.find(a => a.id === agentId);
    return {
        id: uuidv4(),
        role: agentId === 'group-chat' ? 'system' : (agent?.role || 'system'),
        content: AGENT_GREETINGS[agentId] || `Conectado con ${agent?.name || 'agente'}.`,
        timestamp: new Date(),
        agentId: agentId !== 'group-chat' ? agentId : undefined,
    };
};

// Helpers
export const getGroupMembers = (agents: Agent[]) => agents.filter(a => a.id !== 'group-chat');
