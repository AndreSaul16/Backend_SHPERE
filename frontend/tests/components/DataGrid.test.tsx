import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataGrid } from '../../src/components/artifacts/DataGrid';
import type { Artifact } from '../../src/types/artifact';

const makeArtifact = (content: string): Artifact => ({
    id: 'grid-1',
    type: 'data_table',
    title: 'Data',
    content,
    createdAt: new Date(),
});

describe('DataGrid Component', () => {
    it('parses a markdown table and renders it', () => {
        // DataGrid now takes a single `artifact` prop and parses a MARKDOWN table
        // (pipe-delimited), not raw CSV.
        const table = `| Name | Age |
|------|-----|
| Alice | 30 |
| Bob | 25 |`;
        render(<DataGrid artifact={makeArtifact(table)} />);

        // Headers
        expect(screen.getByText('Name')).toBeDefined();
        expect(screen.getByText('Age')).toBeDefined();

        // Cells
        expect(screen.getByText('Alice')).toBeDefined();
        expect(screen.getByText('30')).toBeDefined();
        expect(screen.getByText('Bob')).toBeDefined();
        expect(screen.getByText('25')).toBeDefined();
    });

    it('handles empty content', () => {
        // No parseable rows -> renders the "datos incompletos" placeholder, no table.
        const { container } = render(<DataGrid artifact={makeArtifact('')} />);
        expect(container.querySelector('table')).toBeNull();
    });
});

/**
 * Regresión D35 — `parseRow` corrompía la tabla.
 *
 * El filtro `cell !== '' && !cell.match(/^[-:]+$/)` no quitaba ruido: **borraba
 * celdas**. Cada hueco de la tabla desaparecía y todas las celdas a su derecha
 * subían una columna, así que el usuario leía valores reales bajo la cabecera
 * equivocada — corrupción visual de datos, sin ningún aviso.
 *
 * Los tres casos que exige el arreglo (hueco al principio, en medio y al
 * final), más las dos roturas del troceo de cabecera: el `|` escapado y la
 * detección de la fila de guiones por `includes('-')`.
 */
function leerRejilla(container: HTMLElement) {
    const cabeceras = [...container.querySelectorAll('thead th')].map(th => th.textContent);
    const filas = [...container.querySelectorAll('tbody tr')].map(tr =>
        [...tr.querySelectorAll('td')].map(td => td.textContent),
    );
    return { cabeceras, filas };
}

