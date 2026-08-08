/**
 * Artefactos: los que llegan por stream, los rescatados del historial y el
 * panel que los enseña.
 *
 * `streamingArtifactBySession` es el canal abierto por sesión: mientras haya un
 * id ahí, los trozos que llegan se pegan a ese artefacto. Lo escriben también
 * el stream y `stopGeneration`, que es quien lo cierra si el usuario corta.
 */
import type { ArtifactsSlice, ChatGet, ChatSet } from './types';

export const createArtifactsSlice = (set: ChatSet, get: ChatGet): ArtifactsSlice => ({
    artifacts: [],
    activeArtifactId: null,
    isArtifactPanelOpen: false,
    streamingArtifactBySession: {},

    getArtifacts: () => get().artifacts,

    addArtifact: (artifact) => set((state) => ({
        artifacts: [...state.artifacts, artifact],
        activeArtifactId: artifact.id,
        isArtifactPanelOpen: true,
    })),

    setActiveArtifact: (id) => set({
        activeArtifactId: id,
        isArtifactPanelOpen: true
    }),

    toggleArtifactPanel: () => set((state) => ({ isArtifactPanelOpen: !state.isArtifactPanelOpen })),
});
