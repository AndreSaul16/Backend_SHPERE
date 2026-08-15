/**
 * La línea de tiempo de la Sesión de Muestra — DIRECCION.md §4.1 y §2.S1.
 *
 * Este fichero no prueba código: prueba CONTENIDO. La sesión de muestra es la
 * única pieza de la landing donde un dato mal escrito no rompe nada y aun así
 * miente —una fase fuera de orden, un voto que no cuadra con el recuento, un
 * turno que se va de largo— y por eso las reglas del guion se defienden aquí
 * en vez de confiar en que el siguiente que la edite se acuerde de §2.S1.
 */

import { describe, expect, it } from 'vitest';
import {
  ASIENTOS,
  DURACION_REPRODUCIDA_MS,
  FASES,
  SESION_DE_MUESTRA,
  VELOCIDAD,
  type EventoDeSesion,
  type Sentido,
} from '../src/demo/sesionDeMuestra';

function deTipo<T extends EventoDeSesion['tipo']>(
  tipo: T,
): Extract<EventoDeSesion, { tipo: T }>[] {
  return SESION_DE_MUESTRA.filter(
    (evento): evento is Extract<EventoDeSesion, { tipo: T }> => evento.tipo === tipo,
  );
}

describe('la línea de tiempo', () => {
  it('lleva los timestamps estrictamente crecientes', () => {
    const desordenados = SESION_DE_MUESTRA.filter(
      (evento, indice) => indice > 0 && evento.t <= (SESION_DE_MUESTRA[indice - 1]?.t ?? -1),
    );
    expect(desordenados).toEqual([]);
  });

  it('empieza en cero: la sesión no arranca con una espera muerta', () => {
    expect(SESION_DE_MUESTRA[0]?.t).toBe(0);
  });

  it('dura ≈ 40 s reproducida a 2×', () => {
    expect(VELOCIDAD).toBe(2);
    expect(DURACION_REPRODUCIDA_MS).toBeGreaterThan(38_000);
    expect(DURACION_REPRODUCIDA_MS).toBeLessThan(42_000);
  });
});

describe('las fases', () => {
  it('van en el orden canónico del producto y cada una ocurre una sola vez', () => {
    expect(deTipo('fase').map((evento) => evento.fase)).toEqual([...FASES]);
  });

  it('ningún turno llega antes de que se abra una fase', () => {
    const primeraFase = SESION_DE_MUESTRA.findIndex((evento) => evento.tipo === 'fase');
    const primerTurno = SESION_DE_MUESTRA.findIndex((evento) => evento.tipo === 'turno');
    expect(primeraFase).toBeLessThan(primerTurno);
  });
});

describe('los votos', () => {
  const votos = deTipo('voto');

  it('son exactamente cuatro, uno por asiento del Palco', () => {
    expect(votos).toHaveLength(ASIENTOS.length);
    expect([...votos.map((voto) => voto.quien)].sort()).toEqual([...ASIENTOS].sort());
  });

  it('llevan las confianzas del contrato: Ledger 88, Oberon 74, Nexus 66, Vortex 71', () => {
    const porDirector = new Map(votos.map((voto) => [voto.quien, voto.confianza]));
    expect(porDirector.get('ledger')).toBe(88);
    expect(porDirector.get('oberon')).toBe(74);
    expect(porDirector.get('nexus')).toBe(66);
    expect(porDirector.get('vortex')).toBe(71);
  });

  it('llevan los sentidos del contrato: SÍ, SÍ, CONDICIONAL y NO', () => {
    const porDirector = new Map<string, Sentido>(votos.map((voto) => [voto.quien, voto.sentido]));
    expect(porDirector.get('ledger')).toBe('SÍ');
    expect(porDirector.get('oberon')).toBe('SÍ');
    expect(porDirector.get('nexus')).toBe('CONDICIONAL');
    expect(porDirector.get('vortex')).toBe('NO');
  });

  it('se emiten todos en la fase de síntesis, después del último argumento', () => {
    const sintesis = SESION_DE_MUESTRA.findIndex(
      (evento) => evento.tipo === 'fase' && evento.fase === 'synthesis',
    );
    for (const voto of votos) {
      expect(SESION_DE_MUESTRA.indexOf(voto)).toBeGreaterThan(sintesis);
    }
  });

  it('el único que cruza el 70 en contra es el NO de Vortex, que es el disenso', () => {
    const altos = votos.filter((voto) => voto.confianza > 70);
    expect(altos.map((voto) => voto.quien).sort()).toEqual(['ledger', 'oberon', 'vortex']);
    expect(altos.filter((voto) => voto.sentido === 'NO')).toHaveLength(1);
  });
});

