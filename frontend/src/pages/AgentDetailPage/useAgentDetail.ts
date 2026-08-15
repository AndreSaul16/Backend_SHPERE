/**
 * Todo lo que la ficha de un director hace y no se ve: traer, guardar,
 * eliminar y saber cuánto has cambiado.
 *
 * Sale de las 710 líneas de `AgentDetailPage.tsx` (7.3). El componente que
 * queda sólo coloca; nada de lo de aquí decide nada de pintura.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AGENT_HEX } from '@/store/useChatStore';
import { contarCambios } from '@/lib/cambiosSinGuardar';
import { reasonOf, toast } from '@/lib/toastBus';
import { normalizarModelo } from '@/lib/modelos';
import { RUTA_DE_INICIO } from '@/lib/rutas';
import type { AgentDetailAPI, BorradorDeAgente } from './tipos';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export async function cabecerasDeAutenticacion(): Promise<Record<string, string>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    try {
        const { getAuth } = await import('firebase/auth');
        const user = getAuth().currentUser;
        if (user) {
            headers['Authorization'] = `Bearer ${await user.getIdToken()}`;
        }
    } catch {
        // sin auth — el backend rechazará con 401
    }
    return headers;
}

const BORRADOR_VACIO: BorradorDeAgente = {
    name: '',
    description: '',
    color: AGENT_HEX.custom,
    systemPrompt: '',
    temperature: 0.7,
    model: normalizarModelo(undefined),
};

export interface FichaDeAgente {
    borrador: BorradorDeAgente;
    /** Cambia un campo del borrador. Tipado por clave: no hay `any` posible. */
    cambiar: <K extends keyof BorradorDeAgente>(campo: K, valor: BorradorDeAgente[K]) => void;
    /** El `role` viene del servidor y el formulario no lo edita: se reenvía. */
    role: string;
    cargando: boolean;
    errorDeCarga: string | null;
    guardando: boolean;
    eliminando: boolean;
    confirmandoBorrado: boolean;
    pedirBorrado: () => void;
    cancelarBorrado: () => void;
    sucio: boolean;
    cambiosPendientes: number;
    descartarCambios: () => void;
    guardar: () => Promise<void>;
    eliminar: () => Promise<void>;
    /** A dónde se sale de esta pantalla. `/chat` NO es una ruta (D62). */
    volver: () => void;
}

