/**
 * Tests de comportamiento de accesibilidad de <Field> — DESIGN §9.2.
 *
 * No se prueba el render: se prueba el CONTRATO. La app venía de 41 `<label>`
 * con 0 `htmlFor`, así que lo que hay que blindar es exactamente que la
 * etiqueta apunta al control, que el error se anuncia y que la contraseña se
 * puede revelar con el teclado.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
    Field,
    PasswordField,
    SelectField,
    TextAreaField,
    TextField,
} from '../../../src/components/ui/Field';

describe('Field (DESIGN §9.2)', () => {
    it('ata la etiqueta al control con htmlFor/id (el contrato de §9.2)', () => {
        render(<TextField label="Nombre de la junta" />);
        const input = screen.getByLabelText('Nombre de la junta');
        expect(input.tagName).toBe('INPUT');
        expect(input.id).toBeTruthy();
        const label = document.querySelector('label');
        expect(label?.getAttribute('for')).toBe(input.id);
    });

    it('genera ids distintos para dos campos con la misma etiqueta', () => {
        render(
            <>
                <TextField label="Valor" />
                <TextField label="Valor" />
            </>,
        );
        const [a, b] = screen.getAllByLabelText('Valor');
        expect(a.id).not.toBe(b.id);
    });

    it('respeta un id explícito', () => {
        render(<TextField label="Correo" id="email" />);
        expect(screen.getByLabelText('Correo').id).toBe('email');
    });

    it('liga el texto de ayuda con aria-describedby', () => {
        render(<TextField label="Clave" hint="La guardamos cifrada" />);
        const input = screen.getByLabelText('Clave');
        const described = input.getAttribute('aria-describedby');
        expect(described).toBeTruthy();
        expect(document.getElementById(described!)?.textContent).toBe('La guardamos cifrada');
    });

    it('en error pone aria-invalid y liga el mensaje antes que la ayuda', () => {
        render(<TextField label="Clave" hint="Ayuda" error="No puede estar vacía" />);
        const input = screen.getByLabelText('Clave');
        expect(input).toHaveAttribute('aria-invalid', 'true');
        const ids = input.getAttribute('aria-describedby')!.split(' ');
        // El error va primero: es lo que el lector debe decir antes.
        expect(document.getElementById(ids[0])?.textContent).toContain('No puede estar vacía');
        expect(ids).toHaveLength(2);
    });

    it('sin ayuda ni error no inventa un aria-describedby colgando', () => {
        render(<TextField label="Sola" />);
        expect(screen.getByLabelText('Sola')).not.toHaveAttribute('aria-describedby');
    });

    it('readonly no deshabilita: el campo sigue enfocable y anuncia el candado', async () => {
        render(<TextField label="Id de sesión" readOnly value="abc" />);
        const input = screen.getByLabelText('Id de sesión');
        expect(input).toHaveAttribute('aria-readonly', 'true');
        expect(input).not.toBeDisabled();
        expect(screen.getByRole('img', { name: 'Sólo lectura' })).toBeInTheDocument();
        input.focus();
        expect(input).toHaveFocus();
    });

    it('disabled marca aria-disabled además del atributo nativo', () => {
        render(<TextField label="Bloqueado" disabled />);
        const input = screen.getByLabelText('Bloqueado');
        expect(input).toBeDisabled();
        expect(input).toHaveAttribute('aria-disabled', 'true');
    });

    it('loading marca aria-busy', () => {
        render(<TextField label="Buscando" loading />);
        expect(screen.getByLabelText('Buscando')).toHaveAttribute('aria-busy', 'true');
    });

    it('hideLabel deja la etiqueta para el lector pero fuera de la vista', () => {
        render(<TextField label="Buscar sesiones" hideLabel />);
        expect(screen.getByLabelText('Buscar sesiones')).toBeInTheDocument();
        expect(document.querySelector('label')).toHaveClass('sr-only');
    });

    it('PasswordField conmuta la visibilidad con teclado y refleja aria-pressed', async () => {
        const user = userEvent.setup();
        render(<PasswordField label="Contraseña" />);
        const input = screen.getByLabelText('Contraseña');
        expect(input).toHaveAttribute('type', 'password');

        const toggle = screen.getByRole('button', { name: 'Mostrar contraseña' });
        expect(toggle).toHaveAttribute('aria-pressed', 'false');
        expect(toggle).toHaveAttribute('aria-controls', input.id);

        toggle.focus();
        await user.keyboard('{Enter}');
        expect(screen.getByLabelText('Contraseña')).toHaveAttribute('type', 'text');
        expect(screen.getByRole('button', { name: 'Ocultar contraseña' })).toHaveAttribute(
            'aria-pressed',
            'true',
        );
    });

    it('TextAreaField y SelectField también quedan etiquetados', async () => {
        const onChange = vi.fn();
        render(
            <>
                <TextAreaField label="Instrucciones" />
                <SelectField label="Cadencia" defaultValue="daily" onChange={onChange}>
                    <option value="daily">Diaria</option>
                    <option value="weekly">Semanal</option>
                </SelectField>
            </>,
        );
        expect(screen.getByLabelText('Instrucciones').tagName).toBe('TEXTAREA');
        const select = screen.getByLabelText('Cadencia');
        expect(select.tagName).toBe('SELECT');
        await userEvent.selectOptions(select, 'weekly');
        expect(onChange).toHaveBeenCalled();
    });

    it('Field crudo entrega id y aria al control que le pasen', () => {
        render(
            <Field label="Personalizado" error="Mal">
                {(control) => <input {...control} />}
            </Field>,
        );
        const input = screen.getByLabelText('Personalizado');
        expect(input).toHaveAttribute('aria-invalid', 'true');
        expect(input).toHaveAttribute('aria-describedby');
    });
});
