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

/** Los separadores que este visor reconoce, **en orden de prioridad**. */
const SEPARADORES = ['|', '\t', ';', ','] as const;
type Separador = typeof SEPARADORES[number];

/**
 * Qué separa las celdas de esta tabla, mirando su primera línea con contenido.
 *
 * El orden es la decisión, y es fijo: `|`, tabulador, `;`, coma. **No se elige
 * el que más aparece.** La heurística de frecuencia se equivoca justo en el
 * caso caro —una tabla markdown de cifras con separador de millares,
 * `| Ingresos | 1,200 | 3,400 |`, tiene más comas que barras— y ese error
 * produce columnas creíbles y falsas, que es la clase de daño que este visor ya
 * causó una vez (D35).
 *
 * Después de la barra: el tabulador no aparece por accidente dentro de una
 * celda; el `;` es el CSV de locale español y casi nunca sale en prosa; la coma
 * va la última porque es la más ambigua de las cuatro.
 */
function detectarSeparador(linea: string): Separador | null {
    return SEPARADORES.find(sep => linea.includes(sep)) ?? null;
}

/**
 * Trocea un texto separado por valores, respetando el entrecomillado.
 *
 * Un campo entre comillas dobles puede llevar dentro el separador y saltos de
 * línea, y `""` representa una comilla literal. Por eso se recorre el contenido
 * ENTERO y no línea a línea: partir por `\n` antes de mirar las comillas rompe
 * exactamente los campos que el entrecomillado existe para proteger.
 */
function trocearValoresSeparados(texto: string, sep: string): string[][] {
    const filas: string[][] = [];
    let fila: string[] = [];
    let campo = '';
    let entreComillas = false;

    for (let i = 0; i < texto.length; i++) {
        const c = texto[i];

        if (entreComillas) {
            if (c === '"' && texto[i + 1] === '"') {
                campo += '"';
                i++;
            } else if (c === '"') {
                entreComillas = false;
            } else {
                campo += c;
            }
            continue;
        }

        if (c === '"' && campo.trim() === '') {
            entreComillas = true;
            campo = '';
        } else if (c === sep) {
            fila.push(campo);
            campo = '';
        } else if (c === '\n') {
            fila.push(campo);
            filas.push(fila);
            fila = [];
            campo = '';
        } else if (c !== '\r') {
            campo += c;
        }
    }
    fila.push(campo);
    filas.push(fila);

    return filas
        .map(f => f.map(celda => celda.trim()))
        .filter(f => f.some(celda => celda !== ''));
}

/**
 * La tabla, venga en markdown o en valores separados.
 *
 * La ruta markdown queda intacta byte a byte: `splitCells`, `parseRow`, la
 * detección real de la fila de guiones y el relleno por la derecha siguen
 * siendo los mismos, y los diez casos de regresión D35 los vigilan.
 */
function parseTabla(content: string): { headers: string[]; rows: string[][] } {
    const texto = content.trim();
    if (!texto) return { headers: [], rows: [] };

    const primeraLinea = texto.split('\n').find(linea => linea.trim()) ?? '';
    const separador = detectarSeparador(primeraLinea);
    if (!separador) return { headers: [], rows: [] };

    if (separador === '|') return parseMarkdownTable(texto);

    const filas = trocearValoresSeparados(texto, separador);
    if (filas.length < 2) return { headers: [], rows: [] };

    const headers = filas[0];
    // La fila de guiones NO se busca aquí: en markdown `---` separa la cabecera
    // del cuerpo, pero en un CSV es un dato («sin valor» se escribe así).
    const rows = filas.slice(1).map(cells => {
        while (cells.length < headers.length) cells.push('');
        return cells;
    });

    return { headers, rows };
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
    const { headers, rows } = parseTabla(artifact.content);

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
                La tabla no se ha podido leer: no se distinguen columnas en el contenido.
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-surface-code">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3 bg-surface-1 border-b border-stroke-hairline">
                <div className="flex items-center gap-3">
                    <TableIcon className="h-4 w-4 text-content-muted" aria-hidden="true" />
                    <span className="text-micro font-mono text-content-muted uppercase">
                        Vista de datos
                    </span>
                </div>
                <button
                    onClick={handleDownload}
                    aria-label="Exportar como CSV"
                    title="Exportar como CSV"
                    className="p-2 rounded-sm hover:bg-stroke-hairline transition-colors duration-(--duration-tap) text-content-muted hover:text-content-strong"
                >
                    <Download className="h-4 w-4" aria-hidden="true" />
                </button>
            </div>

            {/* Table Content — 6.15 · §9.7/§12.12: el contenedor se desplaza en
                horizontal y no admitía foco, así que a 320px las columnas de la
                derecha eran inalcanzables sin ratón. `tabIndex` + `role` es lo
                que las devuelve al teclado; el mismo remedio que `DocTable`. */}
            <div
                role="region"
                aria-label="Tabla de datos, desplazable"
                tabIndex={0}
                className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-(--focus-ring)"
            >
                <table className="w-full text-sm border-collapse">
                    <thead className="sticky top-0 z-10">
                        <tr className="bg-surface-1">
                            {headers.map((header, i) => (
                                <th
                                    key={i}
                                    className="px-3 sm:px-6 py-3 sm:py-4 text-left text-micro font-bold text-content-muted uppercase border-b border-stroke-hairline whitespace-nowrap"
                                >
                                    {header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-stroke-hairline">
                        {rows.map((row, rowIdx) => (
                            <tr
                                key={rowIdx}
                                className="group hover:bg-surface-1 transition-colors"
                            >
                                {row.map((cell, cellIdx) => {
                                    /* FASE 8 — dos defectos medidos:
                                       (1) el detector de cifra despojaba TODO
                                       lo no numérico antes de comprobar, así
                                       que «Soporte lanzamiento» → «» → 0 y
                                       cada celda de texto salía como cifra;
                                       (2) el color era electric-cyan/80 (el
                                       acento vía shim al 80%), que en tema
                                       claro medía 2.98:1 sobre el papel. La
                                       cifra va en content con tnum; el texto,
                                       en content-muted. */
                                    const isNumeric = /^[-+]?[\d.,\s]+\s*(?:%|€|\$)?$/.test(cell.trim()) && /\d/.test(cell);
                                    return (
                                        <td
                                            key={cellIdx}
                                            className={`px-6 py-4 transition-colors ${isNumeric
                                                ? 'text-right font-mono tnum text-content group-hover:text-content-strong'
                                                : 'text-left text-content-muted group-hover:text-content-strong'
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
            <div className="px-6 py-3 bg-surface-1 border-t border-stroke-hairline">
                <p className="text-micro text-content-muted font-mono uppercase tnum">
                    {rows.length === 1 ? '1 fila' : `${rows.length} filas`} · {headers.length === 1 ? '1 columna' : `${headers.length} columnas`}
                </p>
            </div>
        </div>
    );
}
