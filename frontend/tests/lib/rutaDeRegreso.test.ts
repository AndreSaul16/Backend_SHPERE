/**
 * 6.2 — el destino que sobrevive al corte de sesión.
 *
 * Lo que se prueba aquí no es «guarda una cadena», es la guarda: el valor entra
 * por `location.state`, que vive en el historial del navegador y no lo controla
 * la app. Un `//evil.com` colado ahí sería una redirección abierta con la
 * sesión ya iniciada.
 */
import { describe, expect, it } from 'vitest';
import { destinoDeRegreso } from '@/lib/rutaDeRegreso';

describe('destinoDeRegreso', () => {
    it('devuelve la ruta interna con su query y su hash', () => {
        expect(destinoDeRegreso({ destino: '/billing' })).toBe('/billing');
        expect(destinoDeRegreso({ destino: '/settings/profile?tab=1#pago' })).toBe(
            '/settings/profile?tab=1#pago',
        );
    });

    it('descarta lo que no es un destino', () => {
        expect(destinoDeRegreso(null)).toBeNull();
        expect(destinoDeRegreso(undefined)).toBeNull();
        expect(destinoDeRegreso({})).toBeNull();
        expect(destinoDeRegreso({ destino: '' })).toBeNull();
        expect(destinoDeRegreso({ destino: 42 })).toBeNull();
    });

    it('no deja salir del sitio: nada de absolutas ni de protocolo-relativas', () => {
        expect(destinoDeRegreso({ destino: '//evil.example' })).toBeNull();
        expect(destinoDeRegreso({ destino: 'https://evil.example/x' })).toBeNull();
        expect(destinoDeRegreso({ destino: 'javascript:alert(1)' })).toBeNull();
        expect(destinoDeRegreso({ destino: 'billing' })).toBeNull();
    });

    it('no devuelve a las propias puertas de entrada: sería un bucle', () => {
        expect(destinoDeRegreso({ destino: '/login' })).toBeNull();
        expect(destinoDeRegreso({ destino: '/login?next=/x' })).toBeNull();
        expect(destinoDeRegreso({ destino: '/register' })).toBeNull();
        expect(destinoDeRegreso({ destino: '/verify-email' })).toBeNull();
        expect(destinoDeRegreso({ destino: '/reset-password' })).toBeNull();
        // …pero una ruta que sólo EMPIEZA igual sí es un destino legítimo.
        expect(destinoDeRegreso({ destino: '/logins-del-equipo' })).toBe('/logins-del-equipo');
    });
});
