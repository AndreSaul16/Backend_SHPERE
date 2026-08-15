/**
 * La Sesión de Muestra — DIRECCION.md §4.1 y §2.S1 / DESIGN.md §8.6.
 *
 * ESTO ES CONTENIDO EDITORIAL, NO ANDAMIAJE. Cada frase de este fichero se lee
 * en el primer viewport de la landing y se revisa como se revisa el copy de §2.
 *
 * Qué es: una línea de tiempo de eventos con la MISMA gramática SSE del
 * producto (`onBoardPhase` / `onBoardVote` / `onBoardConsensus` /
 * `onArtifactChunk` / `onArtifactClose`, PRODUCT.md:113-115), redactada a mano
 * para la demo. No es la transcripción de una sesión real —no se finge que lo
 * sea, y el rótulo del componente lo dice—, pero se comporta como una: las
 * fases van en el orden canónico del producto, los turnos llegan por trozos, y
 * el acta se escribe antes de sellarse.
 *
 * D3 — la demo es honesta. El negocio del que habla la junta es FICTICIO: un
 * SaaS que se plantea pasar de 29 € a 49 €. Todas las cifras que se dicen aquí
 * son de ese negocio inventado. Ni una sola es una métrica de SPHERE: SPHERE no
 * publica cifras agregadas de uso, así que aquí no aparece ninguna.
 *
 * VELOCIDAD Y DURACIÓN. Los `t` están en milisegundos de la sesión —el reloj
 * del debate—, y el despachador los reproduce a 2× (§8.6). El último evento cae
 * en 79 600 ms, así que la reproducción dura 39,8 s: los «≈ 40 s» del contrato.
 *
 * LAS VOCES (§2.S4, y son lo que hace que esto no sea relleno):
 *   Oberon   preside. Encuadra, recoge y cierra. Habla en imperativo cortés.
 *   Nexus    técnico y seco. Frases cortas. Habla de coste de construir.
 *   Ledger   numérico. Margen, LTV, cohortes. Pone cifras donde hay ilusión.
 *   Vortex   de mercado. Quién compra, quién se va, y qué relato lo sostiene.
 *   Némesis  no vota: rompe el consenso con una sola pregunta incómoda.
 *
 * POR QUÉ NÉMESIS HABLA AUNQUE LA JUNTA SEA DE CUATRO. El resumen accesible de
 * §2.S1 dice «cuatro directores» y el recuento son cuatro votos; Némesis no es
 * un quinto director sino el abogado del diablo, que —§2.S4— «no tiene
 * cartera». Por eso interviene en la fase que lleva su nombre, no ocupa asiento
 * en el Palco y no emite voto. La fase `devil` es opcional (§2.S3) y aquí se
 * convoca justo donde el contrato la recomienda: cuando la mesa está más
 * segura, con Ledger al 88.
 */

/** Fases del debate, con los identificadores del producto (`BoardPhase`). */
export const FASES = ['opening', 'analysis', 'rebuttal', 'devil', 'synthesis'] as const;
export type Fase = (typeof FASES)[number];

/** Los cuatro asientos del Palco: los que tienen aguja y los que votan. */
export const ASIENTOS = ['oberon', 'nexus', 'ledger', 'vortex'] as const;
export type Asiento = (typeof ASIENTOS)[number];

/** Némesis interviene sin asiento; el usuario es quien convoca. */
export type Interviniente = Asiento | 'nemesis' | 'usuario';

/** Sentido del voto (PRODUCT.md: SI / NO / CONDICIONAL). */
export type Sentido = 'SÍ' | 'NO' | 'CONDICIONAL';

/** Los dos renglones que la pluma escribe en el acta mini del hero. */
export type RenglonDeActa = 'titulo' | 'recuento';

