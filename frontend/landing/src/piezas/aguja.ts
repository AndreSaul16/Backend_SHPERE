/**
 * La Aguja de Confianza — DESIGN.md §8.2 / DIRECCION.md §4.2.
 *
 * Un voto no es un chip: es una medida. Arco graduado de 0 a 100, aguja que
 * SOBREPASA una vez y se posa (`back.out(1.6)` / 0.7 s), y pasado el 70 el arco
 * se tiñe de oxblood — a favor o en contra, porque la certeza alta es la
 * información que más importa (P2).
 *
 * TRES DECISIONES QUE NO SE REABREN:
 *
 * 1. EL COLOR VA POR CLASE, NUNCA POR TWEEN. Interpolar de latón a oxblood
 *    pintaría una gama de marrones que no significa nada, y §7.3 lo prohíbe por
 *    escrito: los muelles son para lo espacial. La clase entra en el mismo
 *    fotograma en que se conoce el valor; lo que se mueve es la aguja. Vale
 *    igual para 74, 88 y 71 — los tres cruzan el 70 en esta página.
 * 2. EL ARCO DE CERTEZA ES EL MISMO TRAZADO QUE EL ARCO BASE, recortado con
 *    `stroke-dasharray`. Así el valor puede animarse (`strokeDashoffset` es una
 *    de las propiedades permitidas de §3.0) en vez de saltar entre trazados
 *    distintos, y el fotograma sin JavaScript se escribe con un atributo.
 * 3. HAY DOS CAMINOS Y NO SE MEZCLAN. Con movimiento reducido manda
 *    `fijarAguja`, que escribe ATRIBUTOS y no toca GSAP ni una vez. Con
 *    movimiento normal manda GSAP, que escribe estilo en línea. El modo se
 *    decide una sola vez, al arrancar, así que ninguna aguja ve los dos.
 */

import { gsap } from '../motion/registro';
import { FISICA_AGUJA } from '../motion/tokens';

/** El arco es media circunferencia de radio 16: `M4 22A16 16 0 0 1 36 22`. */
export const RADIO_DEL_ARCO = 16;
export const LONGITUD_DEL_ARCO = Math.PI * RADIO_DEL_ARCO;

/** El pivote de la aguja, en unidades del `viewBox` de 40×24. */
export const PIVOTE = { x: 20, y: 22 } as const;

/** Pasado el 70 la certeza se subraya en oxblood (§8.2, P2). */
export const UMBRAL_DE_CERTEZA = 70;

/** Recorte del arco: 0 → todo oculto, 100 → todo pintado. */
export function desfaseDelArco(valor: number): number {
  const acotado = Math.min(100, Math.max(0, valor));
  return LONGITUD_DEL_ARCO * (1 - acotado / 100);
}

/**
 * Giro de la aguja en grados. La aguja se dibuja apuntando a la izquierda (el
 * 0 de la escala) y gira en sentido horario: 100 son 180°.
 */
export function giroDeAguja(valor: number): number {
  const acotado = Math.min(100, Math.max(0, valor));
  return acotado * 1.8;
}

export function esCertezaAlta(valor: number): boolean {
  return valor > UMBRAL_DE_CERTEZA;
}

const ORIGEN_SVG = `${String(PIVOTE.x)} ${String(PIVOTE.y)}`;

function certezaDe(aguja: Element): SVGPathElement | null {
  return aguja.querySelector<SVGPathElement>('.aguja__certeza');
}

function puntaDe(aguja: Element): SVGLineElement | null {
  return aguja.querySelector<SVGLineElement>('.aguja__punta');
}

/** Lo que la aguja dice sin moverse: el color del arco y el valor accesible. */
function marcarValor(aguja: Element, valor: number): void {
  aguja.classList.toggle('aguja--certeza-alta', esCertezaAlta(valor));
  if (aguja.getAttribute('role') === 'meter') {
    aguja.setAttribute('aria-valuenow', String(Math.round(valor)));
  }
}

/**
 * El valor que la aguja declara en el HTML servido. Es la fuente de verdad del
 * fotograma sin JavaScript, así que también lo es del barrido: la coreografía
 * no repite las cifras que ya están en el marcado.
 */
export function valorDeclarado(aguja: Element): number {
  return Number(aguja.getAttribute('aria-valuenow') ?? '0');
}