describe('DataGrid — celdas vacías y troceo (D35)', () => {
    it('un hueco AL PRINCIPIO no corre las columnas', () => {
        const tabla = [
            '| Región | Q1 | Q2 |',
            '|---|---|---|',
            '|  | 120 | 340 |',
        ].join('\n');
        const { container } = render(<DataGrid artifact={makeArtifact(tabla)} />);

        const { cabeceras, filas } = leerRejilla(container);
        expect(cabeceras).toEqual(['Región', 'Q1', 'Q2']);
        // Con el bug: ['120', '340'] — «120» se leía como la Región y «340»
        // como el Q1.
        expect(filas[0]).toEqual(['', '120', '340']);
    });

    it('un hueco EN MEDIO no corre las columnas', () => {
        const tabla = [
            '| Región | Q1 | Q2 |',
            '|---|---|---|',
            '| Norte |  | 340 |',
        ].join('\n');
        const { container } = render(<DataGrid artifact={makeArtifact(tabla)} />);

        // Con el bug: ['Norte', '340'] — 340 aparecía bajo Q1 en vez de Q2.
        expect(leerRejilla(container).filas[0]).toEqual(['Norte', '', '340']);
    });

    it('un hueco AL FINAL deja la columna vacía, no la elimina', () => {
        const tabla = [
            '| Región | Q1 | Q2 |',
            '|---|---|---|',
            '| Norte | 120 |  |',
        ].join('\n');
        const { container } = render(<DataGrid artifact={makeArtifact(tabla)} />);

        // Con el bug la fila tenía 2 <td> para 3 <th>: la tabla quedaba dentada.
        expect(leerRejilla(container).filas[0]).toEqual(['Norte', '120', '']);
    });

    it('varios huecos seguidos mantienen cada dato en su columna', () => {
        const tabla = [
            '| A | B | C | D |',
            '|---|---|---|---|',
            '|  |  | 3 |  |',
        ].join('\n');
        const { container } = render(<DataGrid artifact={makeArtifact(tabla)} />);

        // Con el bug: ['3'] — el 3 se leía como el valor de A.
        expect(leerRejilla(container).filas[0]).toEqual(['', '', '3', '']);
    });

    it('una celda con un guion es un dato, no un adorno de la tabla', () => {
        const tabla = [
            '| Concepto | Importe |',
            '|---|---|',
            '| Provisión | - |',
            '| Ingresos | 1.200 |',
        ].join('\n');
        const { container } = render(<DataGrid artifact={makeArtifact(tabla)} />);

        // `-` es cómo se escribe «sin dato». El filtro lo borraba y dejaba la
        // fila con una sola celda.
        expect(leerRejilla(container).filas).toEqual([
            ['Provisión', '-'],
            ['Ingresos', '1.200'],
        ]);
    });

    it('una cabecera con el separador escapado sigue siendo una sola columna', () => {
        const tabla = [
            '| Coste \\| impuestos | Total |',
            '|---|---|',
            '| 120 | 340 |',
        ].join('\n');
        const { container } = render(<DataGrid artifact={makeArtifact(tabla)} />);

        const { cabeceras, filas } = leerRejilla(container);
        // Con el bug: ['Coste \\', 'impuestos', 'Total'] — tres cabeceras para
        // dos columnas de datos.
        expect(cabeceras).toEqual(['Coste | impuestos', 'Total']);
        expect(filas[0]).toEqual(['120', '340']);
    });

    it('una celda con el separador escapado tampoco parte la fila', () => {
        const tabla = [
            '| Métrica | Valor |',
            '|---|---|',
            '| Margen | 30 \\| 40 |',
        ].join('\n');
        const { container } = render(<DataGrid artifact={makeArtifact(tabla)} />);

        expect(leerRejilla(container).filas[0]).toEqual(['Margen', '30 | 40']);
    });

    it('una tabla sin fila de guiones no pierde su primera fila por llevar un `-`', () => {
        const tabla = [
            '| Fecha | Saldo |',
            '| 2026-01-05 | -30 |',
            '| 2026-02-05 | 120 |',
        ].join('\n');
        const { container } = render(<DataGrid artifact={makeArtifact(tabla)} />);

        // `lines[1].includes('-')` daba la fila por separador y la tiraba: la
        // fecha y el saldo negativo bastaban para borrar un asiento entero.
        expect(leerRejilla(container).filas).toEqual([
            ['2026-01-05', '-30'],
            ['2026-02-05', '120'],
        ]);
    });

    it('la fila de guiones sí se descarta, con o sin alineación', () => {
        const tabla = [
            '| Nombre | Edad |',
            '| :--- | ---: |',
            '| Alice | 30 |',
        ].join('\n');
        const { container } = render(<DataGrid artifact={makeArtifact(tabla)} />);

        expect(leerRejilla(container).filas).toEqual([['Alice', '30']]);
    });

    it('el pie cuenta las filas y columnas reales', () => {
        const tabla = [
            '| A | B | C |',
            '|---|---|---|',
            '|  | 2 |  |',
            '| 4 |  | 6 |',
        ].join('\n');
        render(<DataGrid artifact={makeArtifact(tabla)} />);

        // Con el bug las columnas seguían siendo 3 pero las celdas no cuadraban
        // con ellas; el recuento de filas se mantiene y sirve de guardia.
        expect(screen.getByText(/REC: 2 · COLS: 3/)).toBeDefined();
    });
});