export type EventoDeSesion =
  | { readonly t: number; readonly tipo: 'fase'; readonly fase: Fase }
  | { readonly t: number; readonly tipo: 'turno'; readonly quien: Interviniente }
  | { readonly t: number; readonly tipo: 'chunk'; readonly texto: string }
  | {
      readonly t: number;
      readonly tipo: 'voto';
      readonly quien: Asiento;
      readonly sentido: Sentido;
      readonly confianza: number;
    }
  | {
      readonly t: number;
      readonly tipo: 'recuento';
      readonly si: number;
      readonly condicional: number;
      readonly no: number;
    }
  | {
      readonly t: number;
      readonly tipo: 'acta_chunk';
      readonly renglon: RenglonDeActa;
      readonly texto: string;
    }
  | { readonly t: number; readonly tipo: 'acta_cierre' }
  | {
      readonly t: number;
      readonly tipo: 'tool';
      readonly herramienta: string;
      readonly etiqueta: string;
      readonly hora: string;
    };

/**
 * El nombre y la cartera de cada interviniente, tal y como se rotulan en el
 * turno. `clase` es el modificador de identidad de §2.8 (relleno + filete).
 */
export const INTERVINIENTES: Readonly<
  Record<Interviniente, { readonly nombre: string; readonly cartera: string; readonly clase: string }>
> = {
  oberon: { nombre: 'Oberon', cartera: 'CEO', clase: 'identidad--ceo' },
  nexus: { nombre: 'Nexus', cartera: 'CTO', clase: 'identidad--cto' },
  ledger: { nombre: 'Ledger', cartera: 'CFO', clase: 'identidad--cfo' },
  vortex: { nombre: 'Vortex', cartera: 'CMO', clase: 'identidad--cmo' },
  nemesis: { nombre: 'Némesis', cartera: 'Abogado del diablo', clase: 'identidad--devil' },
  usuario: { nombre: 'Tú', cartera: 'Convoca', clase: 'identidad--usuario' },
};

/** Los rótulos de fase son los nombres canónicos de §2.S3. */
export const ROTULO_DE_FASE: Readonly<Record<Fase, string>> = {
  opening: 'Apertura',
  analysis: 'Análisis',
  rebuttal: 'Réplicas',
  devil: 'El abogado del diablo',
  synthesis: 'Síntesis',
};

/** §8.6: la sesión se reproduce a 2×. La grabación es el reloj del debate. */
export const VELOCIDAD = 2;

/**
 * La pregunta que abre la sesión (§2.S1). No es un evento: está en el HTML
 * desde el primer pintado, porque la escribe el usuario antes de que la junta
 * exista y sigue ahí cuando la demo termina.
 */
export const PREGUNTA_DE_LA_SESION = '¿Subimos el precio de 29 € a 49 € en enero?';

/**
 * LA LÍNEA DE TIEMPO.
 *
 * `t` en milisegundos de la sesión, estrictamente creciente. Un turno abre el
 * bloque de quien habla; los `chunk` que le siguen se van pegando a ese bloque,
 * que es como llegan los tokens de verdad. Ningún turno pasa de dos frases
 * visibles (§4.1).
 *
 * NO HAY NI UN EVENTO `tool`, Y ES DELIBERADO. El tipo existe porque la
 * gramática del producto lo tiene, pero PRODUCT.md:76-85 es explícito: «en la
 * junta no se ejecuta ninguna herramienta». Meter una actuación en mitad del
 * debate sería inventar un comportamiento que el producto no tiene, justo en la
 * pieza que la página presenta como fiel. Las actuaciones se ven en S7, después
 * de la junta, que es donde ocurren.
 */