export function useAgentDetail(agentId: string | undefined): FichaDeAgente {
    const navigate = useNavigate();

    const [borrador, setBorrador] = useState<BorradorDeAgente>(BORRADOR_VACIO);
    const [role, setRole] = useState('specialist');

    const [cargando, setCargando] = useState(true);
    const [errorDeCarga, setErrorDeCarga] = useState<string | null>(null);
    const [guardando, setGuardando] = useState(false);
    const [eliminando, setEliminando] = useState(false);
    const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);

    /** Lo último que dijo el servidor, serializado. La referencia de «sucio». */
    const [huellaOriginal, setHuellaOriginal] = useState('');

    const huellaActual = useMemo(() => JSON.stringify(borrador), [borrador]);
    const sucio = huellaActual !== huellaOriginal;

    /* 6.5 — cuántos campos, no si los hay. `huellaOriginal` ya era la
       referencia; contar contra ella no añade estado nuevo. */
    const cambiosPendientes = huellaOriginal
        ? contarCambios(
            JSON.parse(huellaOriginal) as Record<string, unknown>,
            JSON.parse(huellaActual) as Record<string, unknown>,
        )
        : 0;

    const cambiar = useCallback(
        <K extends keyof BorradorDeAgente>(campo: K, valor: BorradorDeAgente[K]) => {
            setBorrador((prev) => ({ ...prev, [campo]: valor }));
        },
        [],
    );

    /** Volver a lo guardado. Reversible: basta con volver a editar. */
    const descartarCambios = useCallback(() => {
        if (!huellaOriginal) return;
        setBorrador(JSON.parse(huellaOriginal) as BorradorDeAgente);
    }, [huellaOriginal]);

    const volver = useCallback(() => { navigate(RUTA_DE_INICIO); }, [navigate]);

    // ── Traer ────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!agentId) return;
        let cancelado = false;

        async function traer(id: string) {
            setCargando(true);
            setErrorDeCarga(null);
            try {
                const headers = await cabecerasDeAutenticacion();
                const res = await fetch(`${API_URL}/agents/${id}`, { headers });
                if (!res.ok) throw new Error(`Error ${res.status}: ${res.statusText}`);
                const data = (await res.json()) as AgentDetailAPI;
                if (cancelado) return;

                const recibido: BorradorDeAgente = {
                    name: data.identity?.name ?? '',
                    description: data.identity?.description ?? '',
                    color: data.identity?.color ?? AGENT_HEX.custom,
                    systemPrompt: data.brain_config?.system_prompt ?? '',
                    temperature: data.brain_config?.temperature ?? 0.7,
                    model: normalizarModelo(data.brain_config?.model),
                };
                setBorrador(recibido);
                setRole(data.identity?.role ?? 'specialist');
                setHuellaOriginal(JSON.stringify(recibido));
            } catch (err: unknown) {
                // El motivo va al detalle, nunca de titular (§11).
                if (!cancelado) setErrorDeCarga(reasonOf(err) ?? '');
            } finally {
                if (!cancelado) setCargando(false);
            }
        }

        void traer(agentId);
        return () => { cancelado = true; };
    }, [agentId]);

    // ── Guardar ──────────────────────────────────────────────────────────
    const guardar = useCallback(async () => {
        if (!agentId || guardando) return;
        setGuardando(true);
        try {
            const headers = await cabecerasDeAutenticacion();
            const res = await fetch(`${API_URL}/agents/${agentId}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    identity: {
                        name: borrador.name,
                        role,
                        color: borrador.color,
                        description: borrador.description,
                    },
                    brain_config: {
                        model: borrador.model,
                        temperature: borrador.temperature,
                        system_prompt: borrador.systemPrompt,
                    },
                }),
            });
            if (!res.ok) throw new Error(`Error ${res.status}: ${res.statusText}`);
            setHuellaOriginal(JSON.stringify(borrador));
            toast.success('Agente actualizado');
        } catch (err: unknown) {
            toast.error(
                'No se pudo guardar el agente',
                reasonOf(err) ?? 'Tus cambios siguen en el formulario.',
            );
        } finally {
            setGuardando(false);
        }
    }, [agentId, borrador, guardando, role]);

    // ── Eliminar ─────────────────────────────────────────────────────────
    const eliminar = useCallback(async () => {
        if (!agentId || eliminando) return;
        setEliminando(true);
        try {
            const headers = await cabecerasDeAutenticacion();
            const res = await fetch(`${API_URL}/agents/${agentId}`, { method: 'DELETE', headers });
            if (!res.ok) throw new Error(`Error ${res.status}`);
            toast.success('Agente eliminado');
            // Un respiro para que el aviso se lea antes de cambiar de pantalla.
            setTimeout(volver, 400);
        } catch (err: unknown) {
            toast.error(
                'No se pudo eliminar el agente',
                reasonOf(err) ?? 'El agente sigue en tu lista.',
            );
            setEliminando(false);
        }
    }, [agentId, eliminando, volver]);

    const pedirBorrado = useCallback(() => setConfirmandoBorrado(true), []);
    const cancelarBorrado = useCallback(() => setConfirmandoBorrado(false), []);

    return {
        borrador, cambiar, role,
        cargando, errorDeCarga, guardando, eliminando,
        confirmandoBorrado, pedirBorrado, cancelarBorrado,
        sucio, cambiosPendientes, descartarCambios,
        guardar, eliminar, volver,
    };
}
