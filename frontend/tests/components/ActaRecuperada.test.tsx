import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { ReactElement } from 'react';
import { render as renderSinRouter, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../setup';
import { useChatStore } from '../../src/store/useChatStore';
import { ArtifactPanel } from '../../src/components/artifacts/ArtifactPanel';
import type { ChatSession } from '../../src/types';

/**
 * Router obligatorio: el panel monta `ActaActions`, y desde junta-honesta cada
 * próximo paso del acta abre el chat de su director con `useNavigate`. Sin un
 * `<Router>` alrededor, React Router lanza en el RENDER y estos tests caerían
 * por un motivo que no tiene nada que ver con lo que prueban.
 */
const render = (ui: ReactElement) => renderSinRouter(<MemoryRouter>{ui}</MemoryRouter>);


/**
 * lanzamiento-p0 · AD-001 — las acciones del acta siguen ahí tras la recarga.
 *
 * `ArtifactPanel` sólo monta `ActaActions` cuando `esActa(artefacto)`, y
 * `esActa` exige `type === 'markdown'` (`src/utils/acta.ts`). Con el lector del
 * historial buscando un atributo que el backend no escribe, el acta recuperada
 * caía a `'code'` y el panel la pintaba sin barra de acciones: el entregable
 * volvía de la recarga sin poder mandarse a Notion ni convertirse en issues.
 *
 * Este test no mira el tipo —eso lo hace `loadSessionJunta.test.ts`— sino la
 * consecuencia que se ve: los botones.
 */

const SESSION_ID = 'junta-q4-enterprise';

const junta: ChatSession = {
    session_id: SESSION_ID,
    user_id: 'u1',
    title: 'Lanzamiento de SPHERE Enterprise',
    base_agent_id: 'group-chat',
    agent_ref_type: 'core',
    type: 'group',
    visual_config: {},
    context_files: [],
    enabled_tools: [],
    members: [],
    created_at: new Date().toISOString(),
};

const ACTA_PERSISTIDA =
    'Queda el acta.\n\n<sphere_artifact type="markdown" title="Acta de la Junta">' +
    '# Acta de la Junta Directiva\n\n## Decisión\nAdelante con Enterprise.\n\n' +
    '## Próximos pasos\n\n- Cerrar la ronda antes de octubre\n</sphere_artifact>';

beforeEach(() => {
    useChatStore.getState().resetState();
    localStorage.clear();
});
afterEach(() => {
    cleanup();
    localStorage.clear();
});

describe('AD-001 — el acta recuperada conserva sus acciones', () => {
    it('tras recargar la sesión, el acta ofrece Notion y GitHub', async () => {
        useChatStore.setState({ sessions: [junta] });
        server.use(
            http.get('http://localhost:8000/api/v1/sessions/:id/history', () =>
                HttpResponse.json({
                    messages: [
                        {
                            type: 'ai',
                            content: ACTA_PERSISTIDA,
                            additional_kwargs: {
                                agent_role: 'CEO', agent_id: 'ceo-1',
                                board_phase: 'synthesis', is_conclusion: true,
                            },
                        },
                    ],
                })
            )
        );

        await useChatStore.getState().loadSession(SESSION_ID);

        // El usuario abre el artefacto que acaba de recuperarse.
        const recuperado = useChatStore.getState().artifacts[0];
        expect(recuperado.title).toBe('Acta de la Junta');
        useChatStore.getState().setActiveArtifact(recuperado.id);

        render(<ArtifactPanel />);

        expect(screen.getByText('Crear issues en GitHub')).toBeTruthy();
        expect(screen.getByText('Enviar a Notion')).toBeTruthy();
    });
});
