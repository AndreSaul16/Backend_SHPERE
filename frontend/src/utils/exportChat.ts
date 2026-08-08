/**
 * Descargar un fichero generado en el navegador.
 *
 * Aquí vivía además `exportAsMarkdown`, que construía el export de la junta en
 * markdown plano. Se retira con la tarea 5.13: lo sustituye
 * `exportBoardHtml.ts`, que conserva los votos, las confianzas, el recuento y
 * el acta con su jerarquía —todo lo que el markdown perdía—. Y de paso se va
 * con él su pie, «Powered by SPHERE Intelligence», que es literalmente el
 * anti-ejemplo de la fila «Sin firma en cada pantalla» de DESIGN §11.
 *
 * El acta suelta se sigue bajando en `.md` desde su propio visor, que es donde
 * un markdown sí es lo que se quiere.
 */

export function downloadAsFile(content: string, filename: string, mimeType: string = 'text/markdown') {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
