/**
 * Tarea 3.6 — el historial agrupado por fecha.
 *
 * `ahora` es parámetro de la función precisamente para que estos casos no
 * dependan del reloj de quien los corre ni del huso en el que se ejecute el CI.
 */
import { describe, it, expect } from 'vitest';
import { agruparPorFecha } from '../../src/components/sidebar/historialPorFecha';
import type { ChatSession } from '../../src/types';

const AHORA = new Date(2026, 7, 8, 12, 0, 0); // 8 de agosto de 2026, mediodía

const junta = (id: string, fecha: Date | string): ChatSession => ({
    session_id: id,
    user_id: 'u1',
    title: id,
    base_agent_id: 'group-chat',
    agent_ref_type: 'core',
    type: 'group',
    context_files: [],
    enabled_tools: [],
    members: [],
    created_at: typeof fecha === 'string' ? fecha : fecha.toISOString(),
});

const dias = (n: number) => new Date(AHORA.getTime() - n * 86_400_000);

describe('agruparPorFecha', () => {
    it('reparte las juntas en cubos por antigüedad', () => {
        const grupos = agruparPorFecha(
            [
                junta('hoy', new Date(2026, 7, 8, 9, 0)),
                junta('ayer', new Date(2026, 7, 7, 23, 30)),
                junta('semana', dias(4)),
                junta('mes', dias(20)),
                junta('antiguo', dias(400)),
            ],
            AHORA,
        );

        expect(grupos.map((g) => g.etiqueta)).toEqual([
            'Hoy',
            'Ayer',
            'Los últimos 7 días',
            'Los últimos 30 días',
            'Antes',
        ]);
        expect(grupos.map((g) => g.sesiones.map((s) => s.session_id))).toEqual([
            ['hoy'],
            ['ayer'],
            ['semana'],
            ['mes'],
            ['antiguo'],
        ]);
    });

    it('no devuelve grupos vacíos: un encabezado sin filas es una promesa incumplida', () => {
        const grupos = agruparPorFecha([junta('a', dias(3)), junta('b', dias(5))], AHORA);
        expect(grupos).toHaveLength(1);
        expect(grupos[0].etiqueta).toBe('Los últimos 7 días');
        // Y dentro del grupo, de la más reciente a la más antigua.
        expect(grupos[0].sesiones.map((s) => s.session_id)).toEqual(['a', 'b']);
    });

    it('«ayer» se mide por día natural, no por 24 horas', () => {
        // Anoche a las 23:30 son menos de 24 h, pero es AYER.
        const grupos = agruparPorFecha([junta('anoche', new Date(2026, 7, 7, 23, 30))], AHORA);
        expect(grupos[0].etiqueta).toBe('Ayer');
    });

    it('una fecha ilegible cae en «Antes» y no tira la barra lateral', () => {
        const grupos = agruparPorFecha([junta('rota', 'no-es-una-fecha'), junta('hoy', AHORA)], AHORA);
        expect(grupos.map((g) => g.etiqueta)).toEqual(['Hoy', 'Antes']);
        expect(grupos[1].sesiones[0].session_id).toBe('rota');
    });

    it('sin juntas no hay grupos', () => {
        expect(agruparPorFecha([], AHORA)).toEqual([]);
    });
});
