/**
 * La escena de la Sesión de Muestra — DIRECCION.md §3.S1.2 / DESIGN.md §8.6.
 *
 * Traduce cada evento de la línea de tiempo a un cambio en el DOM. El motor no
 * sabe nada de esto y esto no sabe nada del reloj: por eso el mismo aplicador
 * sirve para la reproducción a 2× y para el despacho por corte de
 * `prefers-reduced-motion`.
 *
 * DOS MODOS, UNA SOLA VERDAD. `animado` mueve las piezas con GSAP; `corte` las
 * COLOCA sin tocar GSAP ni una vez. La información que queda en pantalla al
 * final es idéntica en los dos — que es exactamente lo que §7.6 contrata: con
 * movimiento reducido no se pierde información, sólo el tiempo.
 *
 * EL FOTOGRAMA FINAL ES EL HTML SERVIDO. El marcado de `index.html` ya está en
 * el estado en que la sesión termina, porque sin JavaScript eso es lo que hay
 * que enseñar (D4). Reproducir consiste, literalmente, en rebobinar y volver a
 * llegar al mismo sitio; si algún día los dos dejasen de coincidir, el visitante
 * vería una demo que acaba en un sitio distinto del que muestra la página.
 */

import type { EventoDeSesion, Fase, Interviniente, Sentido } from './sesionDeMuestra';
import { INTERVINIENTES, ROTULO_DE_FASE } from './sesionDeMuestra';
import { fijarAguja, posarAguja, reiniciarAguja } from '../piezas/aguja';
import { fijarOdometro, rodarOdometro } from '../piezas/odometro';
import { apagarFilamentos, encenderFilamento } from '../piezas/filamento';
import { avanzarPluma, completarPluma, reiniciarPluma } from '../piezas/pluma';
import { aterrizarSello, fijarSello, levantarSello } from '../piezas/sello';

export type ModoDeEscena = 'animado' | 'corte';

/** Cuántos turnos se ven a la vez en el mini-transcript del hero (§8.6). */
export const TURNOS_A_LA_VISTA = 3;

/**
 * El sentido del voto tal y como cabe en un asiento del Palco.
 *
 * Con los cuatro asientos en banda, cada columna mide 73px en 390: «SÍ · 74»
 * ocupa 41 y «NO · 71» 48, pero «CONDICIONAL · 66» se va a 92 y desborda sobre
 * el asiento vecino. La abreviatura no es un invento de este fichero: §5.5 la
 * usa por lo mismo —falta de sitio— al componer el recuento de la tarjeta
 * social («SÍ 2 · COND 1 · NO 1»).
 *
 * Y se abrevia AQUÍ y sólo aquí. La palabra entera sigue entera donde hay sitio
 * para leerla: en el acta de la demo, en el recuento de S5 y en el cuerpo de
 * §2.S5. Esto es presentación de una miniatura, no una edición del copy.
 */
const SENTIDO_EN_EL_PALCO: Readonly<Record<Sentido, string>> = {
  SÍ: 'SÍ',
  NO: 'NO',
  CONDICIONAL: 'COND',
};

export interface Escena {
  readonly reiniciar: () => void;
  readonly aplicar: (evento: EventoDeSesion) => void;
  readonly terminar: () => void;
}

interface Asiento {
  readonly aguja: Element;
  readonly voto: HTMLElement | null;
  readonly filamento: HTMLElement | null;
}

function asientosDe(raiz: HTMLElement): Map<string, Asiento> {
  const asientos = new Map<string, Asiento>();
  raiz.querySelectorAll<HTMLElement>('[data-asiento]').forEach((elemento) => {
    const nombre = elemento.dataset['asiento'];
    const aguja = elemento.querySelector('[data-demo-aguja]');
    if (!nombre || !aguja) return;
    asientos.set(nombre, {
      aguja,
      voto: elemento.querySelector<HTMLElement>('[data-demo-voto]'),
      filamento: elemento.querySelector<HTMLElement>('[data-demo-filamento]'),
    });
  });
  return asientos;
}

