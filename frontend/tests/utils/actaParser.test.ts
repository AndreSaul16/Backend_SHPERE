import { describe, it, expect } from 'vitest';
import { parseProximosPasos } from '../../src/utils/actaParser';

const ACTA = `# Acta de la Junta Directiva

## Decisión ejecutiva
Adelante con el plan.

## Próximos pasos
- Definir precios con Finanzas
- Preparar landing (responsable: Marketing)
  Incluir pruebas A/B
- Contratar 2 ingenieros

## Riesgos clave
- Competencia agresiva
`;

describe('parseProximosPasos (F2)', () => {
    it('extrae cada bullet como un issue', () => {
        const issues = parseProximosPasos(ACTA);
        expect(issues).toHaveLength(3);
        expect(issues[0].title).toBe('Definir precios con Finanzas');
        expect(issues[2].title).toBe('Contratar 2 ingenieros');
    });

    it('acumula líneas de continuación en el body', () => {
        const issues = parseProximosPasos(ACTA);
        expect(issues[1].title).toBe('Preparar landing (responsable: Marketing)');
        expect(issues[1].body).toBe('Incluir pruebas A/B');
    });

    it('se detiene en el siguiente heading (no incluye Riesgos)', () => {
        const issues = parseProximosPasos(ACTA);
        expect(issues.some((i) => /competencia/i.test(i.title))).toBe(false);
    });

    it('soporta listas numeradas', () => {
        const md = `## Próximos pasos\n1. Uno\n2) Dos`;
        const issues = parseProximosPasos(md);
        expect(issues.map((i) => i.title)).toEqual(['Uno', 'Dos']);
    });

    it('devuelve [] si no hay sección de próximos pasos', () => {
        expect(parseProximosPasos('# Acta\n## Riesgos\n- x')).toEqual([]);
    });

    it('devuelve [] con markdown vacío', () => {
        expect(parseProximosPasos('')).toEqual([]);
    });
});
