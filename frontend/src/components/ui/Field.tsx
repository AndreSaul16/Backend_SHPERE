/**
 * <Field> y sus controles — DESIGN §9.2 «Input / Textarea».
 *
 * Contrato de §9.2, literal: «cero controles de formulario sin `id`/`htmlFor`».
 * El punto de partida del repo eran 41 `<label>` y 69 controles con **0**
 * `htmlFor`: ni un solo campo de la app estaba etiquetado programáticamente.
 * Este fichero es el único sitio donde se decide cómo se ata una etiqueta a su
 * control, así que la regresión ya no puede volver campo a campo.
 *
 * Los estados son los ocho de la tabla de §9.2 y no hay más: default, hover,
 * focus-visible, filled, disabled, readonly, error, loading. §9 prohíbe
 * inventar estados en el sitio de uso, así que quien necesite uno nuevo lo
 * añade AQUÍ, con su fila en la tabla.
 *
 * Notas de implementación que no son obvias:
 *
 * - El anillo de foco NO se declara aquí. Lo pone la regla global de
 *   `:focus-visible` de `index.css` (`@layer base`, con `:where()` y por tanto
 *   especificidad 0). §9.2 pide «filete Y anillo, los dos», así que aquí sólo
 *   se añade el filete de latón y el `outline-offset: 1px` que §9.2 especifica
 *   para los campos (el global es 2px, pensado para botones).
 * - `readonly` no lleva `disabled`: un campo de sólo lectura tiene que poder
 *   recibir foco y ser copiado con el teclado.
 * - El glifo de error va DENTRO del campo (§9.2: «glifo de alerta al final») y
 *   además `aria-invalid` + `aria-describedby`: el color nunca es la única
 *   señal (§P5).
 */
import {
    useId,
    useState,
    type InputHTMLAttributes,
    type ReactNode,
    type SelectHTMLAttributes,
    type TextareaHTMLAttributes,
} from 'react';
import { AlertCircle, ChevronDown, Eye, EyeOff, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FIELD_LABEL_CLASS, fieldControlClass } from './fieldStyles';

/** Lo que `<Field>` entrega al control: todo lo que lo ata a su etiqueta. */
export interface FieldControlProps {
    id: string;
    'aria-describedby': string | undefined;
    'aria-invalid': true | undefined;
}

export interface FieldProps {
    /** Etiqueta visible. Obligatoria: un control sin etiqueta no pasa §9.2. */
    label: ReactNode;
    /** Texto de ayuda, ligado con `aria-describedby`. */
    hint?: ReactNode;
    /** Mensaje de error. Su presencia activa el estado `error`. */
    error?: ReactNode;
    /** Marca visual y `required` en el control. */
    required?: boolean;
    /**
     * Oculta la etiqueta a la vista pero la deja para el lector de pantalla.
     * Sólo cuando el contexto visual ya la da (una fila de tabla, un buscador
     * con su glifo). El `<label htmlFor>` sigue existiendo.
     */
    hideLabel?: boolean;
    className?: string;
    /** Id explícito. Si no se pasa, `useId()`. */
    id?: string;
    children: (control: FieldControlProps) => ReactNode;
}

/**
 * El andamio: etiqueta + control + ayuda/error, con los ids ya atados.
 * Se usa directamente cuando el control no es un `input`/`textarea`/`select`
 * corriente; para esos hay los envoltorios de abajo.
 */
