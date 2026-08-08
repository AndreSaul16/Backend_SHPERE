/**
 * 7.5 · D46 — los primitivos de `components/ui/`, con sus estados.
 *
 * El criterio de la tarea es «cada primitivo con test de estados». Los que ya
 * tenían el suyo cuando empezó la fase 7 no se repiten aquí: `Field`,
 * `Modal`, `ConfirmDialog`, `Toast`, `InlineError` (en esta misma carpeta),
 * `EstadoVacio`, `AvatarImage`, `ConmutadorDeTema`, `BarraDeGuardado` (a
 * través de `GuardaDeCambios.test.tsx`). Lo que se cubre aquí es lo que no
 * tenía ninguno: las cinco variantes del botón con sus seis estados, la
 * silueta de espera y el panel que nace en esta tarea.
 *
 * Se prueban CLASES y ATRIBUTOS, no píxeles: lo que estos primitivos prometen
 * es que un estado se distingue de otro por algo que no es sólo el color, y
 * eso sí se puede afirmar sin un navegador.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '../../../src/components/ui/Button';
import { buttonClass, type ButtonVariant } from '../../../src/components/ui/buttonStyles';
import { panelClass } from '../../../src/components/ui/cardStyles';
import {
    EsqueletoDeFormulario,
    EsqueletoDeTarjetas,
    EsqueletoDeFilas,
} from '../../../src/components/ui/Esqueleto';

const VARIANTES: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'destructive', 'link'];

describe('Button — las cinco variantes y sus estados', () => {
    it.each(VARIANTES)('«%s» declara reposo, hover y deshabilitado', (variant) => {
        const clases = buttonClass({ variant });
        expect(clases).toContain('hover:');
        expect(clases).toContain('disabled:');
        // El anillo de foco NO se declara por variante: lo pone la regla
        // global de `:focus-visible`, que es la única forma de que sea
        // idéntico en las cinco (§9.1).
        expect(clases).not.toContain('focus-visible:ring');
    });

    it('deshabilitado se anuncia al lector, no sólo se atenúa', () => {
        render(<Button disabled>Guardar</Button>);
        expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
    });

    it('cargando bloquea el botón y cambia lo que dice', () => {
        render(<Button loading loadingLabel="Guardando…">Guardar</Button>);
        const boton = screen.getByRole('button');
        expect(boton).toBeDisabled();
        expect(boton).toHaveTextContent('Guardando…');
        // Un botón que se queda igual mientras trabaja invita a pulsarlo dos
        // veces, y aquí detrás hay cobros.
        expect(boton).not.toHaveTextContent('Guardar Guardar');
    });

    it('el tamaño pequeño no rompe el alto de fila del sistema', () => {
        expect(buttonClass({ size: 'md' })).toContain('h-(--row-h)');
        expect(buttonClass({ size: 'sm' })).toContain('h-8');
    });

    it('las clases de fuera se añaden, no sustituyen', () => {
        const clases = buttonClass({ variant: 'primary', className: 'w-full' });
        expect(clases).toContain('w-full');
        expect(clases).toContain('bg-accent-fill');
    });
});

describe('panelClass — el panel de e2 (7.5)', () => {
    it('trae siempre relleno, filete y radio del sistema', () => {
        const clases = panelClass();
        expect(clases).toContain('bg-surface-2');
        expect(clases).toContain('border-stroke-edge');
        expect(clases).toContain('rounded-md');
    });

    it('los tres rellenos son distintos y «none» no pone ninguno', () => {
        expect(panelClass({ padding: 'none' })).not.toMatch(/\bp-\d/);
        expect(panelClass({ padding: 'compact' })).toContain('p-5');
        expect(panelClass({ padding: 'comfortable' })).toContain('p-6');
    });

    it('el panel pulsable cambia el filete y NUNCA se mueve', () => {
        const clases = panelClass({ interactive: true });
        expect(clases).toContain('hover:border-brass-600');
        // §7.5 prohíbe por su nombre el desplazamiento y la escala en hover.
        expect(clases).not.toMatch(/hover:-?translate|hover:scale/);
    });

    it('sin `interactive` no hay hover: un panel que no se pulsa no responde', () => {
        expect(panelClass()).not.toContain('hover:');
    });
});

describe('Esqueleto — la espera con forma', () => {
    it('el formulario se anuncia y pinta tantas filas como se le pidan', () => {
        const { container } = render(
            <EsqueletoDeFormulario etiqueta="Cargando la ficha" filas={4} />,
        );
        expect(screen.getByRole('status', { name: 'Cargando la ficha' })).toBeTruthy();
        expect(container.querySelectorAll('.skeleton').length).toBeGreaterThanOrEqual(4);
    });

    it('las tarjetas y las filas también se anuncian', () => {
        const { unmount } = render(<EsqueletoDeTarjetas etiqueta="Cargando agentes" tarjetas={3} />);
        expect(screen.getByRole('status', { name: 'Cargando agentes' })).toBeTruthy();
        unmount();

        render(<EsqueletoDeFilas etiqueta="Cargando usuarios" filas={3} />);
        expect(screen.getByRole('status', { name: 'Cargando usuarios' })).toBeTruthy();
    });
});
