import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
    TOPE_DE_PALABRAS,
    diffPorPalabras,
    resumenDeCambios,
} from '../../src/utils/diffPorPalabras';
import { VersionesDelTurno } from '../../src/components/chat/VersionesDelTurno';

/**
 * Tarea 5.11 · Q12 — diff de una respuesta regenerada.
 *
 * «Regenerar» ya existía y DESTRUÍA la respuesta anterior: truncaba el hilo
 * desde esa burbuja. Si habías gastado créditos en dos versiones te quedabas
 * con una y sin forma de decidir. La pérdida silenciosa de una respuesta pagada
 * es un fallo de producto.
 */

vi.mock('framer-motion', () => ({
    useReducedMotion: () => false,
    AnimatePresence: ({ children }: any) => children,
    motion: new Proxy({}, { get: () => ({ children }: any) => <div>{children}</div> }),
}));

describe('el diff por palabras', () => {
    it('lo igual se conserva y lo cambiado se marca', () => {
        const trozos = diffPorPalabras('el precio sube a 39', 'el precio sube a 49')!;
        expect(trozos.some((t) => t.tipo === 'quitado' && t.texto.includes('39'))).toBe(true);
        expect(trozos.some((t) => t.tipo === 'anadido' && t.texto.includes('49'))).toBe(true);
        expect(trozos.some((t) => t.tipo === 'igual' && t.texto.includes('precio'))).toBe(true);
    });

    it('reconstruye los dos textos sin perder ni un espacio', () => {
        const antes = 'uno  dos\ntres';
        const despues = 'uno dos cuatro';
        const trozos = diffPorPalabras(antes, despues)!;
        const rehechoAntes = trozos.filter((t) => t.tipo !== 'anadido').map((t) => t.texto).join('');
        const rehechoDespues = trozos.filter((t) => t.tipo !== 'quitado').map((t) => t.texto).join('');
        expect(rehechoAntes).toBe(antes);
        expect(rehechoDespues).toBe(despues);
    });

    it('dos textos idénticos no producen ningún cambio', () => {
        const trozos = diffPorPalabras('mismo texto', 'mismo texto')!;
        expect(trozos.every((t) => t.tipo === 'igual')).toBe(true);
        expect(resumenDeCambios(trozos)).toEqual({ anadidas: 0, quitadas: 0 });
    });

    it('los trozos contiguos del mismo tipo se funden: palabra a palabra es ilegible', () => {
        const trozos = diffPorPalabras('', 'tres palabras nuevas')!;
        expect(trozos.filter((t) => t.tipo === 'anadido')).toHaveLength(1);
    });

    it('el resumen cuenta palabras, no trozos', () => {
        const trozos = diffPorPalabras('a b c', 'a x y z')!;
        const { anadidas, quitadas } = resumenDeCambios(trozos);
        expect(anadidas).toBe(3);
        expect(quitadas).toBe(2);
    });

    it('dos textos enormes se rechazan en vez de congelar la pestaña', () => {
        const enorme = Array.from({ length: TOPE_DE_PALABRAS + 10 }, (_, i) => `p${i}`).join(' ');
        expect(diffPorPalabras(enorme, `${enorme} extra`)).toBeNull();
    });
});

describe('las versiones en la burbuja', () => {
    const montar = () =>
        render(
            <VersionesDelTurno
                versiones={['El precio sube a 39 euros.']}
                actual="El precio sube a 49 euros."
            />,
        );

    it('dice que se regeneró y numera las versiones', () => {
        montar();
        expect(screen.getByText(/regenerada/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /comparar la versión 1/i })).toBeInTheDocument();
        expect(screen.getByText(/v2 · actual/i)).toBeInTheDocument();
    });

    it('el diff no se abre solo: el hilo no se llena de bloques', () => {
        montar();
        expect(screen.queryByText(/palabras añadidas/i)).toBeNull();
    });

    it('elegir v1 abre el diff con su resumen en cifras', () => {
        montar();
        fireEvent.click(screen.getByRole('button', { name: /comparar la versión 1/i }));
        expect(screen.getByText(/palabras añadidas/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /comparar la versión 1/i }))
            .toHaveAttribute('aria-pressed', 'true');
    });

    it('lo quitado y lo añadido no se distinguen sólo por color (§P5)', () => {
        const { container } = montar();
        fireEvent.click(screen.getByRole('button', { name: /comparar la versión 1/i }));
        // `<del>` y `<ins>` son semánticos y además llevan tachado y subrayado.
        expect(container.querySelector('del')).not.toBeNull();
        expect(container.querySelector('ins')).not.toBeNull();
    });

    it('volver a pulsar cierra el diff', () => {
        montar();
        const boton = screen.getByRole('button', { name: /comparar la versión 1/i });
        fireEvent.click(boton);
        fireEvent.click(boton);
        expect(screen.queryByText(/palabras añadidas/i)).toBeNull();
    });

    it('con tres versiones se pueden comparar las dos anteriores', () => {
        render(<VersionesDelTurno versiones={['uno', 'dos']} actual="tres" />);
        expect(screen.getByRole('button', { name: /comparar la versión 1/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /comparar la versión 2/i })).toBeInTheDocument();
        expect(screen.getByText(/v3 · actual/i)).toBeInTheDocument();
    });

    it('si son demasiado largas lo dice y enseña la anterior entera', () => {
        const enorme = Array.from({ length: TOPE_DE_PALABRAS + 10 }, (_, i) => `p${i}`).join(' ');
        render(<VersionesDelTurno versiones={[enorme]} actual={`${enorme} extra`} />);
        fireEvent.click(screen.getByRole('button', { name: /comparar la versión 1/i }));
        expect(screen.getByText(/demasiado largas/i)).toBeInTheDocument();
    });
});
