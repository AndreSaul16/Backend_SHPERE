/**
 * S3 · El procedimiento — DIRECCION.md §3.S3. EL set-piece de scroll.
 *
 * `lg+`  la sección se fija (`pin`, `end: "+=2600"`, `scrub: 0.6`), las cinco
 *        tarjetas de fase se turnan en el mismo sitio, el número grande rueda
 *        como odómetro y el cursor de latón recorre el rail vertical.
 * `<lg`  SIN pin — pinear en táctil castiga. Las cinco tarjetas apiladas con el
 *        reveal estándar y el rail horizontal pegado bajo el título, cuyo
 *        cursor avanza con el scrub del bloque entero. La información es la
 *        misma; sólo cambia la escenografía.
 *
 * EL APILADO SÓLO EXISTE CON MOTOR. La clase `procedimiento--fijado` es lo que
 * pone las tarjetas una encima de otra, y la pone este fichero: sin JavaScript
 * el bloque es una rejilla de cinco tarjetas legibles (D4). `gsap.matchMedia`
 * la retira sola al cruzar el breakpoint, así que girar el teléfono no deja
 * cuatro fases escondidas detrás de la primera.
 */

import { gsap, ScrollTrigger } from '../registro';
import { revelarPieza } from '../revelar';
import { DURACION, EASE_EXIT, EASE_SETTLE, REVELADO } from '../tokens';
import { rodarOdometro } from '../../piezas/odometro';

const ESCRITORIO = '(min-width: 64rem)';
const TACTIL = '(max-width: 63.999rem)';

/** Recorrido del pin, en píxeles de scroll (§3.S3). */
const RECORRIDO_DEL_PIN = 2600;

export function coreografiarProcedimiento(): void {
  const seccion = document.querySelector<HTMLElement>('#procedimiento');
  const escena = seccion?.querySelector<HTMLElement>('[data-procedimiento]');
  if (!seccion || !escena) return;

  const fases = [...escena.querySelectorAll<HTMLElement>('[data-fase]')];
  const muescas = [...escena.querySelectorAll<HTMLElement>('[data-muesca]')];
  const cursor = escena.querySelector<HTMLElement>('[data-rail-cursor]');
  const numero = escena.querySelector<HTMLElement>('[data-fase-numero] .odometro');
  const listaDeFases = escena.querySelector<HTMLElement>('[data-fases]');
  const cierres = [...seccion.querySelectorAll<HTMLElement>('[data-cierre-fases]')];
  if (fases.length === 0) return;

  /** Marca la fase viva en el rail y hace rodar el número. Sólo al cambiar. */
  function fabricarMarcador(): (indice: number) => void {
    let viva = -1;
    return (indice) => {
      if (indice === viva) return;
      viva = indice;
      muescas.forEach((muesca, posicion) => {
        muesca.dataset['activa'] = String(posicion === indice);
      });
      if (numero) rodarOdometro(numero, String(indice + 1));
    };
  }

  const mm = gsap.matchMedia();

  mm.add(ESCRITORIO, () => {
    escena.classList.add('procedimiento--fijado');
    // La sección entera pasa a ocupar el viewport y a centrar lo que lleva
    // dentro: mientras dura el pin, ESE es su alto. Va aquí y no en el CSS
    // suelto porque el pin lo pone este fichero — sin motor no hay pin, y sin
    // pin centrar en `100vh` dejaría una sección de una pantalla con tres
    // párrafos flotando en medio (D4).
    seccion.classList.add('seccion-fijada');

    const marcar = fabricarMarcador();
    const mover = cursor ? gsap.quickSetter(cursor, 'yPercent') : null;

    // Las cuatro fases que todavía no han entrado no se ven; la primera sí,
    // porque el pin arranca con ella en pantalla.
    gsap.set(fases.slice(1), { opacity: 0, y: 28, scale: 0.985 });

    const linea = gsap.timeline({
      scrollTrigger: {
        trigger: seccion,
        start: 'top top',
        end: `+=${String(RECORRIDO_DEL_PIN)}`,
        pin: true,
        scrub: 0.6,
        onUpdate: (self) => {
          mover?.(self.progress * (fases.length - 1) * 100);
          marcar(Math.min(fases.length - 1, Math.floor(self.progress * fases.length)));
        },
      },
    });

    fases.forEach((fase, indice) => {
      if (indice > 0) {
        linea.to(fase, { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: EASE_SETTLE }, indice);
      }
      if (indice < fases.length - 1) {
        linea.to(
          fase,
          {
            opacity: 0,
            y: -16,
            duration: 0.6,
            ease: EASE_EXIT,
            onStart: () => fase.classList.add('fase--despachada'),
            onReverseComplete: () => fase.classList.remove('fase--despachada'),
          },
          indice + 0.4,
        );
      }
    });

    // La nota de honestidad y el micro-cierre llegan tras la quinta fase y sin
    // salir del pin (§3.S3): son el epílogo del procedimiento, no dos párrafos
    // que se encuentran más abajo.
    if (cierres.length > 0) {
      linea.from(
        cierres,
        {
          opacity: 0,
          y: REVELADO.desplazamientoCuerpo,
          duration: 0.5,
          ease: EASE_SETTLE,
          stagger: 0.2,
        },
        fases.length - 0.4,
      );
    }

    return () => {
      escena.classList.remove('procedimiento--fijado');
      seccion.classList.remove('seccion-fijada');
      fases.forEach((fase) => fase.classList.remove('fase--despachada'));
      gsap.set(fases, { clearProps: 'opacity,transform' });
      gsap.set(cierres, { clearProps: 'opacity,transform' });
    };
  });

  mm.add(TACTIL, () => {
    const marcar = fabricarMarcador();
    const mover = cursor ? gsap.quickSetter(cursor, 'xPercent') : null;

    if (listaDeFases) revelarPieza(listaDeFases);

    // Sin pin, el epílogo entra como cuerpo de sección: mismo dato, otra
    // escenografía (§4.3 — cada breakpoint añade, no repara).
    for (const cierre of cierres) {
      gsap.from(cierre, {
        opacity: 0,
        y: REVELADO.desplazamientoCuerpo,
        duration: DURACION.panel,
        ease: EASE_SETTLE,
        scrollTrigger: { trigger: cierre, start: REVELADO.disparo, once: true },
      });
    }

    const vigilante = ScrollTrigger.create({
      trigger: escena,
      start: 'top 60%',
      end: 'bottom bottom',
      scrub: true,
      onUpdate: (self) => {
        mover?.(self.progress * (fases.length - 1) * 100);
        marcar(Math.min(fases.length - 1, Math.floor(self.progress * fases.length)));
      },
    });

    return () => {
      vigilante.kill();
    };
  });
}
