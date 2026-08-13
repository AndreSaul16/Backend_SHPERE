import { http, HttpResponse } from 'msw';

export const handlers = [
    // Mock para obtener agentes personalizados (Esquema Evolucionado)
    http.get('http://localhost:8000/api/v1/agents/', () => {
        return HttpResponse.json([
            {
                agent_id: 'custom-1',
                identity: {
                    name: 'Analista de Datos',
                    role: 'specialist',
                    color: '#3b82f6',
                    avatar_style: 'bar-chart'
                },
                brain_config: {
                    model: 'gpt-4o',
                    temperature: 0.7,
                    system_prompt: 'Eres un analista experto.'
                },
                owner_user_id: 'default_user',
                is_public: false
            }
        ]);
    }),

    // Mock para historial de sesión
    http.get('http://localhost:8000/api/v1/sessions/:id/history', () => {
        return HttpResponse.json({
            messages: [
                { type: 'human', content: 'Hola', additional_kwargs: {} },
                {
                    type: 'ai',
                    content: 'Aquí tienes el código: <sphere_artifact title="Sort" type="code" language="python">def sort(): pass</sphere_artifact>',
                    additional_kwargs: { agent_id: 'cto-1' }
                }
            ]
        });
    }),

    // Mock para plantillas de agentes (lo consume AgentCreationWizard al abrirse)
    http.get('http://localhost:8000/api/v1/agents/templates', () => {
        return HttpResponse.json([]);
    }),

    // Mock del stream SSE de chat: un token y cierre. Lo consumen los tests de
    // billing — el decremento optimista ocurre tras response.ok del stream.
    http.post('http://localhost:8000/api/v1/stream/', () => {
        const body = 'data: {"type": "token", "content": "Hola"}\n\ndata: [DONE]\n\n';
        return new HttpResponse(body, {
            headers: { 'Content-Type': 'text/event-stream' },
        });
    }),

    // Default: usuario NO admin (F4). Los tests que necesiten admin sobreescriben con server.use.
    http.get('http://localhost:8000/api/v1/admin/users', () => {
        return HttpResponse.json({ detail: 'Sin acceso' }, { status: 403 });
    }),

    // Default: sin juntas programadas (F3). Los tests las sobreescriben con server.use.
    http.get('http://localhost:8000/api/v1/me/scheduled-boards', () => {
        return HttpResponse.json([]);
    }),

    // Mock para crear sesión (Esquema Evolucionado)
    http.post('http://localhost:8000/api/v1/sessions/', () => {
        return HttpResponse.json({
            session_id: 'test-session-123',
            title: 'Sesión de Prueba',
            user_id: 'default_user',
            base_agent_id: 'CEO',
            visual_config: {
                name: 'Estrategia Master',
                color: '#8b5cf6'
            },
            context_files: [],
            enabled_tools: [],
            created_at: new Date().toISOString()
        });
    }),
];
