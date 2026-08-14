import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

/**
 * QA-4 · defecto 1 — «¿soy admin?» se pregunta UNA vez, y no con un 403.
 *
 * Lo que había: cada montaje del shell sondeaba `GET /admin/users` y contaba el
 * 403 como un «no». Como el shell se remonta al navegar entre chat y ajustes
 * (App.tsx usa dos tipos de elemento de ruta y React Router reconcilia por
 * tipo), eso eran ~11 peticiones fallidas por sesión, con la consola en rojo,
 * a TODO usuario que no fuera administrador.
 *
 * Lo que se fija aquí, en este orden de importancia:
 *
 *  1. El dato sale del perfil (`is_admin` de GET /me), que es donde el backend
 *     ya sabe la respuesta. Sin sonda, sin 403.
 *  2. Mientras los dos repos se despliegan por separado hay una ventana en la
 *     que el backend viejo aún no manda `is_admin`. Ahí NO se puede dejar a un
 *     administrador sin su panel: se cae a la sonda legada.
 *  3. Pero esa caída es UNA sola vez por sesión, no once. Esta es la guarda de
 *     regresión del defecto original.
 *  4. La respuesta cacheada no puede sobrevivir al cierre de sesión: en un
 *     navegador compartido, el siguiente usuario heredaría el panel.
 *  5. Un fallo de red NO se cachea. Si se cachease, un corte de un segundo
 *     dejaría a un administrador sin panel hasta recargar la página entera.
 */

const getProfile = vi.fn();
const isAdmin = vi.fn();

vi.mock('@/services/api', () => ({
    profileService: { getProfile: () => getProfile() },
    adminService: { isAdmin: () => isAdmin() },
}));

const { useEsAdmin, useEsAdminConEspera, olvidarSiEsAdmin } = await import(
    '../../src/hooks/useEsAdmin'
);

/** Lo mínimo que devuelve GET /me. `is_admin` se añade en cada caso. */
const PERFIL = {
    firebase_uid: 'u1',
    email: 'socia@ejemplo.com',
    display_name: 'Socia',
};

beforeEach(() => {
    // La caché vive en el módulo: sin esto los casos se contaminarían entre sí.
    olvidarSiEsAdmin();
    getProfile.mockReset();
    isAdmin.mockReset();
});

describe('el dato sale del perfil, no de un 403', () => {
    it('un administrador se reconoce por is_admin, sin tocar /admin/users', async () => {
        getProfile.mockResolvedValue({ ...PERFIL, is_admin: true });

        const { result } = renderHook(() => useEsAdmin());

        await waitFor(() => expect(result.current).toBe(true));
        expect(getProfile).toHaveBeenCalledTimes(1);
        expect(isAdmin).not.toHaveBeenCalled();
    });

    it('quien no lo es pasa de «esperando» a «no», tampoco con sonda', async () => {
        getProfile.mockResolvedValue({ ...PERFIL, is_admin: false });

        const { result } = renderHook(() => useEsAdminConEspera());

        // El tercer estado es el que impide que /admin enseñe «Sin acceso» a
        // quien sí lo tiene mientras la respuesta viaja.
        expect(result.current).toBeUndefined();
        await waitFor(() => expect(result.current).toBe(false));
        expect(getProfile).toHaveBeenCalledTimes(1);
        expect(isAdmin).not.toHaveBeenCalled();
    });
});

describe('el desfase de despliegue entre los dos repos', () => {
    it('con backend viejo (sin is_admin) cae a la sonda legada', async () => {
        getProfile.mockResolvedValue({ ...PERFIL });
        isAdmin.mockResolvedValue(true);

        const { result } = renderHook(() => useEsAdmin());

        await waitFor(() => expect(result.current).toBe(true));
        expect(isAdmin).toHaveBeenCalledTimes(1);
    });

    it('y respeta el «no» de la sonda legada', async () => {
        getProfile.mockResolvedValue({ ...PERFIL });
        isAdmin.mockResolvedValue(false);

        const { result } = renderHook(() => useEsAdminConEspera());

        expect(result.current).toBeUndefined();
        await waitFor(() => expect(result.current).toBe(false));
        expect(isAdmin).toHaveBeenCalledTimes(1);
    });

    it('dos montajes seguidos hacen UNA sola sonda, no dos', async () => {
        // La guarda del defecto: sin caché de módulo esto eran dos llamadas, y
        // en una sesión real once.
        getProfile.mockResolvedValue({ ...PERFIL });
        isAdmin.mockResolvedValue(true);

        const primero = renderHook(() => useEsAdmin());
        await waitFor(() => expect(primero.result.current).toBe(true));
        primero.unmount();

        const segundo = renderHook(() => useEsAdmin());
        await waitFor(() => expect(segundo.result.current).toBe(true));

        expect(isAdmin).toHaveBeenCalledTimes(1);
        expect(getProfile).toHaveBeenCalledTimes(1);
    });
});

describe('la caché', () => {
    it('tampoco repite el /me con backend nuevo', async () => {
        getProfile.mockResolvedValue({ ...PERFIL, is_admin: true });

        const primero = renderHook(() => useEsAdmin());
        await waitFor(() => expect(primero.result.current).toBe(true));
        primero.unmount();

        const segundo = renderHook(() => useEsAdmin());
        await waitFor(() => expect(segundo.result.current).toBe(true));

        expect(getProfile).toHaveBeenCalledTimes(1);
    });

    it('se olvida al cerrar sesión: el panel no se hereda', async () => {
        getProfile.mockResolvedValue({ ...PERFIL, is_admin: true });
        const admin = renderHook(() => useEsAdmin());
        await waitFor(() => expect(admin.result.current).toBe(true));
        admin.unmount();

        olvidarSiEsAdmin();
        getProfile.mockResolvedValue({ ...PERFIL, is_admin: false });

        const siguiente = renderHook(() => useEsAdminConEspera());
        await waitFor(() => expect(siguiente.result.current).toBe(false));
        expect(getProfile).toHaveBeenCalledTimes(2);
    });

    it('no cachea un fallo de red: el siguiente montaje reintenta', async () => {
        getProfile.mockRejectedValueOnce(new Error('red caída'));

        const caido = renderHook(() => useEsAdminConEspera());
        await waitFor(() => expect(caido.result.current).toBe(false));
        caido.unmount();

        getProfile.mockResolvedValue({ ...PERFIL, is_admin: true });

        const reintento = renderHook(() => useEsAdmin());
        await waitFor(() => expect(reintento.result.current).toBe(true));
        expect(getProfile).toHaveBeenCalledTimes(2);
    });
});
