import type { Artifact } from '@/types/artifact';

/**
 * ¿Este artefacto es el acta de la junta?
 *
 * La regla vivía duplicada a ojo en `ArtifactPanel` (`/acta/i.test(title)`) y
 * ahora la necesitan también el visor —para la cabecera con fecha, recuento y
 * Sello— y sus pruebas. Una sola definición, porque si las dos se separan el
 * acta sale con barra de acciones y sin sello, o al revés.
 *
 * Se mira el título y no el contenido a propósito: el backend nombra el
 * artefacto de la síntesis «Acta de la junta…», y el contenido de un artefacto
 * de código puede mencionar la palabra sin ser un acta.
 */
export function esActa(artifact: Pick<Artifact, 'type' | 'title'>): boolean {
    return artifact.type === 'markdown' && /\bactas?\b/i.test(artifact.title);
}
