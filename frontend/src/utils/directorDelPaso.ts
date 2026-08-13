/**
 * De quién es un próximo paso del acta.
 *
 * Sale del TEXTO del paso y de nada más. Se descartaron dos alternativas:
 *
 *  - Inferirlo de la fase del debate. Los próximos pasos los emite siempre la
 *    síntesis, así que siempre saldría el CEO: un dato que no informa.
 *  - Un clasificador temático («runway» → CFO). Es una conjetura disfrazada de
 *    dato: cuando acierta no aporta nada que el texto no dijera ya, y cuando
 *    falla el usuario abre el chat equivocado y escribe allí.
 *
 * Que el nombre esté escrito en el acta es trabajo de la síntesis (BTH-008),
 * no de este parser. Aquí sólo se lee lo que haya.
 */

export type RolDirector = 'CEO' | 'CTO' | 'CFO' | 'CMO';

export interface Director {
    rol: RolDirector;
    nombre: string;
    agentId: string;
}

/**
 * Los cuatro directores ejecutables, y sólo ellos.
 *
 * Némesis (el Abogado del Diablo) NO está aquí a propósito: no es un canal de
 * ejecución —no aparece en `MOCK_AGENTS`, así que no tiene chat que abrir—. Que
 * un paso que lo nombre acabe en Oberon no lo decide un `if` que alguien pueda
 * borrar: lo decide que este vocabulario no sabe pronunciar su nombre. La
 * invariante «el destino siempre existe en el catálogo» es estructural.
 */
export const DIRECTORES: Director[] = [
    { rol: 'CEO', nombre: 'Oberon', agentId: 'ceo-1' },
    { rol: 'CTO', nombre: 'Nexus', agentId: 'cto-1' },
    { rol: 'CFO', nombre: 'Ledger', agentId: 'cfo-1' },
    { rol: 'CMO', nombre: 'Vortex', agentId: 'cmo-1' },
];

/** Quien delega cuando el paso no dice de quién es. */
const POR_DEFECTO: Director = DIRECTORES[0];

/** Minúsculas y sin tildes: «NÉXUS», «Néxus» y «nexus» son el mismo director. */
function normalizar(texto: string): string {
    return texto
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function escapar(termino: string): string {
    return termino.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * El primer director nombrado en un texto, o `null`.
 *
 * Límite de palabra obligatorio: `CTOS` y `director` contienen las letras de
 * `CTO` y no son el rol. Gana la primera aparición — determinista y explicable
 * («el que el acta escribió antes»), que es más de lo que puede decir cualquier
 * regla de prioridad inventada.
 */
function primerDirectorNombrado(texto: string): RolDirector | null {
    const plano = normalizar(texto);
    let mejor: { indice: number; rol: RolDirector } | null = null;

    for (const director of DIRECTORES) {
        for (const termino of [director.rol, director.nombre]) {
            const encaje = new RegExp(`\\b${escapar(normalizar(termino))}\\b`).exec(plano);
            if (encaje && (mejor === null || encaje.index < mejor.indice)) {
                mejor = { indice: encaje.index, rol: director.rol };
            }
        }
    }

    return mejor?.rol ?? null;
}

/** El rol responsable del paso: título primero, cuerpo después. `null` si nadie. */
export function directorDelPaso(title: string, body: string): RolDirector | null {
    return primerDirectorNombrado(title ?? '') ?? primerDirectorNombrado(body ?? '');
}

export interface DestinoDelPaso extends Director {
    /** `false` cuando el paso no nombraba a nadie y cae en el CEO por delegación. */
    explicito: boolean;
}

/**
 * A qué chat se abre el paso. Siempre devuelve un destino: un paso sin dueño va
 * a Oberon, que es quien delega, y el `aria-label` del botón dice por qué.
 */
export function directorDestino(title: string, body: string): DestinoDelPaso {
    const rol = directorDelPaso(title, body);
    const director = DIRECTORES.find((d) => d.rol === rol) ?? POR_DEFECTO;
    return { ...director, explicito: rol !== null };
}