export function crearEscena(raiz: HTMLElement, modo: ModoDeEscena): Escena {
  const asientos = asientosDe(raiz);
  const filamentos = [...asientos.values()]
    .map((asiento) => asiento.filamento)
    .filter((filamento): filamento is HTMLElement => filamento !== null);

  const rotuloDeFase = raiz.querySelector<HTMLElement>('[data-demo-fase]');
  const turnos = raiz.querySelector<HTMLElement>('[data-demo-turnos]');
  const cursor = raiz.querySelector<HTMLElement>('[data-demo-cursor]');
  const pluma = raiz.querySelector<HTMLElement>('[data-demo-pluma]');
  const sello = raiz.querySelector('[data-demo-sello]');
  const actaTitulo = raiz.querySelector<HTMLElement>('[data-demo-acta-titulo]');
  const actaRecuento = raiz.querySelector<HTMLElement>('[data-demo-acta-recuento]');
  // Los odómetros del recuento se llaman `data-cifra` —el MISMO nombre que en
  // S5, porque son la misma pieza— y aquí se buscan acotados a la raíz de la
  // demo. Buscarlos por un nombre que el HTML no escribe («data-demo-cifra»)
  // devolvía un mapa vacío en silencio: ni `reiniciar` los ponía a cero ni el
  // evento `recuento` los hacía rodar, así que la fila conservaba el 2·1·1 del
  // fotograma final durante APERTURA y RÉPLICAS y destripaba el final.
  const cifras = new Map<string, HTMLElement>(
    [...raiz.querySelectorAll<HTMLElement>('[data-cifra]')].map((cifra) => [
      cifra.dataset['cifra'] ?? '',
      cifra,
    ]),
  );

  /** Estado de la reproducción; se rehace entero en cada `reiniciar`. */
  let quienHabla: Interviniente | null = null;
  let cuerpoVivo: HTMLElement | null = null;
  let trozosDelTurno = 0;
  let trozosDelActa = 0;

  const rodar = modo === 'animado' ? rodarOdometro : fijarOdometro;

  function ponerCifra(clave: string, valor: number): void {
    const cifra = cifras.get(clave);
    if (cifra) rodar(cifra, String(valor));
  }

  function ponerFase(fase: Fase): void {
    if (rotuloDeFase) rotuloDeFase.textContent = ROTULO_DE_FASE[fase];
  }

  /**
   * La ventana de turnos apila desde arriba, así que el turno vivo se va al
   * fondo en cuanto hay más de los que caben. Esto lo persigue, como persigue
   * una consola su última línea. Es una escritura de propiedad, no un scroll
   * animado: ni suaviza, ni programa nada, ni cuenta para el presupuesto de
   * §3.P — y con `overflow: hidden` el visitante no puede desplazarla a mano,
   * así que no hay ninguna intención suya que atropellar.
   */
  function perseguirElTurnoVivo(): void {
    if (turnos) turnos.scrollTop = turnos.scrollHeight;
  }

  function abrirTurno(quien: Interviniente): void {
    if (!turnos) return;
    const ficha = INTERVINIENTES[quien];

    const entrada = document.createElement('li');
    entrada.className = `identidad ${ficha.clase}`;

    const nombre = document.createElement('p');
    nombre.className = 'identidad__nombre';
    nombre.textContent = `${ficha.nombre} · ${ficha.cartera}`;

    const cuerpo = document.createElement('p');
    cuerpo.className = 'identidad__cuerpo';
    if (quien === 'nemesis') cuerpo.classList.add('font-serif', 'italic');

    entrada.append(nombre, cuerpo);
    turnos.append(entrada);

    // La ventana de turnos tiene alto fijo y está anclada abajo: los viejos
    // salen por arriba sin mover ni un píxel de lo que hay debajo (CLS < 0.1).
    while (turnos.children.length > TURNOS_A_LA_VISTA) turnos.firstElementChild?.remove();

    quienHabla = quien;
    cuerpoVivo = cuerpo;
    trozosDelTurno = 0;

    if (cursor && modo === 'animado') {
      cursor.hidden = false;
      cuerpo.append(cursor);
    }

    perseguirElTurnoVivo();
  }

  function escribirTrozo(texto: string): void {
    if (!cuerpoVivo) return;
    const nodo = document.createTextNode(texto);
    if (cursor && cursor.parentElement === cuerpoVivo) cuerpoVivo.insertBefore(nodo, cursor);
    else cuerpoVivo.append(nodo);

    trozosDelTurno += 1;
    const asiento = quienHabla ? asientos.get(quienHabla) : undefined;
    encenderFilamento(filamentos, asiento?.filamento ?? null, trozosDelTurno);

    // Cada trozo puede añadir un renglón, y el renglón nuevo es el que hay que
    // ver: sin esto el texto crecería por debajo del canto de la ventana.
    perseguirElTurnoVivo();
  }

  function anotarVoto(quien: string, sentido: Sentido, confianza: number): void {
    const asiento = asientos.get(quien);
    if (!asiento) return;

    if (modo === 'animado') posarAguja(asiento.aguja, confianza);
    else fijarAguja(asiento.aguja, confianza);

    if (asiento.voto) {
      asiento.voto.textContent = `${SENTIDO_EN_EL_PALCO[sentido]} · ${String(confianza)}`;
    }
    // Emitido el voto, el filamento se retira: la aguja toma el relevo (§8.11).
    if (asiento.filamento) {
      asiento.filamento.hidden = true;
      asiento.filamento.style.transform = 'scaleX(0)';
    }
  }

  function escribirActa(renglon: 'titulo' | 'recuento', texto: string): void {
    const destino = renglon === 'titulo' ? actaTitulo : actaRecuento;
    if (destino) destino.append(document.createTextNode(texto));
    trozosDelActa += 1;
    if (pluma) avanzarPluma(pluma, trozosDelActa);
  }

  function cerrarActa(): void {
    if (pluma) completarPluma(pluma);
    if (!sello) return;
    if (modo === 'animado') aterrizarSello(sello);
    else fijarSello(sello);
  }

  function reiniciar(): void {
    quienHabla = null;
    cuerpoVivo = null;
    trozosDelTurno = 0;
    trozosDelActa = 0;

    if (cursor) {
      cursor.hidden = true;
      raiz.append(cursor);
    }

    ponerFase('opening');
    if (turnos) {
      turnos.replaceChildren();
      turnos.scrollTop = 0;
    }
    if (actaTitulo) actaTitulo.textContent = '';
    if (actaRecuento) actaRecuento.textContent = '';
    if (pluma) reiniciarPluma(pluma);
    if (sello) levantarSello(sello);

    apagarFilamentos(filamentos);
    // El recuento vuelve a 0·0·0 SIN rodillo, incluso en modo animado: rebobinar
    // no es un dato que cambie, es el telón bajando. Las cifras sólo ruedan
    // hacia adelante, cuando la mesa acaba de votar y llega el evento
    // `recuento`; un rodillo al reiniciar anunciaría un cambio que no ha
    // ocurrido y —peor— adelantaría el desenlace antes de la primera fase.
    for (const cifra of cifras.values()) fijarOdometro(cifra, '0');
    for (const asiento of asientos.values()) {
      if (modo === 'animado') reiniciarAguja(asiento.aguja);
      else fijarAguja(asiento.aguja, 0);
      if (asiento.voto) asiento.voto.textContent = '';
    }
  }

  function terminar(): void {
    // El cursor de streaming es EL bucle nº1 del presupuesto (§3.P) y muere
    // aquí: fuera del DOM del turno y oculto, no queda ninguna animación viva.
    if (cursor) {
      cursor.hidden = true;
      raiz.append(cursor);
    }
    apagarFilamentos(filamentos);
  }

  function aplicar(evento: EventoDeSesion): void {
    switch (evento.tipo) {
      case 'fase':
        ponerFase(evento.fase);
        break;
      case 'turno':
        abrirTurno(evento.quien);
        break;
      case 'chunk':
        escribirTrozo(evento.texto);
        break;
      case 'voto':
        anotarVoto(evento.quien, evento.sentido, evento.confianza);
        break;
      case 'recuento':
        ponerCifra('si', evento.si);
        ponerCifra('condicional', evento.condicional);
        ponerCifra('no', evento.no);
        break;
      case 'acta_chunk':
        escribirActa(evento.renglon, evento.texto);
        break;
      case 'acta_cierre':
        cerrarActa();
        break;
      case 'tool':
        // La línea de tiempo no trae ninguno y no debe traerlo: en la junta no
        // se ejecuta ninguna herramienta (PRODUCT.md:76-85). El caso existe
        // para que el día que alguien añada uno el compilador lo traiga aquí.
        break;
    }
  }

  return { reiniciar, aplicar, terminar };
}
