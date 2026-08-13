/**
 * Paleta de comandos — PLAN §6 Q4 (tarea 5.2).
 *
 * Por qué existe: la aplicación tiene **trece rutas, cinco secciones de ajustes
 * y tres puntos de entrada de navegación distintos**, y para llegar a la mitad
 * de ellos hay que abrir el cajón, bajar y pinchar. Un producto que se usa
 * varias veces al día necesita una puerta única.
 *
 * Qué encuentra, y son los cinco tipos que pide el criterio: juntas del
 * historial, directores, secciones de ajustes, acciones y las seis plantillas
 * de debate.
 *
 * Decisiones que no son obvias:
 *
 * - **Se monta sobre `<Modal>`**, así que hereda gratis lo que hace falta para
 *   no romper la accesibilidad: `role="dialog"`, `aria-modal`, trampa de foco,
 *   `Escape`, foco restaurado al disparador y scroll de fondo bloqueado. Y en
 *   móvil `<Modal>` ya entra como hoja desde abajo con `max-h-[85dvh]`: una
 *   paleta que a 390px tapa la pantalla sin salida es un fallo, y aquí la
 *   salida son el velo, el botón de cierre y `Escape`.
 * - **El patrón es combobox + listbox**, no una lista de botones: el foco NO se
 *   mueve de la caja de texto, y quien navega con teclado sigue escribiendo
 *   mientras las flechas mueven el descendiente activo (`aria-activedescendant`).
 *   Si el foco saltara a cada opción, el lector de pantalla leería la opción y
 *   la caja alternativamente y no se podría seguir filtrando.
 * - **La primera opción está activa desde el principio.** Escribir dos letras y
 *   pulsar ⏎ tiene que llevar a algún sitio; una paleta donde hay que bajar
 *   siempre una vez es una paleta que no ahorra nada.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowRight,
    CreditCard,
    Keyboard,
    Landmark,
    MessageSquare,
    Settings,
    Sparkles,
    User,
} from 'lucide-react';
import { Modal } from './Modal';
import { cn } from '@/lib/utils';
import { useAgentes, useChatStore } from '@/store/useChatStore';
import { DEBATE_TEMPLATES } from '@/lib/debateTemplates';
import { filtrarDifuso } from '@/lib/busquedaDifusa';
import { comboDe, teclasDe, useAtajo } from '@/hooks/useShortcuts';
import { abrirHojaDeAtajos, alPedirLaPaleta } from '@/lib/atajosBus';

type Grupo = 'Acciones' | 'Juntas' | 'Directores' | 'Ajustes' | 'Plantillas';

interface Comando {
    id: string;
    grupo: Grupo;
    /** Lo que se ve y lo que se busca. */
    titulo: string;
    /** Línea de apoyo: para qué sirve, o de cuándo es. */
    detalle?: string;
    icono: React.ReactNode;
    ejecutar: () => void;
}

/** Las cinco secciones reales de `/settings`, con su ruta. */
const SECCIONES_DE_AJUSTES = [
    { id: 'profile', label: 'Perfil' },
    { id: 'integrations', label: 'Conexiones' },
    { id: 'board-meeting', label: 'Junta directiva' },
    { id: 'agent-overrides', label: 'Agentes' },
    { id: 'contacts', label: 'Contactos' },
] as const;

const ORDEN_DE_GRUPOS: Grupo[] = ['Acciones', 'Juntas', 'Directores', 'Ajustes', 'Plantillas'];