export const SESION_DE_MUESTRA: readonly EventoDeSesion[] = [
  // ── Fase 1 · APERTURA — cada director fija posición y confianza ──────────
  { t: 0, tipo: 'fase', fase: 'opening' },

  { t: 700, tipo: 'turno', quien: 'oberon' },
  { t: 1200, tipo: 'chunk', texto: 'Sobre la mesa: subir el precio de 29 € a 49 € en enero.' },
  { t: 2600, tipo: 'chunk', texto: ' Quiero posición y confianza de cada uno antes de discutir nada.' },

  { t: 4400, tipo: 'turno', quien: 'ledger' },
  { t: 4900, tipo: 'chunk', texto: 'A favor.' },
  { t: 5700, tipo: 'chunk', texto: ' El precio de hoy no cubre lo que cuesta servir a las cuentas grandes.' },

  { t: 7800, tipo: 'turno', quien: 'nexus' },
  { t: 8300, tipo: 'chunk', texto: 'Depende de la migración.' },
  { t: 9100, tipo: 'chunk', texto: ' Cambiar el precio es una línea; mover a la cartera actual no lo es.' },

  { t: 11400, tipo: 'turno', quien: 'vortex' },
  { t: 11900, tipo: 'chunk', texto: 'En contra de hacerlo de golpe.' },
  { t: 12800, tipo: 'chunk', texto: ' La cartera que tienes hoy entró por precio.' },

  // ── Fase 2 · ANÁLISIS — cada uno mira el problema desde su cartera ───────
  { t: 15000, tipo: 'fase', fase: 'analysis' },

  { t: 15700, tipo: 'turno', quien: 'ledger' },
  { t: 16200, tipo: 'chunk', texto: 'A 49 € el margen bruto pasa del 62 % al 74 %.' },
  { t: 17800, tipo: 'chunk', texto: ' El LTV sube aunque la conversión de nuevos caiga un 15 %.' },

  { t: 20400, tipo: 'turno', quien: 'nexus' },
  { t: 20900, tipo: 'chunk', texto: 'El grandfathering son dos planes conviviendo en Stripe y una migración por lotes.' },
  { t: 22800, tipo: 'chunk', texto: ' Dos semanas de trabajo, no dos días.' },

  { t: 25400, tipo: 'turno', quien: 'vortex' },
  { t: 25900, tipo: 'chunk', texto: 'El 41 % de tu cartera lleva más de un año pagando 29 €.' },
  { t: 27700, tipo: 'chunk', texto: ' Para ellos no es un precio nuevo: es una subida del 69 %.' },

  { t: 30400, tipo: 'turno', quien: 'oberon' },
  { t: 30900, tipo: 'chunk', texto: 'Me quedo con las dos cosas: el margen lo pide y la cartera no lo espera.' },

  // ── Fase 3 · RÉPLICAS — se rebaten entre sí ─────────────────────────────
  { t: 33500, tipo: 'fase', fase: 'rebuttal' },

  { t: 34200, tipo: 'turno', quien: 'vortex' },
  { t: 34700, tipo: 'chunk', texto: 'Ledger, ese 15 % es de conversión nueva.' },
  { t: 36000, tipo: 'chunk', texto: ' La baja de la cartera vieja no está en tu número.' },

  { t: 38400, tipo: 'turno', quien: 'ledger' },
  { t: 38900, tipo: 'chunk', texto: 'Cierto, y aun así compensa.' },
  { t: 40100, tipo: 'chunk', texto: ' Perder un 10 % de esa cohorte deja más margen que mantenerla entera a 29 €.' },

  { t: 43000, tipo: 'turno', quien: 'nexus' },
  { t: 43500, tipo: 'chunk', texto: 'Si el cambio entra el mismo día para todos, soporte se come el trimestre.' },
  { t: 45400, tipo: 'chunk', texto: ' Escalonado, no.' },

  // ── Fase 4 · EL ABOGADO DEL DIABLO — Némesis rompe el consenso ──────────
  { t: 47600, tipo: 'fase', fase: 'devil' },

  { t: 48400, tipo: 'turno', quien: 'nemesis' },
  { t: 48900, tipo: 'chunk', texto: 'Estáis discutiendo cuánto cobrar y nadie ha preguntado qué recibe el cliente por esos 20 € de más.' },
  { t: 51400, tipo: 'chunk', texto: ' Si la respuesta es «nada», esto no es un precio nuevo: es lo mismo, más caro.' },

  { t: 54600, tipo: 'turno', quien: 'vortex' },
  { t: 55100, tipo: 'chunk', texto: 'Es justo.' },
  { t: 55900, tipo: 'chunk', texto: ' En enero entra la función que llevan seis meses pidiendo; sin ella la subida no tiene relato.' },

  { t: 58600, tipo: 'turno', quien: 'nexus' },
  { t: 59100, tipo: 'chunk', texto: 'Esa función llega en enero si el precio no me come el sprint de la migración.' },

  // ── Fase 5 · SÍNTESIS — votos, recuento y cierre del acta ───────────────
  { t: 61600, tipo: 'fase', fase: 'synthesis' },

  { t: 62400, tipo: 'voto', quien: 'ledger', sentido: 'SÍ', confianza: 88 },
  { t: 63600, tipo: 'voto', quien: 'oberon', sentido: 'SÍ', confianza: 74 },
  { t: 64800, tipo: 'voto', quien: 'nexus', sentido: 'CONDICIONAL', confianza: 66 },
  // El único NO, y el que cruza el 70: su arco se tiñe de oxblood (P2).
  { t: 66000, tipo: 'voto', quien: 'vortex', sentido: 'NO', confianza: 71 },

  { t: 67600, tipo: 'recuento', si: 2, condicional: 1, no: 1 },

  { t: 68800, tipo: 'turno', quien: 'oberon' },
  { t: 69300, tipo: 'chunk', texto: 'Sí, escalonado: nuevos clientes en enero, cartera actual en abril con aviso de 60 días.' },

  // ── El acta se escribe. Trece trozos: la pluma llena un renglón a los doce
  //    y empieza el siguiente, que el cierre completa (§8.8). ──────────────
  { t: 72000, tipo: 'acta_chunk', renglon: 'titulo', texto: 'Acta — ' },
  { t: 72500, tipo: 'acta_chunk', renglon: 'titulo', texto: 'Subida ' },
  { t: 73000, tipo: 'acta_chunk', renglon: 'titulo', texto: 'de precio ' },
  { t: 73500, tipo: 'acta_chunk', renglon: 'titulo', texto: 'a 49 €' },

  { t: 74200, tipo: 'acta_chunk', renglon: 'recuento', texto: 'SÍ 2 ' },
  { t: 74700, tipo: 'acta_chunk', renglon: 'recuento', texto: '· ' },
  { t: 75200, tipo: 'acta_chunk', renglon: 'recuento', texto: 'CONDICIONAL 1 ' },
  { t: 75700, tipo: 'acta_chunk', renglon: 'recuento', texto: '· ' },
  { t: 76200, tipo: 'acta_chunk', renglon: 'recuento', texto: 'NO 1 ' },
  { t: 76700, tipo: 'acta_chunk', renglon: 'recuento', texto: '— ' },
  { t: 77200, tipo: 'acta_chunk', renglon: 'recuento', texto: 'Recomendación: ' },
  { t: 77700, tipo: 'acta_chunk', renglon: 'recuento', texto: 'aprobar, ' },
  { t: 78200, tipo: 'acta_chunk', renglon: 'recuento', texto: 'escalonado' },

  // El acta queda cerrada y cae el sello. Fin de la sesión.
  { t: 79600, tipo: 'acta_cierre' },
];

/** Duración de la grabación, en milisegundos de sesión. */
export const DURACION_DE_LA_SESION = SESION_DE_MUESTRA.reduce(
  (maximo, evento) => Math.max(maximo, evento.t),
  0,
);

/** Lo que el visitante ve durar: ≈ 40 s (§4.1). */
export const DURACION_REPRODUCIDA_MS = DURACION_DE_LA_SESION / VELOCIDAD;
