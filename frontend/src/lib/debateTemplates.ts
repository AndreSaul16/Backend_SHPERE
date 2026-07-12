/**
 * Plantillas de debate para la Junta (F7).
 * Prompts de arranque con huecos [entre corchetes] que el usuario completa.
 */
export interface DebateTemplate {
    id: string;
    emoji: string;
    title: string;
    prompt: string;
}

export const DEBATE_TEMPLATES: DebateTemplate[] = [
    {
        id: "pricing",
        emoji: "💰",
        title: "Estrategia de precios",
        prompt:
            "Estamos evaluando cambiar el precio de [producto] de [precio actual] a [precio propuesto]. Nuestro público es [segmento] y la competencia cobra [referencia]. ¿Deberíamos hacerlo y cómo?",
    },
    {
        id: "go-to-market",
        emoji: "🚀",
        title: "Go-to-market",
        prompt:
            "Vamos a lanzar [producto] para [segmento de clientes]. Tenemos un presupuesto de [presupuesto] y [plazo]. ¿Qué estrategia de entrada al mercado maximiza tracción y por qué?",
    },
    {
        id: "hiring",
        emoji: "🧑‍💼",
        title: "Contratación clave",
        prompt:
            "Necesitamos cubrir el puesto de [rol]. Dudamos entre [candidato/opción A] y [candidato/opción B], con un impacto en [área]. ¿A quién contratamos y qué riesgos asumimos?",
    },
    {
        id: "build-vs-buy",
        emoji: "🏗️",
        title: "Build vs buy",
        prompt:
            "Para resolver [necesidad] dudamos entre construir [solución propia] o comprar/integrar [proveedor/herramienta]. El coste estimado es [coste] y el plazo [plazo]. ¿Qué recomienda la junta?",
    },
    {
        id: "runway",
        emoji: "📉",
        title: "Runway / fundraising",
        prompt:
            "Tenemos [meses] de runway y quemamos [burn mensual] al mes. Estamos considerando [levantar ronda / recortar gastos / buscar revenue]. ¿Qué camino tomamos para no quedarnos sin caja?",
    },
    {
        id: "product-launch",
        emoji: "🎯",
        title: "Lanzamiento de producto",
        prompt:
            "Queremos lanzar [feature/producto] en [fecha]. Aún faltan [riesgos/pendientes] y el objetivo es [métrica de éxito]. ¿Lanzamos ya, esperamos o hacemos un soft-launch?",
    },
];
