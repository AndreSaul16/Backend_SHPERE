import { Download, Table as TableIcon } from 'lucide-react';
import type { Artifact } from '@/types/artifact';

interface DataGridProps {
    artifact: Artifact;
}

/**
 * Divide una fila por el separador `|`, respetando `\|` — un `|` literal
 * dentro de una celda, que es como markdown lo escapa. `line.split('|')` a
 * secas partía «Coste \| impuestos» en dos columnas y corría el resto de la
 * fila una posición.
 */
function splitCells(line: string): string[] {
    const cells: string[] = [];
    let current = '';
    for (let i = 0; i < line.length; i++) {
        if (line[i] === '\\' && line[i + 1] === '|') {
            current += '|';
            i++;
        } else if (line[i] === '|') {
            cells.push(current);
            current = '';
        } else {
            current += line[i];
        }
    }
    cells.push(current);
    return cells;
}

/**
 * D35 — una fila de la tabla, celda a celda.
 *
 * Lo que hacía antes: `.filter(cell => cell !== '' && !cell.match(/^[-:]+$/))`.
 * Eso no filtraba ruido, **borraba datos**: una celda vacía desaparecía y
 * TODAS las de su derecha se corrían una columna a la izquierda, así que el
 * usuario leía cifras bajo la cabecera equivocada. Y una celda cuyo contenido
 * fuera `-` (la forma habitual de escribir «sin dato») desaparecía igual.
 *
 * Los únicos vacíos que sobran son los que producen los `|` de los extremos, y
 * son exactamente uno por lado.
 */
function parseRow(line: string): string[] {
    const cells = splitCells(line);
    if (cells.length > 1 && cells[0].trim() === '') cells.shift();
    if (cells.length > 1 && cells[cells.length - 1].trim() === '') cells.pop();
    return cells.map(cell => cell.trim());
}

/** La fila de guiones de markdown: `---`, `:---`, `---:`, `:---:`. */
function isSeparatorRow(cells: string[]): boolean {
    return cells.length > 0 && cells.every(cell => /^:?-+:?$/.test(cell));
}

function parseMarkdownTable(content: string): { headers: string[]; rows: string[][] } {
    const lines = content.trim().split('\n').filter(line => line.trim());
    if (lines.length < 2) return { headers: [], rows: [] };

    const headers = parseRow(lines[0]);

    // Antes: `lines[1].includes('-')`. Cualquier `-` en la segunda línea la
    // daba por fila de guiones — un importe negativo, una fecha `2026-01-05` o
    // una palabra con guion bastaban para que la PRIMERA fila de datos
    // desapareciera. La fila de guiones es la que tiene *todas* sus celdas
    // hechas de guiones.
    const bodyStart = isSeparatorRow(parseRow(lines[1])) ? 2 : 1;

    const rows = lines.slice(bodyStart).map(line => {
        const cells = parseRow(line);
        // Una fila más corta que la cabecera se rellena por la derecha: las
        // celdas que sí vienen conservan su columna.
        while (cells.length < headers.length) cells.push('');
        return cells;
    });

    return { headers, rows };
}

function toCSV(headers: string[], rows: string[][]): string {
    const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
    return [headers.map(escape).join(','), ...rows.map(row => row.map(escape).join(','))].join('\n');
}

export function DataGrid({ artifact }: DataGridProps) {
    const { headers, rows } = parseMarkdownTable(artifact.content);

    const handleDownload = () => {
        const csv = toCSV(headers, rows);
        const filename = `${artifact.title.replace(/\s+/g, '_').toLowerCase()}.csv`;
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (headers.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-content-muted font-mono text-xs">
                DATOS INCOMPLETOS O MAL FORMATEADOS
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-[#0d0d12]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3 bg-white/[0.02] border-b border-white/5">
                <div className="flex items-center gap-3">
                    <TableIcon className="h-4 w-4 text-content-muted" aria-hidden="true" />
                    <span className="text-micro font-mono text-content-muted uppercase">
                        Data Analysis View
                    </span>
                </div>
                <button
                    onClick={handleDownload}
                    className="p-2 rounded-xl hover:bg-white/5 transition-all text-gray-400 hover:text-electric-cyan"
                    title="Exportar CSV"
                >
                    <Download className="h-4 w-4" />
                </button>
            </div>

            {/* Table Content */}
            <div className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                <table className="w-full text-[13px] border-collapse">
                    <thead className="sticky top-0 z-10">
                        <tr className="bg-[#16161c]">
                            {headers.map((header, i) => (
                                <th
                                    key={i}
                                    className="px-6 py-4 text-left text-micro font-bold text-gray-400 uppercase border-b border-white/5"
                                >
                                    {header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.03]">
                        {rows.map((row, rowIdx) => (
                            <tr
                                key={rowIdx}
                                className="group hover:bg-white/[0.02] transition-colors"
                            >
                                {row.map((cell, cellIdx) => {
                                    const isNumeric = !isNaN(Number(cell.replace(/[^0-9.-]+/g, ""))) && cell !== '';
                                    return (
                                        <td
                                            key={cellIdx}
                                            className={`px-6 py-4 text-gray-300 group-hover:text-white transition-colors ${isNumeric ? 'text-right font-mono text-electric-cyan/80' : 'text-left'
                                                }`}
                                        >
                                            {cell}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Footer Summary */}
            <div className="px-6 py-3 bg-white/[0.01] border-t border-white/5">
                <p className="text-micro text-content-muted font-mono uppercase">
                    REC: {rows.length} · COLS: {headers.length} · SOURCE: SPHERE_ENGINE_V2
                </p>
            </div>
        </div>
    );
}
