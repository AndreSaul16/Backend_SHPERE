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

    it('detecta el heading con decoración del LLM (negrita, dos puntos, numeración, emoji)', () => {
        for (const heading of [
            '## **Próximos pasos**',
            '## Próximos pasos:',
            '### 4. Próximos pasos',
            '## Próximos pasos 🚀',
            '## `Proximos pasos`',
        ]) {
            const issues = parseProximosPasos(`${heading}\n- Tarea única`);
            expect(issues.map((i) => i.title)).toEqual(['Tarea única']);
        }
    });
});

/**
 * lanzamiento-p0 · AD-003 — los 14 formatos de la auditoría.
 *
 * Los 7 primeros ya funcionaban y están aquí como regresión: lo que se amplía
 * no puede llevarse por delante lo que ya se reconocía. Los 7 últimos devolvían
 * cero items, así que el acta traía próximos pasos y el usuario veía una lista
 * vacía.
 *
 * El título es siempre el mismo en los formatos 8-14 a propósito: si un caso se
 * cae, el mensaje dice cuál.
 */
const PASO = 'Migrar el índice a Postgres';

const LOS_14: { n: number; nombre: string; md: string; titulos: string[] }[] = [
    { n: 1, nombre: 'encabezado llano + bullets `-`', md: `## Próximos pasos\n- Definir precios con Finanzas`, titulos: ['Definir precios con Finanzas'] },
    { n: 2, nombre: 'encabezado en negrita', md: `## **Próximos pasos**\n- Definir precios con Finanzas`, titulos: ['Definir precios con Finanzas'] },
    { n: 3, nombre: 'numerado y con dos puntos', md: `## 4. Próximos pasos:\n- Definir precios con Finanzas`, titulos: ['Definir precios con Finanzas'] },
    { n: 4, nombre: 'con emoji', md: `## 🚀 Próximos pasos\n- Definir precios con Finanzas`, titulos: ['Definir precios con Finanzas'] },
    { n: 5, nombre: 'sin tilde', md: `## Proximos pasos\n- Definir precios con Finanzas`, titulos: ['Definir precios con Finanzas'] },
    { n: 6, nombre: 'bullets `*`, `1.` y `1)`', md: `## Próximos pasos\n* Uno\n1. Dos\n2) Tres`, titulos: ['Uno', 'Dos', 'Tres'] },
    { n: 7, nombre: 'continuación indentada', md: `## Próximos pasos\n- Preparar landing\n  Incluir pruebas A/B`, titulos: ['Preparar landing'] },
    { n: 8, nombre: 'Next steps', md: `## Next steps\n- ${PASO}`, titulos: [PASO] },
    { n: 9, nombre: 'Plan de acción', md: `## Plan de acción\n- ${PASO}`, titulos: [PASO] },
    { n: 10, nombre: 'Acciones inmediatas', md: `## Acciones inmediatas\n- ${PASO}`, titulos: [PASO] },
    { n: 11, nombre: 'negrita sin `#`', md: `**Próximos pasos**\n- ${PASO}`, titulos: [PASO] },
    { n: 12, nombre: 'tabla', md: `## Próximos pasos\n\n| Acción | Responsable |\n| --- | --- |\n| ${PASO} | CTO |`, titulos: [PASO] },
    { n: 13, nombre: 'párrafo', md: `## Próximos pasos\n\n${PASO} antes de octubre.`, titulos: [`${PASO} antes de octubre.`] },
    { n: 14, nombre: 'sub-encabezados', md: `## Próximos pasos\n\n### Corto plazo\n- ${PASO}`, titulos: [PASO] },
];

describe('los 14 formatos', () => {
    it.each(LOS_14)('$n · $nombre', ({ md, titulos }) => {
        const issues = parseProximosPasos(md);
        expect(issues).toHaveLength(titulos.length);
        expect(issues.map((i) => i.title)).toEqual(titulos);
        // AD-003: «los 14 devuelven al menos un item con título no vacío».
        for (const issue of issues) expect(issue.title.trim()).not.toBe('');
    });
});

describe('AD-003 — la sección termina donde le toca, no en el primer encabezado', () => {
    it('los sub-encabezados son parte de la sección; el siguiente hermano la cierra', () => {
        const md = `## Próximos pasos

### Corto plazo
- Migrar el índice a Postgres
- Cerrar la ronda antes de octubre

### Largo plazo
- Abrir oficina en Lisboa

## Riesgos
- Competencia agresiva
- Fuga de talento
- Retraso del proveedor
`;
        const issues = parseProximosPasos(md);

        expect(issues).toHaveLength(3);
        expect(issues.map((i) => i.title)).toEqual([
            'Migrar el índice a Postgres',
            'Cerrar la ronda antes de octubre',
            'Abrir oficina en Lisboa',
        ]);
        // Ninguno sale de «Riesgos», que es una sección hermana.
        expect(issues.some((i) => /competencia|talento|proveedor/i.test(i.title))).toBe(false);
    });

    it('la variante en negrita sin `#` la cierra cualquier encabezado real', () => {
        const md = `**Próximos pasos**
- Migrar el índice a Postgres

## Riesgos
- Competencia agresiva
`;
        const issues = parseProximosPasos(md);
        expect(issues.map((i) => i.title)).toEqual(['Migrar el índice a Postgres']);
    });

    it('una tabla da un item por fila de datos, con el resto de celdas en el body', () => {
        const md = `## Próximos pasos

| Acción | Responsable | Fecha |
| --- | --- | --- |
| Migrar el índice a Postgres | CTO | Q4 |
| Cerrar la ronda | CEO | octubre |
`;
        const issues = parseProximosPasos(md);

        expect(issues).toHaveLength(2);
        expect(issues[0].title).toBe('Migrar el índice a Postgres');
        expect(issues[0].body).toContain('CTO');
        expect(issues[0].body).toContain('Q4');
        expect(issues[1].title).toBe('Cerrar la ronda');
        // Ni la cabecera ni el separador son items.
        expect(issues.some((i) => /^Acción$/.test(i.title) || /---/.test(i.title))).toBe(false);
    });

    it('un párrafo da un item por línea, pero sólo si no hubo bullets ni tabla', () => {
        const conParrafo = parseProximosPasos(
            `## Próximos pasos\n\nMigrar el índice a Postgres.\nCerrar la ronda antes de octubre.`
        );
        expect(conParrafo.map((i) => i.title)).toEqual([
            'Migrar el índice a Postgres.',
            'Cerrar la ronda antes de octubre.',
        ]);

        // Con bullets, la prosa que los rodea sigue siendo body, no items nuevos.
        const conBullets = parseProximosPasos(
            `## Próximos pasos\n\n- Migrar el índice a Postgres\n  Antes de que crezca el índice.`
        );
        expect(conBullets.map((i) => i.title)).toEqual(['Migrar el índice a Postgres']);
        expect(conBullets[0].body).toBe('Antes de que crezca el índice.');
    });
});

describe('AD-003 — sin sección no se inventa nada', () => {
    it('un acta con Resumen y Riesgos pero sin próximos pasos devuelve []', () => {
        const md = `# Acta de la Junta

## Resumen
Se aprobó el plan con reservas.

## Riesgos
- Competencia agresiva
- Fuga de talento
`;
        expect(parseProximosPasos(md)).toEqual([]);
    });
});
