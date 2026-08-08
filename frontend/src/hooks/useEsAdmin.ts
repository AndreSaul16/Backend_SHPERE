/**
 * ¿Esta cuenta tiene panel de administración?
 *
 * La pregunta se hace con `adminService.isAdmin()` y NO con `adminService
 * .users()`: el 403 de «no eres admin» es la respuesta NORMAL para casi todo el
 * mundo, y pasándolo por el manejador global se convertía en
 * `perm.plan_not_allowed` → paywall. O sea: el modal «Has agotado tus créditos»
 * en cada carga de la aplicación, a todo usuario que no fuera administrador
 * (defecto F1). `isAdmin()` hace la misma pregunta con `skipGlobalHandler`.
 *
 * El módulo de API se pide de forma perezosa a propósito: la sonda no debe
 * arrastrar `services/api` al trozo que descarga quien sólo quiere ver sus
 * ajustes.
 */
import { useEffect, useState } from 'react';

export function useEsAdmin(): boolean {
    const [esAdmin, setEsAdmin] = useState(false);

    useEffect(() => {
        let vivo = true;
        void import('@/services/api')
            .then(({ adminService }) => adminService.isAdmin())
            .then((admin) => { if (vivo) setEsAdmin(admin); })
            .catch(() => { /* la sonda ya no lanza; red caída = no hay panel */ });
        return () => { vivo = false; };
    }, []);

    return esAdmin;
}
