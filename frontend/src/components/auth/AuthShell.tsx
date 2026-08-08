/**
 * Andamio de las tres pantallas de entrada (`/login`, `/register`,
 * `/verify-email`) — DESIGN §0, §9.1, §9.2, §9.3, §4.3.
 *
 * Por qué existe: las tres páginas eran el mismo marcado triplicado y las tres
 * eran el diseño viejo entero: fondo en degradado gris→violeta, wordmark
 * rosa→morado sobre `bg-clip-text`, botón primario morado→magenta y tarjeta
 * de glassmorphism. Son el primer pixel de toda carga en frío, así que la
 * dirección no se puede decidir tres veces: se decide aquí.
 *
 * Decisiones que no son obvias:
 *
 * - **Sin fondo propio.** El paño (`--surface-0`), su grano y la lámpara ya
 *   viven en `body` (§8.5). Cualquier relleno a pantalla completa declarado
 *   aquí taparía el efecto más distintivo del sistema: el contenedor es
 *   transparente y deja ver el paño.
 * - **`min-h-dvh`, no `min-h-screen`** (§4.3): `min-h-screen` deja el hueco
 *   clásico de Safari móvil bajo la barra de direcciones.
 * - **`justify-center` + `py-10`**: centrado vertical mientras el contenido
 *   quepa, y aire garantizado arriba y abajo cuando no (el registro a 390px
 *   medía 855px de alto contra 844 de viewport y el h1 quedaba pegado al
 *   canto).
 * - **El wordmark no es macizo.** §9.1: el primario «es el único elemento
 *   macizo de la pantalla». Una placa de latón grande compitiendo con el botón
 *   rompe esa regla, así que el wordmark es tinta grabada con un filete de
 *   latón debajo.
 *
 * **6.1 · La expansión a escritorio (§4.3: 390px es el caso base).** Hasta la
 * fase 6 las tres pantallas eran literalmente el mismo píxel a 390 y a 1280: una
 * tarjeta de 448px flotando en un campo de paño vacío. La expansión no es
 * «hacer la tarjeta más grande» —un formulario de dos campos con 900px de ancho
 * es peor— sino repartir: a partir de `lg` el wordmark y la frase se van a una
 * columna propia a la izquierda y la tarjeta se queda a su tamaño a la derecha,
 * que es lo que el ancho sobrante pedía. Por debajo de `lg` la cabecera sigue
 * encima y centrada, exactamente como estaba.
 */
import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export interface AuthShellProps {
    /** Frase bajo el wordmark. Opcional: `/verify-email` no la necesita. */
    tagline?: ReactNode;
    /** Título de la tarjeta. Es el `<h2>` y da nombre a la región. */
    title: ReactNode;
    children: ReactNode;
    /** Pie de la tarjeta: el enlace a la otra pantalla. */
    footer?: ReactNode;
    /** Centra el contenido de la tarjeta (`/verify-email`). */
    centered?: boolean;
}

export function AuthShell({ tagline, title, children, footer, centered }: AuthShellProps) {
    return (
        <div className="flex min-h-dvh flex-col justify-center px-4 py-10 sm:px-6 sm:py-14 lg:px-10">
            <div className="mx-auto flex w-full max-w-md flex-col gap-0 lg:max-w-4xl lg:flex-row lg:items-center lg:gap-16">
                <header className="mb-8 flex flex-col items-center text-center sm:mb-10 lg:mb-0 lg:flex-1 lg:items-start lg:text-left">
                    <h1 className="text-3xl font-semibold uppercase tracking-[0.2em] text-content-strong sm:text-4xl lg:text-5xl">
                        Sphere
                    </h1>
                    {/* El filete de latón: el único metal, y aquí es canto, no campo. */}
                    <span aria-hidden="true" className="mt-3 block h-px w-10 bg-accent sm:mt-4 sm:w-14 lg:w-20" />
                    {tagline && (
                        <p className="mt-4 text-sm text-content-muted sm:text-base lg:mt-6 lg:max-w-xs lg:text-lg">
                            {tagline}
                        </p>
                    )}
                </header>

                <section
                    aria-labelledby="auth-title"
                    className="rounded-md border border-stroke-edge bg-surface-2 p-5 shadow-e2 sm:p-6 md:p-8 lg:w-full lg:max-w-md lg:shrink-0"
                >
                    <h2
                        id="auth-title"
                        className={`mb-5 text-xl font-semibold text-content-strong sm:mb-6 sm:text-2xl ${centered ? 'text-center' : ''}`}
                    >
                        {title}
                    </h2>
                    {children}
                    {footer && <div className="mt-6 text-center text-sm text-content-muted">{footer}</div>}
                </section>
            </div>
        </div>
    );
}

