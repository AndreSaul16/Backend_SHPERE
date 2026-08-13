/**
 * El catálogo de plantillas (D41).
 *
 * Es estado del SERVIDOR, no del formulario, y por eso vive fuera del reducer:
 * no lo borra el cierre del asistente —se vuelve a pedir en cada apertura— y no
 * hay ninguna acción del usuario que lo escriba. Mezclarlo con el formulario
 * obligaría a exceptuar tres campos del borrado.
 */
import { useEffect, useState } from 'react';
import { API_URL } from './constants';
import { errorMessage } from './errorMessage';
import type { AgentTemplate } from './types';

export interface TemplateCatalog {
    templates: AgentTemplate[];
    loading: boolean;
    error: string | null;
}

export function useAgentTemplates(isOpen: boolean): TemplateCatalog {
    const [templates, setTemplates] = useState<AgentTemplate[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;

        const fetchTemplates = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`${API_URL}/agents/templates`);
                if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
                const data = await res.json();
                if (!cancelled) setTemplates(Array.isArray(data) ? data : []);
            } catch (err) {
                if (!cancelled) setError(errorMessage(err, 'Error al cargar plantillas'));
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchTemplates();
        return () => { cancelled = true; };
    }, [isOpen]);

    return { templates, loading, error };
}
