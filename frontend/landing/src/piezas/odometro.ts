/**
 * Las Cifras que Asientan — DESIGN.md §8.12 / DIRECCION.md §4.2.
 *
 * Una cifra que importa no se repinta: RUEDA. El dígito saliente sube, el
 * entrante llega desde abajo, y el cambio queda subrayado un instante por un
 * filete de latón que se desvanece.
 *
 * CERO TEMPORIZADORES. Ni `setTimeout`, ni `setInterval`, ni un `rAF` propio.
 * El rodillo es una animación CSS de UNA iteración, y la única forma barata de
 * relanzar una animación CSS sin tocar un reloj es remontar el elemento: por
 * eso cada cambio sustituye el dígito por uno nuevo. El único bucle de
 * fotogramas de la página es el despachador de la demo, y no pasa por aquí. Un
 * contador que corriese solo estaría inventando movimiento donde no ha pasado
 * nada, y §7.4 lo rechaza por nombre.
 *
 * LO QUE HAY EN EL DOM, y por qué está así:
 *
 *   <span class="odometro">
 *     <span class="odometro__digito" data-saliente="1">   ← la máscara de 1em
 *       <span class="odometro__rodillo">2</span>          ← el texto REAL
 *     </span>
 *     <span class="odometro__subrayado"></span>           ← el filete remontable
 *   </span>
 *
 * El dígito saliente NO es un nodo de texto: lo pinta un pseudo-elemento con
 * `attr(data-saliente)`. Si fuese texto, durante los 160 ms del rodillo el
 * contenido del odómetro sería la MEZCLA de las dos cifras —9 → 10 se leería
 * «190»— y eso lo anuncia un lector de pantalla y lo encuentra la búsqueda de
 * la página. El texto del componente es siempre y sólo la cifra vigente.
 *
 * Y por eso `data-rodando` se retira en `animationend`: si se quedase puesto,
 * el contenido generado seguiría existiendo para siempre aunque la máscara lo
 * tape. Quitarlo con un evento no es un temporizador — es el final real de la
 * animación diciendo que ya no hace falta.
 */

const CLASE_DIGITO = 'odometro__digito';
const CLASE_RODILLO = 'odometro__rodillo';
const CLASE_SUBRAYADO = 'odometro__subrayado';

function digitosDe(odometro: HTMLElement): HTMLElement[] {
  return Array.from(odometro.querySelectorAll<HTMLElement>(`.${CLASE_DIGITO}`));
}

function textoDe(digito: HTMLElement): string {
  return digito.querySelector<HTMLElement>(`.${CLASE_RODILLO}`)?.textContent ?? '';
}

function crearDigito(entrante: string, saliente: string): HTMLElement {
  const digito = document.createElement('span');
  digito.className = CLASE_DIGITO;
  digito.dataset['saliente'] = saliente;
  digito.dataset['rodando'] = '';

  const rodillo = document.createElement('span');
  rodillo.className = CLASE_RODILLO;
  rodillo.textContent = entrante;
  digito.append(rodillo);

  // El pseudo-elemento del saliente sólo debe existir mientras rueda.
  digito.addEventListener(
    'animationend',
    () => {
      delete digito.dataset['rodando'];
      delete digito.dataset['saliente'];
    },
    { once: true },
  );

  return digito;
}

/**
 * Relanza el filete de latón montándolo de cero: una animación CSS nueva, sin
 * reloj. Y NO vive en el HTML servido a propósito — si estuviese, parpadearía
 * en la primera pintada de una página donde todavía no ha cambiado nada.
 * Subraya un cambio; sin cambio no hay filete.
 */
function relanzarSubrayado(odometro: HTMLElement): void {
  odometro.querySelector<HTMLElement>(`.${CLASE_SUBRAYADO}`)?.remove();
  const filete = document.createElement('span');
  filete.className = CLASE_SUBRAYADO;
  filete.setAttribute('aria-hidden', 'true');
  odometro.append(filete);
}

/**
 * Hace rodar el odómetro hasta `valor`. Si la cifra no cambia no ocurre nada:
 * un rodillo que gira sin que el dato se mueva sería una mentira pequeña.
 */