/**
 * Aviso de error a nivel de formulario. No es un estado de `<Field>` (§9.2 sólo
 * cubre el error DEL CAMPO) ni un toast (§9.5 es para lo que pasa fuera de la
 * vista): es el motivo por el que el envío no salió, en su sitio.
 *
 * `--danger` y no `oxblood-400`, por el mismo motivo que §9.1/§9.2: sobre e2 y
 * e3 el segundo no llega a AA.
 */
export function AuthAlert({ children }: { children: ReactNode }) {
    return (
        <p
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-sm border border-oxblood-500 bg-oxblood-500/12 px-3 py-2 text-xs text-danger"
        >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{children}</span>
        </p>
    );
}

/** Aviso de confirmación (verde). Mismo sitio y misma forma que `AuthAlert`. */
export function AuthNotice({ children }: { children: ReactNode }) {
    return (
        <p
            role="status"
            className="mb-4 rounded-sm border border-success/40 bg-success/12 px-3 py-2 text-xs text-success"
        >
            {children}
        </p>
    );
}

export type SocialProvider = 'google' | 'github' | 'microsoft';

const SOCIAL_LABELS: Record<SocialProvider, string> = {
    google: 'Google',
    github: 'GitHub',
    microsoft: 'Microsoft',
};

const PROVIDERS: SocialProvider[] = ['google', 'github', 'microsoft'];

/**
 * Los tres proveedores, como `<Button variant="secondary">` (§9.1). El botón
 * canónico ya trae alto, radio, anillo de foco, deshabilitado por token y el
 * hundido de pulsación al 0.985 de §7.5.
 */
export function SocialButtons({
    disabled,
    onSelect,
    separatorLabel,
}: {
    disabled?: boolean;
    onSelect: (provider: SocialProvider) => void;
    separatorLabel: string;
}) {
    return (
        <>
            <div className="my-6 flex items-center gap-3 sm:my-7" aria-hidden="true">
                <span className="h-px flex-1 bg-stroke-hairline" />
                <span className="text-micro uppercase text-content-muted">{separatorLabel}</span>
                <span className="h-px flex-1 bg-stroke-hairline" />
            </div>

            {/* A 390px los tres van apilados y a ancho completo: el pulgar no
                acierta tres dianas en una fila de 358px. A partir de `sm` caben
                en una sola fila y ahorran 96px de alto de tarjeta. */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-2">
                {PROVIDERS.map((provider) => (
                    <Button
                        key={provider}
                        variant="secondary"
                        className="w-full min-w-0 sm:px-2"
                        disabled={disabled}
                        onClick={() => onSelect(provider)}
                    >
                        <SocialIcon provider={provider} />
                        <span className="truncate">{SOCIAL_LABELS[provider]}</span>
                    </Button>
                ))}
            </div>
        </>
    );
}

/**
 * Marcas de terceros. Los hex de Google y Microsoft se quedan **a propósito**:
 * son logotipos ajenos, no paleta de SPHERE, y repintarlos con los tokens de la
 * sala capitular sería falsificarlos. GitHub va en `currentColor` porque su
 * marca es monocroma.
 */
function SocialIcon({ provider }: { provider: SocialProvider }) {
    switch (provider) {
        case 'google':
            return (
                <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
            );
        case 'github':
            return (
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                </svg>
            );
        case 'microsoft':
            return (
                <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#F25022" d="M11.5 11.5H1V1h10.5v10.5z" />
                    <path fill="#7FBA00" d="M23 11.5H12.5V1H23v10.5z" />
                    <path fill="#00A4EF" d="M11.5 23H1V12.5h10.5V23z" />
                    <path fill="#FFB900" d="M23 23H12.5V12.5H23V23z" />
                </svg>
            );
    }
}
