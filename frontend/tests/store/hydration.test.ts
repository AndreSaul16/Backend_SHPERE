import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useChatStore } from '../../src/store/useChatStore';
import { server } from '../setup';
import { http, HttpResponse } from 'msw';

describe('useChatStore - Hidratación de Artefactos', () => {
    beforeEach(() => {
        useChatStore.getState().resetState();
    });

    it('debe extraer correctamente un artefacto XML del historial y convertirlo al formato interno', async () => {
        const xmlContent = 'Mira este código: <sphere_artifact title="Test" type="code" language="typescript">console.log("hello")</sphere_artifact>';

        server.use(
            http.get('http://localhost:8000/api/v1/sessions/:id/history', () => {
                return HttpResponse.json({
                    messages: [
                        {
                            type: 'ai',
                            content: xmlContent,
                            additional_kwargs: { timestamp: new Date().toISOString() }
                        }
                    ]
                });
            })
        );

        await useChatStore.getState().loadSession('session-test-1');

        const messages = useChatStore.getState().messagesBySession['session-test-1'];
        const artifacts = useChatStore.getState().artifacts;

        expect(messages).toBeDefined();
        expect(messages.length).toBe(1);
        expect(messages[0].content).toContain('[ARTIFACT:');
        expect(messages[0].content).not.toContain('<sphere_artifact');

        expect(artifacts.length).toBe(1);
        expect(artifacts[0].title).toBe('Test');
        expect(artifacts[0].content).toBe('console.log("hello")');
    });

    it('debe manejar XML malformado sin romper la aplicación', async () => {
        const brokenXml = 'XML roto: <sphere_artifact title="Broken" type="code"> sin cierre';

        server.use(
            http.get('http://localhost:8000/api/v1/sessions/:id/history', () => {
                return HttpResponse.json({
                    messages: [
                        {
                            type: 'ai',
                            content: brokenXml,
                            additional_kwargs: {}
                        }
                    ]
                });
            })
        );

        await useChatStore.getState().loadSession('session-test-broken');

        const messages = useChatStore.getState().messagesBySession['session-test-broken'];
        expect(messages[0].content).toBe(brokenXml);
        expect(useChatStore.getState().artifacts.length).toBe(0);
    });
});
