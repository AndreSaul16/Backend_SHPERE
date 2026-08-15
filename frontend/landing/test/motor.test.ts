/**
 * El despachador de la Sesión de Muestra — DIRECCION.md §3.S1.2.
 *
 * El motor es puro a propósito: no toca el DOM, recibe el reloj por parámetro y
 * llama a `aplicar`. Eso permite probar con un reloj de mentira lo único que de
 * verdad puede romperse aquí — que pausar y reanudar no pierdan ni repitan un
 * evento, y que reproducir de nuevo empiece de cero de verdad.
 */

import { describe, expect, it, vi } from 'vitest';
import { crearMotorDeSesion, type RelojDelMotor } from '../src/demo/motor';
import type { EventoDeSesion } from '../src/demo/sesionDeMuestra';

/** Un reloj que sólo avanza cuando el test lo dice. */
function relojDeMentira(): {
  reloj: RelojDelMotor;
  avanzar: (ms: number) => void;
  adelantarReloj: (ms: number) => void;
  fotogramasPendientes: () => number;
} {
  let instante = 0;
  let siguienteId = 1;
  const pendientes = new Map<number, () => void>();

  return {
    reloj: {
      ahora: () => instante,
      programar: (retrollamada) => {
        const id = siguienteId;
        siguienteId += 1;
        pendientes.set(id, retrollamada);
        return id;
      },
      cancelar: (id) => {
        pendientes.delete(id);
      },
    },
    avanzar: (ms) => {
      instante += ms;
      const listas = [...pendientes.values()];
      pendientes.clear();
      for (const retrollamada of listas) retrollamada();
    },
    /** Mueve el reloj SIN correr fotogramas: la pestaña de fondo, el `rAF`
        que el navegador no llama porque el hero se ha ido de la pantalla. */
    adelantarReloj: (ms) => {
      instante += ms;
    },
    fotogramasPendientes: () => pendientes.size,
  };
}

const LINEA: readonly EventoDeSesion[] = [
  { t: 0, tipo: 'fase', fase: 'opening' },
  { t: 100, tipo: 'turno', quien: 'oberon' },
  { t: 400, tipo: 'chunk', texto: 'uno' },
  { t: 1000, tipo: 'chunk', texto: 'dos' },
  { t: 2000, tipo: 'acta_cierre' },
];

function montar(velocidad = 2) {
  const { reloj, avanzar, adelantarReloj, fotogramasPendientes } = relojDeMentira();
  const aplicados: EventoDeSesion[] = [];
  const reiniciarEscena = vi.fn();
  const alTerminar = vi.fn();

  const motor = crearMotorDeSesion({
    linea: LINEA,
    velocidad,
    aplicar: (evento) => aplicados.push(evento),
    reiniciarEscena,
    alTerminar,
    reloj,
  });

  return {
    motor,
    avanzar,
    adelantarReloj,
    aplicados,
    reiniciarEscena,
    alTerminar,
    fotogramasPendientes,
  };
}

describe('despacho por timestamp', () => {
  it('no despacha nada antes de arrancar', () => {
    const { avanzar, aplicados } = montar();
    avanzar(1000);
    expect(aplicados).toEqual([]);
  });

  it('despacha todo lo vencido y nada de lo que aún no toca', () => {
    const { motor, avanzar, aplicados } = montar();
    motor.arrancar();

    // 60 ms de reloj a 2× son 120 ms de sesión: entran el 0 y el 100.
    avanzar(60);
    expect(aplicados.map((evento) => evento.t)).toEqual([0, 100]);

    // 150 ms más son 300 ms de sesión: 420 en total, así que entra el 400.
    avanzar(150);
    expect(aplicados.map((evento) => evento.t)).toEqual([0, 100, 400]);
  });

  it('respeta la velocidad: a 2× la sesión dura la mitad', () => {
    const { motor, avanzar, aplicados } = montar(1);
    motor.arrancar();
    avanzar(60);
    expect(aplicados.map((evento) => evento.t)).toEqual([0]);
  });

  it('llama a alTerminar una sola vez y suelta el fotograma', () => {
    const { motor, avanzar, alTerminar, fotogramasPendientes } = montar();
    motor.arrancar();
    avanzar(2000);

    expect(alTerminar).toHaveBeenCalledTimes(1);
    expect(motor.estado()).toBe('terminado');
    expect(fotogramasPendientes()).toBe(0);
  });
});

