import { render as renderSinRouter, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach } from 'vitest';
import { ToolExecutionCard } from '../../src/components/chat/ToolExecutionCard';
import { useChatStore } from '../../src/store/useChatStore';

/**
 * §8.9 «El Latido de la Actuación».
 *
 * «Cuando una herramienta real arranca, su tarjeta emite **un** anillo
 * concéntrico desde el glifo — un latido, no un pulso perpetuo — y mientras la
 * ejecución está en vuelo corre la barra indeterminada de 2px: un bucle
 * honesto, porque hay un proceso real en curso. Al resolverse (…) el anillo no
 * vuelve.»
 *
 * Lo que se afirma aquí, y por qué así:
 *
 *  · **Una iteración, no un bucle.** Es la frase que separa un latido de un
 *    pulso perpetuo, y es lo que §7.4 presupuesta. Se mira en el estilo en
 *    línea del elemento —que es el que de verdad gobierna la animación— y no en
 *    un nombre de clase de Tailwind: una clase no dice cuántas veces corre.
 *  · **El anillo no vuelve.** Resuelta la herramienta, el elemento no está.
 *  · **La barra sólo mientras hay vuelo.** Un indeterminado sobre algo que ya
 *    terminó es una mentira, y encima un bucle que nadie ha presupuestado.
 */

const render = (ui: ReactElement) => renderSinRouter(<MemoryRouter>{ui}</MemoryRouter>);

describe('Latido de actuación — §8.9', () => {
    beforeEach(() => {
        useChatStore.getState().resetState();
    });

    it('al arrancar la herramienta late una vez y corre la barra en vuelo', () => {
        render(<ToolExecutionCard toolName="notion_create_page" status="running" />);

        const latido = screen.getByTestId('latido-actuacion');
        expect(latido.style.animationName).toBe('latido-actuacion');
        expect(latido.style.animationIterationCount).toBe('1');
        expect(latido.style.animationDuration).toBe('600ms');

        // El vuelo se ve y se dice: barra indeterminada y `aria-busy`.
        expect(screen.getByTestId('barra-en-vuelo')).toBeInTheDocument();
        expect(screen.getByTestId('tarjeta-de-utensilio')).toHaveAttribute('aria-busy', 'true');
    });

    it('resuelta con éxito, el anillo no vuelve y la barra se apaga', () => {
        render(
            <ToolExecutionCard
                toolName="notion_create_page"
                status="completed"
                result="Página creada"
            />,
        );

        expect(screen.queryByTestId('latido-actuacion')).toBeNull();
        expect(screen.queryByTestId('barra-en-vuelo')).toBeNull();
        expect(screen.getByTestId('tarjeta-de-utensilio')).not.toHaveAttribute('aria-busy', 'true');
    });

    it('resuelta en fallo, tampoco late ni corre nada', () => {
        render(
            <ToolExecutionCard
                toolName="notion_create_page"
                status="failed"
                error="Notion no respondió"
            />,
        );

        expect(screen.queryByTestId('latido-actuacion')).toBeNull();
        expect(screen.queryByTestId('barra-en-vuelo')).toBeNull();
        // Y el fallo sigue contándose, que es lo que la tarjeta existe para hacer.
        expect(screen.getByText('Notion no respondió')).toBeInTheDocument();
    });

    it('esperando confirmación no hay vuelo: nadie está ejecutando nada', () => {
        render(
            <ToolExecutionCard
                toolName="whatsapp_send_message"
                status="awaiting_confirmation"
                resumen="Enviar «llego tarde» a +34600111222"
            />,
        );

        expect(screen.queryByTestId('latido-actuacion')).toBeNull();
        expect(screen.queryByTestId('barra-en-vuelo')).toBeNull();
        // Lo que sí hay es lo que se le pregunta al usuario.
        expect(screen.getByText('Enviar «llego tarde» a +34600111222')).toBeInTheDocument();
    });
});