export function rodarOdometro(odometro: HTMLElement, valor: string): void {
  const anterior = digitosDe(odometro).map(textoDe).join('');
  if (anterior === valor) return;

  const digitos = digitosDe(odometro);
  const entrantes = [...valor];

  // Distinto número de dígitos: se reconstruye la fila entera (99 → 100). La
  // fila nueva ocupa el sitio de la vieja y no el principio del odómetro,
  // porque alrededor de los dígitos puede haber texto que no es cifra («+3 hoy»).
  if (digitos.length !== entrantes.length) {
    const anteriores = [...anterior];
    const fila = entrantes.map((entrante, indice) =>
      crearDigito(entrante, anteriores[indice] ?? ''),
    );
    reemplazarFila(digitos, fila);
    relanzarSubrayado(odometro);
    return;
  }

  digitos.forEach((digito, indice) => {
    const entrante = entrantes[indice] ?? '';
    const saliente = textoDe(digito);
    if (entrante === saliente) return;
    digito.replaceWith(crearDigito(entrante, saliente));
  });

  relanzarSubrayado(odometro);
}

/** Sustituye los dígitos viejos por los nuevos exactamente donde estaban. */
function reemplazarFila(viejos: HTMLElement[], nuevos: HTMLElement[]): void {
  const primero = viejos[0];
  if (!primero) return;
  primero.replaceWith(...nuevos);
  viejos.slice(1).forEach((digito) => {
    digito.remove();
  });
}

/**
 * Escribe la cifra sin rodillo. Camino de `prefers-reduced-motion` (§8.12: «el
 * dígito cambia sin rodillo») y de devolver la escena al principio.
 */
export function fijarOdometro(odometro: HTMLElement, valor: string): void {
  odometro.querySelector<HTMLElement>(`.${CLASE_SUBRAYADO}`)?.remove();

  const digitos = digitosDe(odometro);
  const entrantes = [...valor];

  if (digitos.length !== entrantes.length) {
    const fila = entrantes.map((entrante) => {
      const digito = crearDigito(entrante, '');
      delete digito.dataset['rodando'];
      delete digito.dataset['saliente'];
      return digito;
    });
    reemplazarFila(digitos, fila);
    return;
  }

  digitos.forEach((digito, indice) => {
    const rodillo = digito.querySelector<HTMLElement>(`.${CLASE_RODILLO}`);
    if (rodillo) rodillo.textContent = entrantes[indice] ?? '';
    delete digito.dataset['rodando'];
    delete digito.dataset['saliente'];
  });
}

/**
 * Rueda hasta la cifra que YA está escrita, partiendo de la que cada dígito
 * declara en `data-saliente`. Es el camino de las cifras que nacen en el HTML
 * —el recuento de S5, los costes de S9, el contador del telégrafo—: el marcado
 * dice a la vez cuánto vale y de dónde viene, así que la coreografía no repite
 * ni un número.
 *
 * Y rueda UNA vez. El cerrojo es un atributo propio y no el `data-saliente`
 * gastado: ese lo retira el final de la animación, y una cifra cuya animación
 * no llegue a correr —una pestaña de fondo, un `<details>` cerrado— volvería a
 * rodar cada vez que alguien la mirase.
 */
export function rodarDeclarado(odometro: HTMLElement): void {
  if (odometro.dataset['rodado'] !== undefined) return;

  const digitos = digitosDe(odometro);
  if (digitos.length === 0) return;

  const destino = digitos.map(textoDe).join('');
  const origen = digitos.map((digito) => digito.dataset['saliente'] ?? textoDe(digito)).join('');
  if (origen === destino) return;

  odometro.dataset['rodado'] = '';
  fijarOdometro(odometro, origen);
  rodarOdometro(odometro, destino);
}

/**
 * El parpadeo del subrayado por sí solo (§3.S5: la aguja del NO cruza el 70 y
 * el filete del recuento parpadea una vez). No mueve ninguna cifra.
 */
export function parpadearSubrayado(odometro: HTMLElement): void {
  relanzarSubrayado(odometro);
}
