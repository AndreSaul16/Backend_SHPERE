/**
 * Parser del acta del board (F2).
 * Extrae los items de la sección "## Próximos pasos" para convertirlos en
 * issues de GitHub. Cada bullet es un issue; las líneas de continuación
 * (indentadas, sin marcador) se acumulan en el body del item anterior.
 */

export interface ParsedIssue {
    title: string;
    body: string;
}

const HEADING_RE = /^#{1,6}\s+/;
// Coincide con "Próximos pasos" / "Proximos pasos" (con o sin acento), como heading.
const PROXIMOS_HEADING_RE = /^#{1,6}\s+pr[oó]ximos\s+pasos\s*$/i;
const BULLET_RE = /^\s*(?:[-*]|\d+[.)])\s+(.*)$/;

/**
 * Devuelve los items de "## Próximos pasos" del markdown del acta.
 * Si la sección no existe o no tiene items, devuelve [].
 */
export function parseProximosPasos(markdown: string): ParsedIssue[] {
    if (!markdown) return [];
    const lines = markdown.split(/\r?\n/);

    // Localizar el heading de la sección.
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
        if (PROXIMOS_HEADING_RE.test(lines[i].trim())) {
            start = i + 1;
            break;
        }
    }
    if (start === -1) return [];

    const issues: ParsedIssue[] = [];
    for (let i = start; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        // Fin de sección: siguiente heading.
        if (HEADING_RE.test(trimmed)) break;

        const bullet = line.match(BULLET_RE);
        if (bullet) {
            const text = bullet[1].trim();
            if (text) issues.push({ title: text, body: "" });
        } else if (trimmed && issues.length > 0) {
            // Línea de continuación del último item.
            const last = issues[issues.length - 1];
            last.body = last.body ? `${last.body}\n${trimmed}` : trimmed;
        }
    }

    return issues;
}
