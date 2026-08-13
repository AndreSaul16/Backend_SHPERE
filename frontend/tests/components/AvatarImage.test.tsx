/**
 * Regresión D37 — ocho `<img>` de avatar sin `onError`.
 *
 * Un avatar que da 404 —una `photoURL` de Google caducada, un
 * `visual_config.avatar` que ya no está— dejaba el glifo de imagen rota del
 * navegador dentro de un círculo de 32px. Y los ocho sitios YA tenían escrita
 * la alternativa correcta (la inicial, el emoji del agente, la placa del
 * director): era lo que pintaban cuando no había URL ninguna. Sólo que no la
 * usaban cuando la URL existía y fallaba.
 *
 * Se prueban las tres cosas que hacen falta y ninguna basta sola:
 *
 *  1. El primitivo `<AvatarImage>` y su comportamiento.
 *  2. Un sitio de uso real (`MessageBubble`, sus dos avatares): que esté
 *     cableado de verdad. Éstos son los que fallan contra el código con bug.
 *  3. Una barrida mecánica del fuente: que no quede ningún `<img>` suelto,
 *     porque la regresión de este bug es escribir el noveno.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { render, screen, fireEvent } from '@testing-library/react';
import { AvatarImage } from '../../src/components/ui/AvatarImage';
import { MessageBubble } from '../../src/components/chat/MessageBubble';
import { saveUserAvatar } from '../../src/hooks/useUserAvatar';
import type { Message } from '../../src/types';

describe('AvatarImage (D37)', () => {
    it('sin URL pinta directamente la placa', () => {
        render(<AvatarImage src={null} fallback={<span>NX</span>} />);

        expect(screen.getByText('NX')).toBeInTheDocument();
        expect(screen.queryByTestId('avatar-image')).toBeNull();
    });

    it('con URL pinta la imagen', () => {
        render(<AvatarImage src="https://ejemplo.test/a.png" fallback={<span>NX</span>} />);

        expect(screen.getByTestId('avatar-image')).toHaveAttribute(
            'src',
            'https://ejemplo.test/a.png',
        );
        expect(screen.queryByText('NX')).toBeNull();
    });

    it('si la imagen no carga, deja paso a la placa', () => {
        render(<AvatarImage src="https://ejemplo.test/404.png" fallback={<span>NX</span>} />);

        fireEvent.error(screen.getByTestId('avatar-image'));

        expect(screen.queryByTestId('avatar-image')).toBeNull();
        expect(screen.getByText('NX')).toBeInTheDocument();
    });

    it('una URL nueva vuelve a intentarse tras un fallo', () => {
        const { rerender } = render(
            <AvatarImage src="https://ejemplo.test/404.png" fallback={<span>NX</span>} />,
        );
        fireEvent.error(screen.getByTestId('avatar-image'));
        expect(screen.getByText('NX')).toBeInTheDocument();

        // Con un booleano `failed` en vez de la url fallida, subir otra imagen
        // seguiría enseñando la placa para siempre.
        rerender(<AvatarImage src="https://ejemplo.test/nueva.png" fallback={<span>NX</span>} />);

        expect(screen.getByTestId('avatar-image')).toHaveAttribute(
            'src',
            'https://ejemplo.test/nueva.png',
        );
    });

    it('`alt` es vacío por defecto: el nombre ya está escrito al lado (§10)', () => {
        render(<AvatarImage src="https://ejemplo.test/a.png" fallback={<span>NX</span>} />);

        expect(screen.getByTestId('avatar-image')).toHaveAttribute('alt', '');
    });
});

const mensajeAgente: Message = {
    id: 'm1',
    role: 'assistant',
    content: 'La propuesta se sostiene.',
    timestamp: new Date('2026-08-07T10:00:00Z'),
    agentId: 'cto',
};

const mensajeUsuario: Message = {
    id: 'm2',
    role: 'user',
    content: '¿Y el coste?',
    timestamp: new Date('2026-08-07T10:01:00Z'),
};

describe('D37 en los sitios de uso — MessageBubble', () => {
    it('un avatar de sesión roto deja la placa del director, no el icono roto', () => {
        render(
            <MessageBubble
                message={mensajeAgente}
                agent={{
                    id: 'cto-1',
                    name: 'Nexus (CTO)',
                    role: 'CTO',
                    avatar: 'N',
                    description: 'Arquitectura.',
                    color: 'text-agent-cto',
                    hexColor: '#00C1B3',
                    isOnline: true,
                }}
                sessionAvatar="https://ejemplo.test/404.png"
            />,
        );

        fireEvent.error(screen.getByTestId('avatar-image'));

        expect(screen.queryByTestId('avatar-image')).toBeNull();
        expect(screen.getByText('N')).toBeInTheDocument();
    });

    it('un avatar de usuario roto deja su inicial', () => {
        saveUserAvatar('https://ejemplo.test/404.png');
        render(<MessageBubble message={mensajeUsuario} />);

        fireEvent.error(screen.getByTestId('avatar-image'));

        expect(screen.queryByTestId('avatar-image')).toBeNull();
        expect(screen.getByText('S')).toBeInTheDocument();
    });
});

/** Todos los `.tsx` de `src/`, recursivamente. */
function ficherosTsx(dir: string): string[] {
    return readdirSync(dir).flatMap((entrada) => {
        const ruta = join(dir, entrada);
        if (statSync(ruta).isDirectory()) return ficherosTsx(ruta);
        return ruta.endsWith('.tsx') ? [ruta] : [];
    });
}

describe('D37 — barrida del fuente', () => {
    it('no queda ningún `<img>` fuera de <AvatarImage>', () => {
        const src = resolve(__dirname, '../../src');
        const culpables = ficherosTsx(src)
            .filter((f) => !f.endsWith('AvatarImage.tsx'))
            .filter((f) => /<img[\s/>]/.test(readFileSync(f, 'utf8')));

        // Un `<img>` nuevo sin `onError` es exactamente cómo volvería este bug.
        // Si hace falta uno fuera del avatar, que traiga su propio respaldo y se
        // añada aquí a conciencia.
        expect(culpables).toEqual([]);
    });
});
