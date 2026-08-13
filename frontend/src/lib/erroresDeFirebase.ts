/**
 * El código de un fallo de Firebase Auth, sin `any` (D43).
 *
 * Los cinco sitios que preguntan por `err.code` lo hacían escribiendo
 * `catch (err: any)`, que apaga el comprobador de tipos para TODO el bloque:
 * a partir de ahí `err.mesage` (con una ese) compila igual de bien. `FirebaseError`
 * es una clase exportada por `firebase/app`, pero importarla aquí arrastraría
 * el SDK a los trozos de las pantallas de acceso; con una comprobación de
 * forma basta y no cuesta un kilobyte.
 */

/** El `code` de un error de Firebase Auth, o cadena vacía si no lo lleva. */
export function codigoDeFirebase(err: unknown): string {
    if (typeof err === 'object' && err !== null && 'code' in err) {
        const code = (err as { code: unknown }).code;
        if (typeof code === 'string') return code;
    }
    return '';
}

/** ¿Este fallo es exactamente ese código? */
export function esCodigoDeFirebase(err: unknown, code: string): boolean {
    return codigoDeFirebase(err) === code;
}
