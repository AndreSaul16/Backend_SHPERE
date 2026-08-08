import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import {
    MODULOS_DE_RUTA,
    precargaAlApuntar,
    precargarRuta,
    __resetPrecarga,
    type RutaPerezosa,
} from '../../src/lib/rutasPerezosas';
import {
    EsqueletoDeAutenticacion,
    EsqueletoDeChat,
    EsqueletoDeDocumento,
    EsqueletoDePagina,
} from '../../src/components/shared/EsqueletosDeRuta';

/**
 * Tarea 4.1 · D17a y su riesgo R3.
 *
 * R3 dice que el `React.lazy` masivo introduce parpadeos de `Suspense` en la
 * navegación, y fija la mitigación por escrito: «Un `<Suspense>` por ruta con el
 * skeleton del layout de esa ruta, **nunca un spinner centrado**. Precarga en
 * `onMouseEnter` de los enlaces de la sidebar». El test que pide es «un test que
 * navega y comprueba que no aparece un spinner de página completa».
 *
 * Aquí se comprueba lo que de verdad se puede comprobar sin montar Firebase: que
 * ninguna de las cuatro esperas es un spinner, que todas anuncian el estado, y
 * que la precarga del rail existe, dispara una sola vez y no se traga los
 * fallos en silencio para siempre.
 */

const ESPERAS = [
    ['el chat', EsqueletoDeChat, /abriendo la junta/i],
    ['una página', EsqueletoDePagina, /abriendo la página/i],
    ['la entrada', EsqueletoDeAutenticacion, /cargando/i],
    ['la conversación compartida', EsqueletoDeDocumento, /abriendo la conversación/i],
] as const;

describe('las esperas de ruta no son un spinner', () => {
    for (const [nombre, Esqueleto, etiqueta] of ESPERAS) {
        it(`la espera de ${nombre} tiene la forma de su layout y se anuncia`, () => {
            const { container } = render(<Esqueleto />);

            // Se anuncia: sin esto, quien no ve la pantalla se come varios
            // segundos de silencio en una conexión lenta.
            expect(screen.getByRole('status', { name: etiqueta })).toBeInTheDocument();

            // Es un esqueleto de §9.12, no un disco girando. `animate-spin` y
            // los `rounded-full` de un spinner son justo lo que R3 prohíbe.
            expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(2);
            expect(container.querySelector('.animate-spin')).toBeNull();
            expect(container.querySelector('[class*="border-t-transparent"]')).toBeNull();
        });
    }

    it('la espera del chat reserva cabecera, turnos y compositor', () => {
        const { container } = render(<EsqueletoDeChat />);
        // La forma es la información: si el esqueleto no reserva el sitio, al
        // llegar el módulo hay salto de layout, que es lo que CLS mide.
        expect(container.querySelector('.h-20')).not.toBeNull();       // cabecera
        expect(container.querySelectorAll('.skeleton').length).toBeGreaterThanOrEqual(9);
    });
});

describe('precarga de rutas desde el rail', () => {
    beforeEach(() => __resetPrecarga());

    it('cada ruta perezosa de App tiene su entrada en el catálogo', () => {
        // El catálogo es lo que garantiza que la precarga y el `lazy` piden el
        // MISMO especificador: dos literales distintos darían dos trozos con el
        // mismo código y la precarga calentaría el que no se usa.
        expect(Object.keys(MODULOS_DE_RUTA).sort()).toEqual([
            'admin', 'ajustes', 'ajustesDeConversacion', 'chat', 'conversacionCompartida',
            'detalleDeAgente', 'entrar', 'facturacion', 'panelDeArtefactos', 'perfil',
            'registro', 'verificarEmail',
        ]);
    });

    it('apuntar, enfocar o tocar el enlace precarga; y sólo una vez', () => {
        const pedidos: string[] = [];
        const espia = vi.spyOn(MODULOS_DE_RUTA, 'ajustes').mockImplementation(() => {
            pedidos.push('ajustes');
            return Promise.resolve({} as never);
        });

        const atributos = precargaAlApuntar('ajustes');
        render(<a href="/settings" {...atributos}>Configuración</a>);
        const enlace = screen.getByRole('link', { name: 'Configuración' });

        fireEvent.mouseEnter(enlace);
        fireEvent.focus(enlace);
        fireEvent.touchStart(enlace);

        // Tres gestos, UNA petición: el trozo ya está pedido.
        expect(pedidos).toEqual(['ajustes']);
        espia.mockRestore();
    });

    it('si la precarga falla, el siguiente intento vuelve a pedirlo', async () => {
        // La precarga es una apuesta, no una carga: un fallo de red no puede
        // dejar la ruta marcada como «ya pedida» para siempre, porque entonces
        // el clic de verdad tampoco la pediría.
        let intentos = 0;
        const espia = vi.spyOn(MODULOS_DE_RUTA, 'facturacion').mockImplementation(() => {
            intentos += 1;
            return Promise.reject(new Error('red caída'));
        });

        precargarRuta('facturacion');
        await Promise.resolve();
        await Promise.resolve();
        precargarRuta('facturacion');

        expect(intentos).toBe(2);
        espia.mockRestore();
    });

    it('precargar una ruta desconocida no revienta el rail', () => {
        // El tipo lo impide en compilación, pero el rail pinta enlaces a partir
        // de datos del backend y en runtime no hay tipos. Un TypeError dentro
        // de un `onFocus` tumbaría la navegación por teclado del rail entero.
        expect(() => precargarRuta('no-existe' as RutaPerezosa)).not.toThrow();
    });
});