describe('el recuento', () => {
  it('es 2 · 1 · 1 y cuadra con los votos emitidos', () => {
    const recuentos = deTipo('recuento');
    expect(recuentos).toHaveLength(1);

    const recuento = recuentos[0];
    expect(recuento).toBeDefined();
    expect(recuento?.si).toBe(2);
    expect(recuento?.condicional).toBe(1);
    expect(recuento?.no).toBe(1);

    const votos = deTipo('voto');
    expect(votos.filter((voto) => voto.sentido === 'SÍ')).toHaveLength(recuento?.si ?? -1);
    expect(votos.filter((voto) => voto.sentido === 'CONDICIONAL')).toHaveLength(
      recuento?.condicional ?? -1,
    );
    expect(votos.filter((voto) => voto.sentido === 'NO')).toHaveLength(recuento?.no ?? -1);
  });

  it('se anuncia cuando ya han votado los cuatro', () => {
    const recuento = SESION_DE_MUESTRA.findIndex((evento) => evento.tipo === 'recuento');
    const ultimoVoto = SESION_DE_MUESTRA.map((evento) => evento.tipo).lastIndexOf('voto');
    expect(recuento).toBeGreaterThan(ultimoVoto);
  });
});

describe('el acta', () => {
  it('el último evento de la sesión es el cierre del acta', () => {
    expect(SESION_DE_MUESTRA[SESION_DE_MUESTRA.length - 1]?.tipo).toBe('acta_cierre');
    expect(deTipo('acta_cierre')).toHaveLength(1);
  });

  it('se escribe antes de cerrarse, y con trozos suficientes para llenar un renglón', () => {
    const trozos = deTipo('acta_chunk');
    expect(trozos.length).toBeGreaterThan(12);

    const cierre = SESION_DE_MUESTRA.findIndex((evento) => evento.tipo === 'acta_cierre');
    for (const trozo of trozos) {
      expect(SESION_DE_MUESTRA.indexOf(trozo)).toBeLessThan(cierre);
    }
  });

  it('lo que la pluma escribe coincide con el acta que sirve el HTML', () => {
    const renglon = (cual: 'titulo' | 'recuento'): string =>
      deTipo('acta_chunk')
        .filter((trozo) => trozo.renglon === cual)
        .map((trozo) => trozo.texto)
        .join('');

    expect(renglon('titulo')).toBe('Acta — Subida de precio a 49 €');
    expect(renglon('recuento')).toBe('SÍ 2 · CONDICIONAL 1 · NO 1 — Recomendación: aprobar, escalonado');
  });
});

describe('los turnos', () => {
  /** Texto visible de cada turno, en el orden en que se abre. */
  const intervenciones: { quien: string; texto: string }[] = [];
  for (const evento of SESION_DE_MUESTRA) {
    if (evento.tipo === 'turno') intervenciones.push({ quien: evento.quien, texto: '' });
    else if (evento.tipo === 'chunk') {
      const vivo = intervenciones[intervenciones.length - 1];
      if (vivo) vivo.texto += evento.texto;
    }
  }

  it('ningún turno se queda mudo', () => {
    expect(intervenciones.filter((turno) => turno.texto.trim() === '')).toEqual([]);
  });

  it('ningún turno pasa de dos frases visibles (§4.1)', () => {
    const largos = intervenciones.filter(
      (turno) => (turno.texto.match(/[.!?…](\s|$)/g) ?? []).length > 2,
    );
    expect(largos).toEqual([]);
  });

  it('los cuatro directores intervienen, y Némesis sólo en su fase', () => {
    const quienes = new Set(intervenciones.map((turno) => turno.quien));
    for (const asiento of ASIENTOS) expect(quienes.has(asiento)).toBe(true);

    const diablo = SESION_DE_MUESTRA.findIndex(
      (evento) => evento.tipo === 'fase' && evento.fase === 'devil',
    );
    const sintesis = SESION_DE_MUESTRA.findIndex(
      (evento) => evento.tipo === 'fase' && evento.fase === 'synthesis',
    );
    const turnosDeNemesis = SESION_DE_MUESTRA.filter(
      (evento) => evento.tipo === 'turno' && evento.quien === 'nemesis',
    );

    expect(turnosDeNemesis).toHaveLength(1);
    for (const turno of turnosDeNemesis) {
      const posicion = SESION_DE_MUESTRA.indexOf(turno);
      expect(posicion).toBeGreaterThan(diablo);
      expect(posicion).toBeLessThan(sintesis);
    }
  });

  it('Némesis no vota: no tiene cartera (§2.S4)', () => {
    expect(deTipo('voto').map((voto) => String(voto.quien))).not.toContain('nemesis');
  });

  it('los tres últimos turnos son el fotograma final que sirve el HTML', () => {
    expect(intervenciones.slice(-3).map((turno) => turno.quien)).toEqual([
      'vortex',
      'nexus',
      'oberon',
    ]);
    expect(intervenciones[intervenciones.length - 1]?.texto).toBe(
      'Sí, escalonado: nuevos clientes en enero, cartera actual en abril con aviso de 60 días.',
    );
  });
});

describe('D3 — la demo es honesta', () => {
  it('no ejecuta ninguna herramienta durante la junta (PRODUCT.md:76-85)', () => {
    expect(deTipo('tool')).toEqual([]);
  });
});