describe('pausa y reanudación', () => {
  it('el tiempo deja de correr con la demo pausada', () => {
    const { motor, avanzar, aplicados } = montar();
    motor.arrancar();
    avanzar(60);
    motor.pausar();

    avanzar(10_000);
    expect(aplicados.map((evento) => evento.t)).toEqual([0, 100]);
    expect(motor.estado()).toBe('pausado');
  });

  it('al reanudar continúa donde estaba, sin saltarse ni repetir eventos', () => {
    const { motor, avanzar, aplicados } = montar();
    motor.arrancar();
    avanzar(60);
    motor.pausar();
    avanzar(10_000);

    motor.arrancar();
    avanzar(150);
    expect(aplicados.map((evento) => evento.t)).toEqual([0, 100, 400]);

    avanzar(1000);
    expect(aplicados.map((evento) => evento.t)).toEqual([0, 100, 400, 1000, 2000]);
  });

  it('la pausa consume el tramo corrido desde el último fotograma', () => {
    const { motor, avanzar, adelantarReloj, aplicados } = montar();
    motor.arrancar();
    avanzar(60);
    expect(motor.transcurrido()).toBe(120);

    // 200 ms más de reloj sin que llegue a correr ningún fotograma. Ese tramo
    // ha pasado de verdad, así que al pausar sus eventos tienen que salir: si
    // se perdiera, al reanudar la sesión iría adelantada respecto a sí misma.
    adelantarReloj(200);
    motor.pausar();

    expect(motor.transcurrido()).toBe(520);
    expect(aplicados.map((evento) => evento.t)).toEqual([0, 100, 400]);
  });

  it('pausar dos veces no hace nada raro', () => {
    const { motor, avanzar } = montar();
    motor.arrancar();
    avanzar(60);
    motor.pausar();
    motor.pausar();
    expect(motor.estado()).toBe('pausado');
  });

  it('no reanuda una sesión ya terminada', () => {
    const { motor, avanzar, aplicados } = montar();
    motor.arrancar();
    avanzar(2000);

    motor.arrancar();
    avanzar(5000);
    expect(aplicados).toHaveLength(LINEA.length);
  });
});

describe('reproducir de nuevo', () => {
  it('rebobina la escena y vuelve a despachar desde el principio', () => {
    const { motor, avanzar, aplicados, reiniciarEscena } = montar();
    motor.arrancar();
    avanzar(2000);
    expect(aplicados).toHaveLength(LINEA.length);

    motor.reproducirDeNuevo();
    expect(reiniciarEscena).toHaveBeenCalledTimes(1);
    expect(motor.transcurrido()).toBe(0);
    expect(motor.despachados()).toBe(0);

    avanzar(60);
    expect(aplicados.map((evento) => evento.t)).toEqual([0, 100, 400, 1000, 2000, 0, 100]);
  });

  it('vuelve a terminar, y el botón se vuelve a ofrecer', () => {
    const { motor, avanzar, alTerminar } = montar();
    motor.arrancar();
    avanzar(2000);
    motor.reproducirDeNuevo();
    avanzar(2000);

    expect(alTerminar).toHaveBeenCalledTimes(2);
    expect(motor.estado()).toBe('terminado');
  });

  it('reproducir a mitad de sesión también rebobina', () => {
    const { motor, avanzar, aplicados, reiniciarEscena } = montar();
    motor.arrancar();
    avanzar(60);

    motor.reproducirDeNuevo();
    expect(reiniciarEscena).toHaveBeenCalledTimes(1);

    avanzar(60);
    expect(aplicados.map((evento) => evento.t)).toEqual([0, 100, 0, 100]);
  });
});

describe('destruir', () => {
  it('suelta el fotograma pendiente y deja de despachar', () => {
    const { motor, avanzar, aplicados, fotogramasPendientes } = montar();
    motor.arrancar();
    avanzar(60);

    motor.destruir();
    expect(fotogramasPendientes()).toBe(0);

    avanzar(10_000);
    expect(aplicados.map((evento) => evento.t)).toEqual([0, 100]);
  });
});
