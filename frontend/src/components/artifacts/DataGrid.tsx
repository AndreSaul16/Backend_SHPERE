import { Download, Table as TableIcon } from 'lucide-react';
import type { Artifact } from '@/types/artifact';

interface DataGridProps {
    artifact: Artifact;
}

function parseMarkdownTable(content: string): { headers: string[]; rows: string[][] } {
    const lines = content.trim().split('\n').filter(line => line.trim());
    if (lines.length < 2) return { headers: [], rows: [] };

    const parseRow = (line: string): string[] =>
        line.split('|').map(cell => cell.trim()).filter(cell => cell !== '' && !cell.match(/^[-:]+$/));

    const headers = parseRow(lines[0]);
    const rows = lines.slice(lines[1].includes('-') ? 2 : 1).map(parseRow);

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
