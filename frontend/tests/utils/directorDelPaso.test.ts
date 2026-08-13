import { describe, it, expect } from 'vitest';
import { DIRECTORES, directorDelPaso, directorDestino } from '../../src/utils/directorDelPaso';
import { MOCK_AGENTS, BOARD_DEVIL_AGENT } from '../../src/store/chat/agentCatalog';

/**
 * ASH-002/003/004 — de quién es un próximo paso.
 *
 * Sale del TEXTO del paso y de nada más. Descartado inferirlo de la fase (los
 * próximos pasos los emite siempre la síntesis, así que siempre sería el CEO) y
 * descartado un clasificador temático («runway» → CFO): es una conjetura
 * disfrazada de dato, y cuando falla el usuario abre el chat equivocado. Que el
 * nombre esté escrito en el acta es trabajo de BTH-008, no de este parser.
 */

describe('ASH-002 — resolver el director del paso', () => {
    it('reconoce «Nexus (CTO): …» por el rol', () => {
        expect(directorDelPaso('Nexus (CTO): migrar el pipeline de despliegue', '')).toBe('CTO');
    });

    it('reconoce un rol suelto en negrita markdown', () => {
        expect(directorDelPaso('**CFO** — revisar el runway', '')).toBe('CFO');
    });

    it('reconoce «Responsable: CMO»', () => {
        expect(directorDelPaso('Responsable: CMO', '')).toBe('CMO');
    });

    it('devuelve null cuando el paso no nombra a nadie', () => {
        expect(directorDelPaso('Revisar el informe', '')).toBeNull();
    });

    it('no casa un rol dentro de otra palabra', () => {
        // `CTOS` y `director` contienen las letras, pero no son el rol.
        expect(directorDelPaso('Revisar los CTOS del sector', '')).toBeNull();
        expect(directorDelPaso('Hablar con el director del banco', '')).toBeNull();
    });

    it('con dos responsables gana la primera aparición', () => {
        expect(directorDelPaso('CMO y CFO revisan la campaña', '')).toBe('CMO');
    });

    it('reconoce el nombre propio, no sólo el rol', () => {
        expect(directorDelPaso('Ledger prepara el cierre trimestral', '')).toBe('CFO');
    });

    it('ignora mayúsculas y tildes', () => {
        expect(directorDelPaso('nexus revisa la arquitectura', '')).toBe('CTO');
        expect(directorDelPaso('NÉXUS revisa la arquitectura', '')).toBe('CTO');
    });

    it('el título manda sobre el cuerpo', () => {
        expect(directorDelPaso('CMO lanza la campaña', 'Coordinar con el CFO el presupuesto')).toBe('CMO');
    });

    it('si el título no nombra a nadie, mira el cuerpo', () => {
        expect(directorDelPaso('Cerrar la ronda', 'Lo lleva Ledger con el banco')).toBe('CFO');
    });
});

describe('ASH-003/004 — a qué chat se abre', () => {
    it('un paso sin responsable cae en Oberon (CEO), que es quien delega', () => {
        const destino = directorDestino('Revisar el informe', '');

        expect(destino.rol).toBe('CEO');
        expect(destino.nombre).toBe('Oberon');
        expect(destino.agentId).toBe('ceo-1');
        expect(destino.explicito).toBe(false);
    });

    it('un paso con responsable abre el chat de ese director', () => {
        const destino = directorDestino('Nexus (CTO): migrar el pipeline', '');

        expect(destino.rol).toBe('CTO');
        expect(destino.nombre).toBe('Nexus');
        expect(destino.agentId).toBe('cto-1');
        expect(destino.explicito).toBe(true);
    });

    it('Némesis cae en Oberon: el Abogado del Diablo no es un canal de ejecución', () => {
        const destino = directorDestino('Némesis: cuestionar la proyección de ingresos', '');

        expect(destino.rol).toBe('CEO');
        expect(destino.agentId).toBe('ceo-1');
        expect(destino.agentId).not.toBe(BOARD_DEVIL_AGENT.id);
    });

    it('el destino SIEMPRE pertenece a MOCK_AGENTS, nunca al Abogado del Diablo', () => {
        const pasos = [
            ['Nexus (CTO): migrar el pipeline', ''],
            ['**CFO** — revisar el runway', ''],
            ['Responsable: CMO', ''],
            ['Revisar el informe', ''],
            ['Némesis: cuestionar los ingresos', ''],
            ['DEVIL debería opinar', ''],
        ];
        const idsValidos = MOCK_AGENTS.map((a) => a.id);

        for (const [titulo, cuerpo] of pasos) {
            const destino = directorDestino(titulo, cuerpo);
            expect(idsValidos).toContain(destino.agentId);
            expect(destino.agentId).not.toBe(BOARD_DEVIL_AGENT.id);
        }
    });
});

describe('Deriva contra el catálogo real', () => {
    /**
     * La tabla de directores y `MOCK_AGENTS` son dos listas que tienen que
     * decir lo mismo. Esto es lo que hace que la deriva se caiga sola en vez de
     * salir a producción como un botón que abre el chat de nadie.
     */
    it('cada director de la tabla existe en MOCK_AGENTS con su nombre y su rol', () => {
        expect(DIRECTORES).toHaveLength(4);

        for (const director of DIRECTORES) {
            const agente = MOCK_AGENTS.find((a) => a.role === director.rol);
            expect(agente, `no hay agente con rol ${director.rol}`).toBeDefined();
            expect(agente!.name).toContain(director.nombre);
            expect(agente!.id).toBe(director.agentId);
        }
    });

    it('Némesis NO está en la tabla: por eso es inalcanzable, no por un if', () => {
        const roles = DIRECTORES.map((d) => d.rol);
        const nombres = DIRECTORES.map((d) => d.nombre);

        expect(roles).not.toContain('DEVIL');
        expect(nombres).not.toContain('Némesis');
    });
});
