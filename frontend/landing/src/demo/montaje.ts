/**
 * Montaje de la Sesión de Muestra — DIRECCION.md §3.S1.2 / §8.14.
 *
 * Aquí se juntan las tres piezas que ya existen por separado: la línea de
 * tiempo (datos), el motor (reloj) y la escena (DOM). Este fichero sólo decide
 * CUÁNDO corre.
 *
 * CUÁNDO ARRANCA: cuando la entrada del hero ha terminado **y** el hero está en
 * el viewport, lo que llegue más tarde. Las dos condiciones importan: arrancar
 * antes de que acabe la entrada pondría dos coreografías a competir en el
 * primer segundo de la página, y arrancar con el hero fuera de pantalla
 * gastaría la demo delante de nadie.
 *
 * CÓMO SE MIRA SI ES VISIBLE: con un `ScrollTrigger` y su `onToggle`. §8.6
 * sugería la API nativa de intersección, pero el checklist mecánico §8.6 —el
 * otro §8.6, el del contrato— hace grep de su nombre sobre `src/` para
 * defender que no entra ningún plugin de scroll prohibido, y una coincidencia
 * es una coincidencia. Además ScrollTrigger ya está montado y refrescado en
 * esta página: usarlo es una fuente de verdad menos.
 */

import { ScrollTrigger } from '../motion/registro';
import { crearEscena } from './escena';
import { crearMotorDeSesion } from './motor';
import { SESION_DE_MUESTRA, VELOCIDAD } from './sesionDeMuestra';

/** El botón sólo se anuncia cuando hay algo que reproducir. */
function revelarBoton(boton: HTMLButtonElement, etiqueta?: string): void {
  if (etiqueta !== undefined) boton.textContent = etiqueta;
  boton.hidden = false;
}

interface PartesDelMontaje {
  readonly raiz: HTMLElement;
  readonly boton: HTMLButtonElement | null;
}

function partes(): PartesDelMontaje | null {
  const raiz = document.querySelector<HTMLElement>('[data-demo]');
  if (!raiz) return null;
  return { raiz, boton: raiz.querySelector<HTMLButtonElement>('[data-demo-reproducir]') };
}

/**
 * Reproducción normal: la escena se anima y el motor la lleva a 2×.
 * `entradaLista` se resuelve cuando la timeline de entrada del hero termina.
 */
export function montarSesionDeMuestra(entradaLista: Promise<void>): void {
  const piezas = partes();
  if (!piezas) return;
  const { raiz, boton } = piezas;

  const escena = crearEscena(raiz, 'animado');
  let entradaTerminada = false;
  let visible = false;
  let rebobinada = false;

  const motor = crearMotorDeSesion({
    linea: SESION_DE_MUESTRA,
    velocidad: VELOCIDAD,
    aplicar: escena.aplicar,
    reiniciarEscena: escena.reiniciar,
    alTerminar: () => {
      escena.terminar();
      if (boton) revelarBoton(boton);
    },
  });

  function sincronizar(): void {
    if (motor.estado() === 'terminado') return;
    if (!entradaTerminada || !visible) {
      motor.pausar();
      return;
    }
    if (!rebobinada) {
      // Rebobinar es lo primero que ve el visitante de la demo: el HTML
      // servido es el fotograma final, así que la sesión empieza vaciándolo.
      escena.reiniciar();
      rebobinada = true;
    }
    motor.arrancar();
  }

  const vigilante = ScrollTrigger.create({
    trigger: raiz,
    start: 'top bottom',
    end: 'bottom top',
    onToggle: (self) => {
      visible = self.isActive;
      sincronizar();
    },
  });
  visible = vigilante.isActive;

  boton?.addEventListener('click', () => {
    boton.hidden = true;
    motor.reproducirDeNuevo();
  });

  void entradaLista.then(() => {
    entradaTerminada = true;
    sincronizar();
  });
}

/**
 * `prefers-reduced-motion` (§8.14). No se autorreproduce: el fotograma final ya
 * está en pantalla y el botón —visible y enfocable desde el primer momento—
 * ofrece verla ocurrir. La escena va en modo `corte`, así que no se crea ni un
 * tween: los estados se colocan, no se interpolan.
 *
 * Por este camino no se EJECUTA ni una línea de GSAP —la escena en modo `corte`
 * escribe atributos y estilos— aunque el módulo siga estando en el paquete: el
 * resto de la página lo carga igualmente. Lo que §3.0 contrata es que no se
 * cree ningún tween, y eso es exactamente lo que un test comprueba espiando
 * `gsap.to` / `gsap.from` / `gsap.timeline`.
 */
export function montarSesionDeMuestraReducida(): void {
  const piezas = partes();
  if (!piezas?.boton) return;
  const { raiz, boton } = piezas;

  const escena = crearEscena(raiz, 'corte');
  const motor = crearMotorDeSesion({
    linea: SESION_DE_MUESTRA,
    velocidad: VELOCIDAD,
    aplicar: escena.aplicar,
    reiniciarEscena: escena.reiniciar,
    alTerminar: () => {
      escena.terminar();
      revelarBoton(boton);
    },
  });

  revelarBoton(boton, 'Reproducir');

  boton.addEventListener('click', () => {
    boton.hidden = true;
    motor.reproducirDeNuevo();
  });
}
