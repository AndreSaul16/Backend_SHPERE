/**
 * El despachador de la Sesión de Muestra — DIRECCION.md §3.S1.2 / DESIGN.md §8.6.
 *
 * Un reloj y un índice. En cada fotograma suma el tiempo transcurrido (×2, la
 * velocidad de §8.6) y despacha todos los eventos cuyo `t` ya ha quedado atrás.
 * No sabe nada del DOM: recibe `aplicar` y lo llama. Eso es lo que permite
 * probarlo entero con un reloj falso, que es donde de verdad se defiende que
 * pausar y reanudar no pierden ni repiten un evento.
 *
 * POR QUÉ UN SOLO rAF. Es el único bucle de fotogramas de la página: las piezas
 * (odómetro, pluma, filamento) no montan temporizadores propios ni relojes
 * propios — se les dice qué pintar y lo pintan. El presupuesto de §3.P cuenta
 * bucles, y aquí hay uno, vive mientras la sesión se reproduce y muere con ella.
 *
 * EL MOTOR ES EL MISMO CON MOVIMIENTO REDUCIDO. §8.14 pide que el botón
 * «Reproducir» despache los estados POR CORTE, no que los despache todos de
 * golpe: la sesión sigue ocurriendo en el tiempo —si no, pulsar el botón no
 * enseñaría nada— y lo que desaparece son las interpolaciones. De eso se ocupa
 * la escena, que en modo `corte` coloca en vez de animar. Aquí no hay ni un
 * tween que crear, así que este fichero vale igual para los dos casos.
 */

import type { EventoDeSesion } from './sesionDeMuestra';

/**
 * El reloj y el planificador de fotogramas, inyectables. En el navegador son
 * `performance.now` y `requestAnimationFrame`; en los tests, un reloj de
 * mentira que avanza cuando el test lo dice.
 */
export interface RelojDelMotor {
  readonly ahora: () => number;
  readonly programar: (retrollamada: () => void) => number;
  readonly cancelar: (identificador: number) => void;
}

export interface OpcionesDelMotor {
  readonly linea: readonly EventoDeSesion[];
  /** Multiplicador sobre el reloj de la sesión (§8.6: 2×). */
  readonly velocidad: number;
  /** Qué hacer con cada evento despachado. */
  readonly aplicar: (evento: EventoDeSesion) => void;
  /** Devolver la escena a su estado inicial antes de volver a empezar. */
  readonly reiniciarEscena: () => void;
  /** La sesión ha terminado: toca enseñar el botón de reproducir. */
  readonly alTerminar: () => void;
  readonly reloj?: RelojDelMotor;
}

export type EstadoDelMotor = 'en_espera' | 'reproduciendo' | 'pausado' | 'terminado';

export interface MotorDeSesion {
  /** Empieza —o continúa— a reproducir por reloj. */
  arrancar: () => void;
  /** Detiene el reloj sin perder el punto. Fuera del viewport. */
  pausar: () => void;
  /** Vuelve al principio y reproduce desde cero. */
  reproducirDeNuevo: () => void;
  /** Suelta el fotograma pendiente. */
  destruir: () => void;
  readonly estado: () => EstadoDelMotor;
  /** Milisegundos de sesión ya consumidos. Sólo para los tests y la depuración. */
  readonly transcurrido: () => number;
  /** Cuántos eventos se han despachado ya. */
  readonly despachados: () => number;
}

const RELOJ_DEL_NAVEGADOR: RelojDelMotor = {
  ahora: () => performance.now(),
  programar: (retrollamada) => requestAnimationFrame(() => {
    retrollamada();
  }),
  cancelar: (identificador) => {
    cancelAnimationFrame(identificador);
  },
};

export function crearMotorDeSesion(opciones: OpcionesDelMotor): MotorDeSesion {
  const reloj = opciones.reloj ?? RELOJ_DEL_NAVEGADOR;

  let indice = 0;
  let transcurrido = 0;
  let ultimoTic = 0;
  let fotograma: number | null = null;
  let estado: EstadoDelMotor = 'en_espera';

  /** Despacha en orden todo lo que ya ha vencido. Nunca salta hacia atrás. */
  function despacharHasta(instante: number): void {
    while (indice < opciones.linea.length) {
      const evento = opciones.linea[indice];
      if (!evento || evento.t > instante) break;
      indice += 1;
      opciones.aplicar(evento);
    }
  }

  function terminar(): void {
    soltarFotograma();
    estado = 'terminado';
    opciones.alTerminar();
  }

  function soltarFotograma(): void {
    if (fotograma === null) return;
    reloj.cancelar(fotograma);
    fotograma = null;
  }

  function tic(): void {
    fotograma = null;
    if (estado !== 'reproduciendo') return;

    const instante = reloj.ahora();
    transcurrido += (instante - ultimoTic) * opciones.velocidad;
    ultimoTic = instante;

    despacharHasta(transcurrido);

    if (indice >= opciones.linea.length) {
      terminar();
      return;
    }
    pedirFotograma();
  }

  function pedirFotograma(): void {
    if (fotograma !== null) return;
    fotograma = reloj.programar(tic);
  }

  function arrancar(): void {
    if (estado === 'reproduciendo' || estado === 'terminado') return;
    if (opciones.linea.length === 0) {
      terminar();
      return;
    }
    estado = 'reproduciendo';
    ultimoTic = reloj.ahora();
    pedirFotograma();
  }

  function pausar(): void {
    if (estado !== 'reproduciendo') return;
    // Consumir el tiempo transcurrido ANTES de soltar el reloj: si no, el
    // trozo de sesión entre el último fotograma y la pausa se perdería y la
    // reanudación adelantaría los eventos que ya deberían haber salido.
    const instante = reloj.ahora();
    transcurrido += (instante - ultimoTic) * opciones.velocidad;
    ultimoTic = instante;
    despacharHasta(transcurrido);

    soltarFotograma();
    estado = indice >= opciones.linea.length ? 'terminado' : 'pausado';
    if (estado === 'terminado') opciones.alTerminar();
  }

  function reproducirDeNuevo(): void {
    soltarFotograma();
    indice = 0;
    transcurrido = 0;
    estado = 'en_espera';
    opciones.reiniciarEscena();
    arrancar();
  }

  return {
    arrancar,
    pausar,
    reproducirDeNuevo,
    destruir: () => {
      soltarFotograma();
      estado = 'en_espera';
    },
    estado: () => estado,
    transcurrido: () => transcurrido,
    despachados: () => indice,
  };
}