export function CommandPalette() {
    const [abierta, setAbierta] = useState(false);
    const [consulta, setConsulta] = useState('');
    const [activo, setActivo] = useState(0);
    const cajaRef = useRef<HTMLInputElement>(null);
    const navigate = useNavigate();

    /* Selectores atómicos (fase 4 · D20): la paleta vive montada en la raíz, y
       suscribirla al store entero repintaría la aplicación en cada token. */
    const sessions = useChatStore((s) => s.sessions);
    const toggleAgentModal = useChatStore((s) => s.toggleAgentModal);
    const toggleSidebar = useChatStore((s) => s.toggleSidebar);
    const createNewSession = useChatStore((s) => s.createNewSession);
    const agents = useAgentes();

    const cerrar = useCallback(() => setAbierta(false), []);

    /**
     * Abrir es siempre empezar de cero. Se hace AQUÍ y no en un efecto sobre
     * `abierta` por dos motivos: una paleta que recuerda la última consulta
     * obliga a borrar antes de escribir —justo el gesto que viene a ahorrar—, y
     * un `setState` síncrono dentro de un efecto es una cascada de renders que
     * el lint del proyecto marca con razón.
     */
    const abrir = useCallback(() => {
        setConsulta('');
        setActivo(0);
        setAbierta(true);
    }, []);

    // El conmutador es el único atajo que NO calla con un diálogo abierto: el
    // diálogo puede ser la propia paleta, y ⌘K tiene que poder cerrarla.
    useAtajo(
        comboDe('paleta'),
        useCallback((e: KeyboardEvent) => {
            e.preventDefault();
            setAbierta((v) => {
                if (v) return false;
                setConsulta('');
                setActivo(0);
                return true;
            });
        }, []),
        { permitirEnCampos: true, silenciarConDialogo: false },
    );

    // La puerta sin teclado: el botón del cajón (§4.3, móvil primero).
    useEffect(() => alPedirLaPaleta(abrir), [abrir]);

    const comandos = useMemo<Comando[]>(() => {
        const ir = (ruta: string) => () => {
            navigate(ruta);
            cerrar();
        };

        const acciones: Comando[] = [
            {
                id: 'accion:convocar',
                grupo: 'Acciones',
                titulo: 'Convocar junta',
                detalle: 'Elige los directores y abre una sesión nueva',
                icono: <Landmark className="h-4 w-4" aria-hidden="true" />,
                ejecutar: () => {
                    toggleAgentModal(true);
                    cerrar();
                },
            },
            {
                id: 'accion:facturacion',
                grupo: 'Acciones',
                titulo: 'Ir a facturación',
                detalle: 'Saldo de créditos y recargas',
                icono: <CreditCard className="h-4 w-4" aria-hidden="true" />,
                ejecutar: ir('/billing'),
            },
            {
                id: 'accion:historial',
                grupo: 'Acciones',
                titulo: 'Mostrar u ocultar el historial',
                icono: <MessageSquare className="h-4 w-4" aria-hidden="true" />,
                ejecutar: () => {
                    toggleSidebar();
                    cerrar();
                },
            },
            {
                id: 'accion:atajos',
                grupo: 'Acciones',
                titulo: 'Ver los atajos de teclado',
                detalle: 'La hoja con todo lo que se puede hacer sin ratón',
                icono: <Keyboard className="h-4 w-4" aria-hidden="true" />,
                ejecutar: () => {
                    cerrar();
                    abrirHojaDeAtajos();
                },
            },
        ];

        const juntas: Comando[] = sessions.slice(0, 40).map((s) => ({
            id: `junta:${s.session_id}`,
            grupo: 'Juntas',
            titulo: s.title || 'Junta sin título',
            icono: <MessageSquare className="h-4 w-4" aria-hidden="true" />,
            ejecutar: ir(`/chat/${s.session_id}`),
        }));

        const directores: Comando[] = agents.map((a) => ({
            id: `director:${a.id}`,
            grupo: 'Directores',
            titulo: a.name,
            detalle: a.description,
            icono: <User className="h-4 w-4" aria-hidden="true" />,
            ejecutar: ir(`/agents/${a.id}`),
        }));

        const ajustes: Comando[] = SECCIONES_DE_AJUSTES.map((s) => ({
            id: `ajustes:${s.id}`,
            grupo: 'Ajustes',
            titulo: `Ajustes · ${s.label}`,
            icono: <Settings className="h-4 w-4" aria-hidden="true" />,
            ejecutar: ir(`/settings/${s.id}`),
        }));

        const plantillas: Comando[] = DEBATE_TEMPLATES.map((t) => ({
            id: `plantilla:${t.id}`,
            grupo: 'Plantillas',
            titulo: t.title,
            detalle: 'Abre una junta con este guion',
            icono: <Sparkles className="h-4 w-4" aria-hidden="true" />,
            ejecutar: () => {
                cerrar();
                // La plantilla se lleva a una junta NUEVA: aplicarla sobre una
                // conversación en curso pisaría lo que el usuario ya escribió.
                void createNewSession('group-chat').then((sessionId) => {
                    navigate(`/chat/${sessionId}`, { state: { plantilla: t.prompt } });
                });
            },
        }));

        return [...acciones, ...juntas, ...directores, ...ajustes, ...plantillas];
    }, [sessions, agents, navigate, cerrar, toggleAgentModal, toggleSidebar, createNewSession]);

    /**
     * Los resultados EN EL ORDEN EN QUE SE VEN.
     *
     * El filtro difuso ordena por relevancia global, pero la lista se pinta por
     * grupos, así que el mejor resultado puede quedar el quinto en pantalla. Si
     * la navegación siguiera el orden de relevancia, el marcado como activo no
     * sería el primero que se ve y ⏎ abriría algo que el usuario no está
     * mirando. Se reagrupa aquí y la navegación sigue este orden; dentro de cada
     * grupo se conserva la relevancia.
     */
    const resultados = useMemo(() => {
        const casan = filtrarDifuso(
            comandos,
            consulta,
            (c) => `${c.titulo} ${c.grupo} ${c.detalle ?? ''}`,
        );
        return ORDEN_DE_GRUPOS.flatMap((g) => casan.filter((c) => c.grupo === g));
    }, [comandos, consulta]);

    /** Teclear devuelve el cursor arriba: si se quedara donde estaba, ⏎
     *  ejecutaría un resultado que ya no es el que se ve. */
    const alEscribir = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setConsulta(e.target.value);
        setActivo(0);
    }, []);

    const activoSeguro = resultados.length === 0 ? -1 : Math.min(activo, resultados.length - 1);
    const idActivo = activoSeguro >= 0 ? `cmd-${resultados[activoSeguro].id}` : undefined;

    // El descendiente activo tiene que verse: con cuarenta juntas, bajar a
    // ciegas es no poder bajar.
    useEffect(() => {
        if (!idActivo) return;
        // `getElementById` y no un selector: los identificadores llevan `:`
        // («junta:abc»), que en un selector CSS hay que escapar y en un id no.
        document.getElementById(idActivo)?.scrollIntoView({ block: 'nearest' });
    }, [idActivo]);

    const alTeclear = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (resultados.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActivo((i) => (i + 1) % resultados.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActivo((i) => (i - 1 + resultados.length) % resultados.length);
        } else if (e.key === 'Home') {
            e.preventDefault();
            setActivo(0);
        } else if (e.key === 'End') {
            e.preventDefault();
            setActivo(resultados.length - 1);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activoSeguro >= 0) resultados[activoSeguro].ejecutar();
        }
    };

    return (
        <Modal
            open={abierta}
            onClose={cerrar}
            title="Buscar y ejecutar"
            description="Juntas, directores, ajustes, acciones y plantillas de debate."
            size="md"
            initialFocusRef={cajaRef}
            bodyClassName="p-0"
        >
            <div className="border-b border-stroke-hairline px-4 py-3">
                <label htmlFor="paleta-consulta" className="sr-only">
                    Buscar juntas, directores, ajustes y acciones
                </label>
                <input
                    ref={cajaRef}
                    id="paleta-consulta"
                    type="text"
                    role="combobox"
                    aria-expanded="true"
                    aria-controls="paleta-resultados"
                    aria-activedescendant={idActivo}
                    aria-autocomplete="list"
                    autoComplete="off"
                    value={consulta}
                    onChange={alEscribir}
                    onKeyDown={alTeclear}
                    placeholder="Escribe para filtrar…"
                    className="w-full bg-transparent text-base text-content-strong placeholder:text-content-quiet"
                />
            </div>

            {/* Cada opción es un `<button>` de verdad con `role="option"` y
                `tabIndex={-1}`. Podría ser un `<li>`, pero entonces el clic
                viviría en un elemento sin operación de teclado propia; con un
                botón, la fila es accionable por sí misma y sigue fuera del
                recorrido de tabulación, que es lo que el patrón de combobox
                exige: el foco no se mueve de la caja. */}
            <div
                id="paleta-resultados"
                role="listbox"
                aria-label="Resultados"
                className="max-h-[min(60dvh,26rem)] overflow-y-auto p-2"
            >
                {resultados.length === 0 && (
                    <p className="px-3 py-6 text-center text-sm text-content-muted">
                        Nada coincide con «{consulta}». Prueba con otra palabra.
                    </p>
                )}
                {ORDEN_DE_GRUPOS.map((grupo) => {
                    const delGrupo = resultados.filter((c) => c.grupo === grupo);
                    if (delGrupo.length === 0) return null;
                    return (
                        <div key={grupo} role="group" aria-label={grupo}>
                            <p
                                aria-hidden="true"
                                className="px-3 pb-1 pt-3 text-micro uppercase tracking-wide text-content-quiet"
                            >
                                {grupo}
                            </p>
                            {delGrupo.map((c) => {
                                const indice = resultados.indexOf(c);
                                const esActivo = indice === activoSeguro;
                                return (
                                    <button
                                        key={c.id}
                                        type="button"
                                        id={`cmd-${c.id}`}
                                        role="option"
                                        tabIndex={-1}
                                        aria-selected={esActivo}
                                        onClick={c.ejecutar}
                                        onMouseEnter={() => setActivo(indice)}
                                        className={cn(
                                            'flex w-full items-center gap-3 rounded-sm px-3 py-2 text-start text-sm',
                                            esActivo
                                                ? 'bg-stroke-hairline text-content-strong'
                                                : 'text-content-muted',
                                        )}
                                    >
                                        <span className="shrink-0 text-accent">{c.icono}</span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate">{c.titulo}</span>
                                            {c.detalle && (
                                                <span className="block truncate text-xs text-content-quiet">
                                                    {c.detalle}
                                                </span>
                                            )}
                                        </span>
                                        {esActivo && (
                                            <ArrowRight
                                                className="h-3.5 w-3.5 shrink-0 text-accent"
                                                aria-hidden="true"
                                            />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    );
                })}
            </div>

            {/* La ayuda al pie es la que enseña que esto se maneja con teclado.
                Se esconde en móvil porque ahí no hay teclas que enseñar. */}
            <p className="hidden items-center gap-3 border-t border-stroke-hairline px-4 py-2 text-micro uppercase text-content-quiet sm:flex">
                <span>↑↓ moverse</span>
                <span>⏎ abrir</span>
                <span>Esc cerrar</span>
                <span className="ms-auto">{teclasDe(comboDe('paleta')).join(' ')}</span>
            </p>
        </Modal>
    );
}