/**
 * Coloca la aguja SIN animarla, escribiendo atributos. Es el camino de
 * `prefers-reduced-motion`: cero GSAP, cero interpolación, misma información.
 */
export function fijarAguja(aguja: Element, valor: number): void {
  marcarValor(aguja, valor);

  const certeza = certezaDe(aguja);
  if (certeza) {
    certeza.setAttribute('stroke-dasharray', LONGITUD_DEL_ARCO.toFixed(3));
    certeza.setAttribute('stroke-dashoffset', desfaseDelArco(valor).toFixed(3));
  }

  const punta = puntaDe(aguja);
  if (punta) {
    punta.setAttribute(
      'transform',
      `rotate(${giroDeAguja(valor).toFixed(2)} ${String(PIVOTE.x)} ${String(PIVOTE.y)})`,
    );
  }
}

/** Devuelve la aguja al cero para volver a posarla. Coloca, no anima. */
export function reiniciarAguja(aguja: Element): void {
  aguja.classList.remove('aguja--certeza-alta');
  if (aguja.getAttribute('role') === 'meter') aguja.setAttribute('aria-valuenow', '0');

  const certeza = certezaDe(aguja);
  if (certeza) {
    certeza.setAttribute('stroke-dasharray', LONGITUD_DEL_ARCO.toFixed(3));
    gsap.set(certeza, { strokeDashoffset: LONGITUD_DEL_ARCO });
  }

  const punta = puntaDe(aguja);
  if (punta) gsap.set(punta, { rotation: 0, svgOrigin: ORIGEN_SVG });
}

/**
 * La posa: sobrepasa una vez y se asienta. `retardo` es lo que escalona a las
 * cuatro agujas de S5 sin inventar cuatro llamadas distintas.
 */
export function posarAguja(aguja: Element, valor: number, retardo = 0): void {
  marcarValor(aguja, valor);

  const certeza = certezaDe(aguja);
  if (certeza) {
    certeza.setAttribute('stroke-dasharray', LONGITUD_DEL_ARCO.toFixed(3));
    gsap.to(certeza, {
      strokeDashoffset: desfaseDelArco(valor),
      duration: FISICA_AGUJA.duration,
      ease: FISICA_AGUJA.ease,
      delay: retardo,
      overwrite: 'auto',
    });
  }

  const punta = puntaDe(aguja);
  if (punta) {
    gsap.to(punta, {
      rotation: giroDeAguja(valor),
      svgOrigin: ORIGEN_SVG,
      duration: FISICA_AGUJA.duration,
      ease: FISICA_AGUJA.ease,
      delay: retardo,
      overwrite: 'auto',
    });
  }
}

/**
 * El barrido de presentación de varias agujas (§3.S4 y §3.S5): todas parten de
 * cero y llegan a su valor escalonadas. Una sola llamada de GSAP por canal —
 * el presupuesto de §3.P cuenta muelles simultáneos y el escalonado es lo que
 * los separa.
 */
export function barrerAgujas(agujas: readonly Element[], escalonado: number): void {
  const certezas: SVGPathElement[] = [];
  const puntas: SVGLineElement[] = [];
  const valores: number[] = [];

  for (const aguja of agujas) {
    const certeza = certezaDe(aguja);
    const punta = puntaDe(aguja);
    if (!certeza || !punta) continue;

    const valor = valorDeclarado(aguja);
    reiniciarAguja(aguja);
    // El color entra ya: es el canal que no depende del movimiento (P5).
    marcarValor(aguja, valor);

    valores.push(valor);
    certezas.push(certeza);
    puntas.push(punta);
  }

  if (puntas.length === 0) return;

  gsap.to(certezas, {
    strokeDashoffset: (indice: number) => desfaseDelArco(valores[indice] ?? 0),
    duration: FISICA_AGUJA.duration,
    ease: FISICA_AGUJA.ease,
    stagger: escalonado,
  });
  gsap.to(puntas, {
    rotation: (indice: number) => giroDeAguja(valores[indice] ?? 0),
    svgOrigin: ORIGEN_SVG,
    duration: FISICA_AGUJA.duration,
    ease: FISICA_AGUJA.ease,
    stagger: escalonado,
  });
}
