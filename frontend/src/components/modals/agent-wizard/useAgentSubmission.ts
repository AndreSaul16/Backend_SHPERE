/**
 * Crear el agente y subir sus documentos (D41).
 *
 * Es el único sitio del asistente que habla con el mundo, y por eso está solo:
 * el resto de piezas son formulario y pintura. El orden importa y es el que
 * era —primero el agente, después sus documentos uno a uno—, porque la subida
 * necesita el identificador que devuelve la creación.
 */
import type { Dispatch } from 'react';
import { useChatStore } from '@/store/useChatStore';
import { errorMessage } from './errorMessage';
import { uploadDocument } from './uploadDocument';
import type { WizardAction, WizardState } from './wizardReducer';

export function useAgentSubmission(
    state: WizardState,
    dispatch: Dispatch<WizardAction>,
    onAgentCreated: (agentId: string) => void,
    onClose: () => void,
): () => Promise<void> {
    // D20: se coge LA ACCIÓN, no el store entero. Suscribirse al store completo
    // mete un re-render del asistente por cada token de streaming que llegue
    // mientras el modal está abierto.
    const addCustomAgent = useChatStore((s) => s.addCustomAgent);

    return async () => {
        const { form, files } = state;
        dispatch({ type: 'submitStart' });

        try {
            // 1. El agente, por la acción del store (que llama a
            //    `chatService.createCustomAgent`).
            const agentId = await addCustomAgent({
                identity: {
                    name: form.name.trim(),
                    role: 'specialist',
                    color: form.color,
                },
                brain_config: {
                    model: form.model,
                    temperature: form.temperature,
                    system_prompt: form.systemPrompt.trim(),
                },
                owner_user_id: 'default_user',
                is_public: false,
            });

            // D67 — el identificador lo devuelve la acción. Antes se leía de
            // `customAgents[0]`, o sea de una suposición sobre el orden de la
            // lista: si el store se recargaba entre medias, los documentos
            // subían al agente equivocado.
            if (!agentId) {
                throw new Error('No se pudo obtener el ID del agente creado');
            }

            // 2. Los documentos, EN SERIE. Un fichero que falla no aborta los
            //    demás: se marca en rojo y la creación se da por buena.
            for (const entry of files) {
                dispatch({
                    type: 'patchFile',
                    id: entry.id,
                    patch: { status: 'uploading', progress: 0 },
                });

                try {
                    await uploadDocument(agentId, entry.file, (progress) =>
                        dispatch({ type: 'patchFile', id: entry.id, patch: { progress } }),
                    );
                    dispatch({
                        type: 'patchFile',
                        id: entry.id,
                        patch: { status: 'success', progress: 100 },
                    });
                } catch (uploadErr) {
                    dispatch({
                        type: 'patchFile',
                        id: entry.id,
                        patch: {
                            status: 'error',
                            errorMessage: errorMessage(uploadErr, 'Error al subir'),
                        },
                    });
                }
            }

            onAgentCreated(agentId);
            onClose();
        } catch (err) {
            dispatch({
                type: 'submitFailed',
                message: errorMessage(err, 'Error al crear el agente'),
            });
        } finally {
            dispatch({ type: 'submitSettled' });
        }
    };
}
