import { describe, it, expect } from 'vitest';
import { colorDeAgente, rellenoDeIdentidad } from '../../src/lib/colorDeAgente';
import { AGENT_HEX } from '../../src/store/chat/agentCatalog';

/**
 * §2.8 «Relleno de identidad» — el turno de un director lleva SU tinte.
 *
 * Hasta el ciclo Viveza-1 todas las burbujas de agente compartían
 * `bg-ai-bubble` (= `--surface-2`, plano), y la identidad vivía sólo en el
 * filete de 2px y en el nombre en versalitas. En móvil la placa va
 * `hidden sm:flex`, así que quedaba un filete de 2px como única señal de quién
 * habla. La burbuja del USUARIO sí llevaba relleno (`bg-user-bubble/12`): la
 * asimetría no estaba decidida, estaba heredada.
 *
 * El punto crítico de este contrato NO es el porcentaje: es que el relleno se
 * derive de la MISMA fuente de color que ya pinta el filete y el nombre
 * (`colorDeAgente`). Así, un override de sesión y un agente a medida heredan el
 * tinte gratis, sin una segunda tabla de colores que se desincronice.
 */
describe('§2.8 — el relleno de identidad deriva del color del filete', () => {
    it('un director de catálogo tiñe con la variable de tema de su rol', () => {
        const relleno = rellenoDeIdentidad('CTO', AGENT_HEX.CTO);

        // La MISMA fuente que el filete: var(--agent-cto, #00BFB0).
        expect(relleno).toContain(colorDeAgente('CTO', AGENT_HEX.CTO));
        expect(relleno).toContain('--agent-cto');
        expect(relleno).toContain(AGENT_HEX.CTO);
    });

    it('mezcla en oklab contra el suelo y la proporción del TEMA, no contra un valor fijo', () => {
        const relleno = rellenoDeIdentidad('CEO', AGENT_HEX.CEO);

        // 12% sobre baize-900 en oscuro y 10% sobre paper-100 en claro es el
        // MISMO mecanismo con dos valores: si el porcentaje y el suelo se
        // escribieran aquí a pelo, el tema claro quedaría teñido contra paño.
        expect(relleno.startsWith('color-mix(in oklab,')).toBe(true);
        expect(relleno).toContain('var(--relleno-identidad-pct)');
        expect(relleno).toContain('var(--relleno-identidad-base)');
        // Y por eso NO puede llevar el suelo del tema oscuro escrito dentro.
        expect(relleno).not.toContain('baize-900');
    });

    it('un agente a medida tiñe con su hex elegido, sin variable de rol', () => {
        const relleno = rellenoDeIdentidad(undefined, '#D7A94F');

        expect(relleno).toContain('#D7A94F');
        expect(relleno).not.toContain('--agent-');
    });

    it('el color elegido para la sesión gana al token del rol, igual que en el filete', () => {
        // Misma regla que `colorDeAgente`: la identidad de tema sólo sustituye
        // a la identidad de CATÁLOGO. Un hex que eligió el usuario se respeta.
        const relleno = rellenoDeIdentidad('CTO', '#123456');

        expect(relleno).toContain('#123456');
        expect(relleno).not.toContain('--agent-cto');
    });
});
