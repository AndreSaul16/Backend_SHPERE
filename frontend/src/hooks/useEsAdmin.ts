/**
 * ¿Esta cuenta tiene panel de administración?
 *
 * La respuesta sale de `is_admin`, que GET /me trae ya calculado con el MISMO
 * predicado que la guarda `require_admin` del backend (`es_admin`). No hay
 * ninguna pregunta que hacer al servidor sólo para esto.
 *
 * Antes se preguntaba SONDEANDO `GET /admin/users` y contando el 403 como un
 * «no». Dos problemas, y el segundo es el que llenaba la consola:
 *
 *  1. Un 403 esperado seguía siendo un 403 en la pestaña de red.
 *  2. La sonda no se cacheaba y el shell se REMONTA al navegar entre chat y
 *     ajustes (App.tsx pinta dos tipos de elemento de ruta distintos y React
 *     Router reconcilia por tipo), así que salían ~11 por sesión.
 *
 * Queda como reserva para la ventana en la que el frontend nuevo ya está
 * desplegado y el backend viejo todavía no manda `is_admin` — los dos repos se
 * despliegan por separado. En esa ventana un administrador NO puede quedarse
 * sin panel; pero la sonda se hace UNA vez, no once, porque la promesa se
 * memoiza a nivel de módulo.
 *
 * El módulo de API se pide de forma perezosa a propósito: la consulta no debe
 * arrastrar `services/api` al trozo que descarga quien sólo quiere ver sus
 * ajustes.
 */
import { useEffect, useState } from 'react';

/**
 * La respuesta, compartida por todos los montajes de la sesión.
 *
 * Se guarda la PROMESA y no el booleano: así dos componentes que preguntan a la
 * vez (sidebar y página de admin) comparten una única petición en vuelo en vez
 * de lanzar dos.
 */
let respuesta: Promise<boolean> | null = null;

async function resolver(): Promise<boolean> {
    const { profileService, adminService } = await import('@/services/api');
    const perfil = await profileService.getProfile();
    if (typeof perfil.is_admin === 'boolean') return perfil.is_admin;
    // Backend viejo: no sabe de `is_admin` todavía. Sonda legada, una vez.
    return adminService.isAdmin();
}

function preguntar(): Promise<boolean> {
    if (respuesta) return respuesta;

    const enCurso: Promise<boolean> = resolver().catch((err: unknown) => {
        // Un fallo de red NO se cachea: si se cachease, un corte de un segundo
        // dejaría a un administrador sin panel hasta recargar la página.
        // La comparación evita que una respuesta tardía borre la caché de la
        // sesión SIGUIENTE si por medio se ha cerrado sesión.
        if (respuesta === enCurso) respuesta = null;
        throw err;
    });

    respuesta = enCurso;
    return enCurso;
}

/**
 * Olvida la respuesta cacheada. Se llama al cerrar sesión (`clearUserStores`).
 *
 * Sin esto, en un navegador compartido el siguiente usuario heredaría el panel
 * del anterior hasta recargar la página.
 */
export function olvidarSiEsAdmin(): void {
    respuesta = null;
}

export function useEsAdmin(): boolean {
    const [esAdmin, setEsAdmin] = useState(false);

    useEffect(() => {
        let vivo = true;
        void preguntar()
            .then((admin) => { if (vivo) setEsAdmin(admin); })
            .catch(() => { /* red caída = no hay panel */ });
        return () => { vivo = false; };
    }, []);

    return esAdmin;
}

/**
 * La misma respuesta, con tres estados: `undefined` mientras llega.
 *
 * Hace falta donde la respuesta decide qué PANTALLA se pinta, no sólo si se
 * pinta un enlace: con dos estados, `/admin` enseñaba «Sin acceso» durante un
 * instante también a quien sí lo tiene, y eso es peor que una espera.
 */
export function useEsAdminConEspera(): boolean | undefined {
    const [esAdmin, setEsAdmin] = useState<boolean | undefined>(undefined);

    useEffect(() => {
        let vivo = true;
        void preguntar()
            .then((admin) => { if (vivo) setEsAdmin(admin); })
            .catch(() => { if (vivo) setEsAdmin(false); });
        return () => { vivo = false; };
    }, []);

    return esAdmin;
}
