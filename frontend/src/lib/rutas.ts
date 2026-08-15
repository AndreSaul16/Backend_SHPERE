/**
 * Las rutas del producto que NO se pueden escribir a mano en cada sitio.
 *
 * De momento hay una sola, y tiene una historia que justifica el módulo:
 *
 * **La casa del producto ya no es `/`.** Desde que la landing de marketing se
 * publica en la raíz del dominio, nginx atiende `location = /` con el HTML de
 * la landing y sólo el RESTO de rutas caen en la SPA. O sea que un F5 en `/`
 * no devuelve la aplicación: devuelve la portada comercial. La primera
 * pantalla del producto vive por tanto en `/chat`.
 *
 * Esto se centraliza en vez de repetir el literal por dos razones:
 *
 * 1. El home ya ha demostrado que se mueve. La primera vez costó tocar ocho
 *    ficheros; la siguiente cuesta esta línea.
 * 2. La mitad de los sitios que apuntaban a la casa eran `to="/"` sueltos en
 *    JSX, que es exactamente el literal que nadie relee. Con un nombre
 *    delante, un destino equivocado se ve en la revisión.
 *
 * `tests/lib/laCasaEstaEnChat.test.ts` monta guardia mecánica sobre esto: si
 * alguien vuelve a escribir `to="/"` o `navigate('/')` en `src/`, falla.
 */

/** La primera pantalla del producto con sesión: el chat. */
export const RUTA_DE_INICIO = '/chat';
