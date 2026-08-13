import { describe, it, expect } from 'vitest';
import {
    agujaSvg,
    construirHtmlDeJunta,
    escapar,
    markdownAHtml,
} from '../../src/utils/exportBoardHtml';
import type { Agent, Message } from '../../src/types';

/**
 * Tarea 5.13 · Q14 — la junta como una sola página HTML autocontenida.
 *
 * Criterio: «el fichero se abre sin red y muestra acta, recuento, agujas y
 * transcript». Las dos reglas duras que se prueban aquí:
 *
 *  1. **Ni una petición al abrirlo.** Nada de `src`/`href` a otro host, ni
 *     `@import`, ni una fuente web. Un documento archivado que necesita
 *     internet para verse no está archivado.
 *  2. **Todo lo de fuera se escapa.** El acta y los turnos los escribe un
 *     modelo y aquí se construyen etiquetas a mano.
 */

const AGENTES: Agent[] = [
    { id: 'cto-1', name: 'Nexus (CTO)', role: 'CTO', avatar: 'N', description: '', color: '', hexColor: '#00BFB0', isOnline: true },
    { id: 'cfo-1', name: 'Ledger (CFO)', role: 'CFO', avatar: 'L', description: '', color: '', hexColor: '#E0B341', isOnline: true },
];

const MENSAJES = [
    { id: '1', role: 'user', content: '¿Subimos precios?', timestamp: new Date('2026-07-12T10:00:00Z') },
    { id: '2', role: 'CTO', content: '**A favor.** La plataforma aguanta.', timestamp: new Date('2026-07-12T10:01:00Z') },
    { id: '3', role: 'CFO', content: 'En contra: perdemos la cola larga.', timestamp: new Date('2026-07-12T10:02:00Z') },
] as unknown as Message[];

const junta = (extra: Partial<Parameters<typeof construirHtmlDeJunta>[0]> = {}) =>
    construirHtmlDeJunta({
        titulo: 'Precios 2026',
        fecha: new Date('2026-07-12T10:00:00Z'),
        acta: '# Acta\n\n## Contexto\n\nEl precio es de 29 euros.\n\n- Uno\n- Dos\n',
        mensajes: MENSAJES,
        agentes: AGENTES,
        votos: {
            CTO: { decision: 'SI', confidence: 82 },
            CFO: { decision: 'NO', confidence: 91 },
        },
        coste: 5,
        ...extra,
    });

describe('el escapado', () => {
    it('el markdown se escapa ANTES de aplicarse, así que no se cuela una etiqueta', () => {
        const html = markdownAHtml('Hola <script>alert(1)</script> **fuerte**');
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;');
        // Y el markdown legítimo sí se aplica: escapar no puede romper el acta.
        expect(html).toContain('<strong>fuerte</strong>');
    });

    it('un enlace `javascript:` no sobrevive al viaje', () => {
        const html = markdownAHtml('[pulsa](javascript:alert(1))');
        expect(html).not.toContain('href="javascript:');
    });

    it('un enlace normal sí', () => {
        expect(markdownAHtml('[docs](https://ejemplo.com)')).toContain(
            '<a href="https://ejemplo.com"',
        );
    });

    it('las comillas del título no rompen el documento', () => {
        expect(escapar('El «"gran" plan»')).toContain('&quot;');
        const html = junta({ titulo: 'Un <b>título</b> raro' });
        expect(html).toContain('<title>Un &lt;b&gt;título&lt;/b&gt; raro</title>');
    });
});

describe('el subconjunto de markdown que un acta usa', () => {
    it('encabezados, listas, citas y filetes', () => {
        const html = markdownAHtml('## Contexto\n\n- Uno\n- Dos\n\n> Una cita\n\n---\n');
        expect(html).toContain('<h2>Contexto</h2>');
        expect(html).toContain('<ul>');
        expect(html).toContain('<li>Uno</li>');
        expect(html).toContain('<blockquote>Una cita</blockquote>');
        expect(html).toContain('<hr>');
    });

    it('las listas numeradas no se mezclan con las de viñeta', () => {
        const html = markdownAHtml('1. Uno\n2. Dos\n');
        expect(html).toContain('<ol>');
        expect(html).not.toContain('<ul>');
    });
});

describe('la aguja va dibujada, no descrita', () => {
    it('es SVG en línea con su nombre accesible', () => {
        const svg = agujaSvg(82);
        expect(svg).toContain('<svg');
        expect(svg).toContain('aria-label="Confianza 82 de 100"');
    });

    it('pasado el 70 la aguja se tiñe de oxblood (§8.2)', () => {
        expect(agujaSvg(91)).toContain('#B4322C');
        expect(agujaSvg(40)).toContain('#C79A45');
    });

    it('un valor imposible no rompe el dibujo', () => {
        expect(() => agujaSvg(1000)).not.toThrow();
        expect(agujaSvg(-5)).toContain('Confianza 0 de 100');
    });
});

describe('el documento entero', () => {
    it('lleva acta, recuento, agujas y debate', () => {
        const html = junta();
        expect(html).toContain('<h2>Recuento</h2>');
        expect(html).toContain('<h2>Acta</h2>');
        expect(html).toContain('<h2>Debate</h2>');
        expect(html).toContain('El precio es de 29 euros');
        expect(html).toContain('La plataforma aguanta');
        expect((html.match(/<svg/g) ?? []).length).toBe(2);
    });

    it('dice el veredicto, no sólo las cifras', () => {
        expect(junta()).toContain('Junta dividida');
        expect(
            junta({
                votos: {
                    CTO: { decision: 'SI', confidence: 82 },
                    CFO: { decision: 'SI', confidence: 70 },
                },
            }),
        ).toContain('Unanimidad');
    });

    it('nombra a los directores por su nombre, no por su rol interno', () => {
        const html = junta();
        expect(html).toContain('Nexus (CTO)');
        expect(html).toContain('Ledger (CFO)');
    });

    it('SE ABRE SIN RED: ni un recurso de otro host', () => {
        const html = junta();
        expect(html).not.toMatch(/src="https?:/);
        expect(html).not.toMatch(/<link\b/);
        expect(html).not.toMatch(/@import/);
        expect(html).not.toMatch(/fonts\.(googleapis|gstatic)/);
        expect(html).not.toMatch(/<script\b/);
    });

    it('una junta sin acta sigue siendo un documento, no un hueco', () => {
        const html = junta({ acta: null });
        expect(html).not.toContain('<h2>Acta</h2>');
        expect(html).toContain('<h2>Debate</h2>');
    });

    it('una conversación sin votos no finge un recuento', () => {
        const html = junta({ votos: {}, acta: null });
        expect(html).not.toContain('<h2>Recuento</h2>');
    });

    it('sin turnos lo dice, en vez de dejar la sección vacía', () => {
        expect(junta({ mensajes: [] })).toContain('no dejó turnos registrados');
    });
});