export function Field({
    label,
    hint,
    error,
    required,
    hideLabel,
    className,
    id: idProp,
    children,
}: FieldProps) {
    const autoId = useId();
    const id = idProp ?? `field-${autoId}`;
    const hintId = `${id}-hint`;
    const errorId = `${id}-error`;

    // Sólo se referencian los que existen: un `aria-describedby` que apunta a
    // un id inexistente es peor que no ponerlo (el lector no dice nada y la
    // auditoría automática lo da por bueno).
    const describedBy =
        [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;

    return (
        <div className={cn('space-y-1.5', className)}>
            <label htmlFor={id} className={cn(FIELD_LABEL_CLASS, hideLabel && 'sr-only')}>
                {label}
                {required && (
                    <span className="text-dissent" aria-hidden="true">
                        {' *'}
                    </span>
                )}
            </label>

            {children({
                id,
                'aria-describedby': describedBy,
                'aria-invalid': error ? true : undefined,
            })}

            {hint && (
                <p id={hintId} className="text-xs text-content-muted">
                    {hint}
                </p>
            )}
            {error && (
                <p id={errorId} className="flex items-start gap-1.5 text-xs text-danger">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{error}</span>
                </p>
            )}
        </div>
    );
}

/** Barra indeterminada del estado `loading` (§9.2). */
function LoadingBar() {
    return (
        <span
            className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden rounded-b-sm"
            aria-hidden="true"
        >
            <span className="block h-full w-full bg-accent animate-indeterminate" />
        </span>
    );
}

/** Glifo de alerta al final del campo (§9.2, estado `error`). */
function ErrorGlyph() {
    return (
        <AlertCircle
            className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-danger"
            aria-hidden="true"
        />
    );
}

/** Candado del estado `readonly` (§9.2), con `aria-label` propio. */
function ReadOnlyGlyph() {
    return (
        <Lock
            className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-quiet"
            role="img"
            aria-label="Sólo lectura"
        />
    );
}

type NativeInputProps = Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'id' | 'aria-invalid' | 'className'
>;

export interface TextFieldProps extends NativeInputProps, Omit<FieldProps, 'children'> {
    /** Estado `loading` de §9.2: filete a hairline + barra indeterminada. */
    loading?: boolean;
    /**
     * Clases del CONTROL. `className` es del envoltorio, porque el envoltorio
     * es lo que el sitio de uso coloca en su rejilla. Ojo: aquí no se pueden
     * meter estados nuevos, sólo layout (§9).
     */
    controlClassName?: string;
}

/** `<input>` etiquetado. El 80% de los ~69 controles de la app son este. */
export function TextField({
    label,
    hint,
    error,
    required,
    hideLabel,
    className,
    controlClassName,
    id,
    loading,
    ...input
}: TextFieldProps) {
    return (
        <Field
            label={label}
            hint={hint}
            error={error}
            required={required}
            hideLabel={hideLabel}
            className={className}
            id={id}
        >
            {(control) => (
                <div className="relative">
                    <input
                        {...input}
                        {...control}
                        required={required}
                        aria-disabled={input.disabled || undefined}
                        aria-readonly={input.readOnly || undefined}
                        aria-busy={loading || undefined}
                        className={fieldControlClass({
                            error: Boolean(error),
                            readOnly: input.readOnly,
                            disabled: input.disabled,
                            loading,
                            className: cn(
                                (error || input.readOnly) && 'pe-10',
                                controlClassName,
                            ),
                        })}
                    />
                    {error ? <ErrorGlyph /> : input.readOnly ? <ReadOnlyGlyph /> : null}
                    {loading && <LoadingBar />}
                </div>
            )}
        </Field>
    );
}

export interface PasswordFieldProps extends Omit<TextFieldProps, 'type'> {
    /** Etiquetas del conmutador. Se exponen por si el copy cambia. */
    showLabel?: string;
    hideLabelText?: string;
}

/**
 * §9.2: «Contraseña: siempre con conmutador de visibilidad (`aria-pressed`,
 * `aria-label` "Mostrar contraseña"). Hoy no existe en ningún campo, ni en
 * login ni en las claves de API.»
 */
export function PasswordField({
    label,
    hint,
    error,
    required,
    hideLabel,
    className,
    controlClassName,
    id,
    loading,
    showLabel = 'Mostrar contraseña',
    hideLabelText = 'Ocultar contraseña',
    ...input
}: PasswordFieldProps) {
    const [visible, setVisible] = useState(false);
    return (
        <Field
            label={label}
            hint={hint}
            error={error}
            required={required}
            hideLabel={hideLabel}
            className={className}
            id={id}
        >
            {(control) => (
                <div className="relative">
                    <input
                        {...input}
                        {...control}
                        type={visible ? 'text' : 'password'}
                        required={required}
                        aria-disabled={input.disabled || undefined}
                        aria-busy={loading || undefined}
                        className={fieldControlClass({
                            error: Boolean(error),
                            disabled: input.disabled,
                            loading,
                            className: cn('pe-11', controlClassName),
                        })}
                    />
                    <button
                        type="button"
                        onClick={() => setVisible((v) => !v)}
                        aria-pressed={visible}
                        aria-label={visible ? hideLabelText : showLabel}
                        aria-controls={control.id}
                        className="absolute end-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-sm text-content-muted transition-colors hover:text-content-strong"
                    >
                        {visible ? (
                            <EyeOff className="h-4 w-4" aria-hidden="true" />
                        ) : (
                            <Eye className="h-4 w-4" aria-hidden="true" />
                        )}
                    </button>
                    {error && <p className="sr-only">{error}</p>}
                    {loading && <LoadingBar />}
                </div>
            )}
        </Field>
    );
}

type NativeTextareaProps = Omit<
    TextareaHTMLAttributes<HTMLTextAreaElement>,
    'id' | 'aria-invalid' | 'className'
>;

export interface TextAreaFieldProps
    extends NativeTextareaProps,
        Omit<FieldProps, 'children'> {
    loading?: boolean;
    /** Clases del control; ver `TextFieldProps.controlClassName`. */
    controlClassName?: string;
}

/** `<textarea>` etiquetado. */
export function TextAreaField({
    label,
    hint,
    error,
    required,
    hideLabel,
    className,
    controlClassName,
    id,
    loading,
    ...textarea
}: TextAreaFieldProps) {
    return (
        <Field
            label={label}
            hint={hint}
            error={error}
            required={required}
            hideLabel={hideLabel}
            className={className}
            id={id}
        >
            {(control) => (
                <div className="relative">
                    <textarea
                        {...textarea}
                        {...control}
                        required={required}
                        aria-disabled={textarea.disabled || undefined}
                        aria-readonly={textarea.readOnly || undefined}
                        aria-busy={loading || undefined}
                        className={fieldControlClass({
                            error: Boolean(error),
                            readOnly: textarea.readOnly,
                            disabled: textarea.disabled,
                            loading,
                            className: controlClassName,
                        })}
                    />
                    {loading && <LoadingBar />}
                </div>
            )}
        </Field>
    );
}

type NativeSelectProps = Omit<
    SelectHTMLAttributes<HTMLSelectElement>,
    'id' | 'aria-invalid' | 'className'
>;

export interface SelectFieldProps extends NativeSelectProps, Omit<FieldProps, 'children'> {
    /** Clases del control; ver `TextFieldProps.controlClassName`. */
    controlClassName?: string;
}

/**
 * `<select>` etiquetado. §9.2: «`appearance: none` + galón propio de lucide, y
 * `<option>` con `background-color` explícito — hoy los 9 `<select>` de
 * `ProfileSettings.tsx` heredan el desplegable del sistema operativo (a menudo
 * blanco sobre blanco)».
 */
export function SelectField({
    label,
    hint,
    error,
    required,
    hideLabel,
    className,
    controlClassName,
    id,
    children,
    ...select
}: SelectFieldProps) {
    return (
        <Field
            label={label}
            hint={hint}
            error={error}
            required={required}
            hideLabel={hideLabel}
            className={className}
            id={id}
        >
            {(control) => (
                <div className="relative">
                    <select
                        {...select}
                        {...control}
                        required={required}
                        aria-disabled={select.disabled || undefined}
                        className={fieldControlClass({
                            error: Boolean(error),
                            disabled: select.disabled,
                            className: cn(
                                'appearance-none pe-10',
                                // El desplegable nativo no hereda el tema: sin
                                // esto, en Windows sale blanco sobre blanco.
                                '[&>option]:bg-surface-1 [&>option]:text-content',
                                controlClassName,
                            ),
                        })}
                    >
                        {children}
                    </select>
                    <ChevronDown
                        className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted"
                        aria-hidden="true"
                    />
                </div>
            )}
        </Field>
    );
}
