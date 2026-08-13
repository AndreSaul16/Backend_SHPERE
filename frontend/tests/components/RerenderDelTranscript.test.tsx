import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { useState } from 'react';

import type { Message } from '../../src/types';

/**
 * Tareas 4.7 (D21) y 4.6 (D20) — la prueba de que el token no repinta el hilo.
 *
 * El problema medido, del §2.3 del plan: `ChatPanel` se suscribía al store
 * ENTERO y el store fabrica un array de mensajes nuevo por token, así que un
 * transcript de 100 turnos re-renderizaba las 100 burbujas —con su markdown, su
 * tabla, su resaltado y su parser de 180 líneas— sesenta veces por segundo.
 *
 * Aquí se mide de la única forma que no miente: contando cuántas veces corre el
 * parser de CADA burbuja mientras llega el token de una sola.
 *
 * Se cuentan DOS cosas distintas, y hacen falta las dos:
 *
 *  - **Renders** (`useUserAvatar`, que la burbuja llama incondicionalmente en su
 *    primera línea). Es lo que corta `React.memo` — y lo caro de verdad: el
 *    markdown, la tabla, el resaltado y el árbol entero de la burbuja.
 *  - **Parseos** (`parseMessageParts`). Es lo que corta el `useMemo`.
 *
 * Contar sólo los parseos NO valdría: se verificó quitando el `memo` y el test
 * seguía en verde, porque el `useMemo` ya evita reparsear un contenido que no
 * cambió. El `memo` es lo que evita el RENDER, y sin el contador de renders su
 * retirada pasaría desapercibida.
 */

const renders: string[] = [];
const parseos: string[] = [];

vi.mock('@/hooks/useUserAvatar', () => ({
    // La burbuja lo llama en su primera línea y sin condición: es el sitio
    // exacto para contar renders sin tocar el componente.
    useUserAvatar: () => { renders.push('render'); return null; },
}));

vi.mock('@/utils/parseMessageParts', async (importOriginal) => {
    const real = await importOriginal<typeof import('../../src/utils/parseMessageParts')>();
    return {
        ...real,
        parseMessageParts: (content: string) => {
            parseos.push(content);
            return real.parseMessageParts(content);
        },
    };
});

const { MessageBubble } = await import('../../src/components/chat/MessageBubble');

const turno = (id: string, content: string): Message => ({
    id,
    role: 'CTO',
    content,
    timestamp: new Date('2026-08-07T10:00:00Z'),
    agentId: 'cto-1',
});

/**
 * Un transcript mínimo que se comporta como el de verdad: el store reemplaza
 * SÓLO el mensaje que recibe el token (`m.id === id ? {...m} : m`) y devuelve
 * un array nuevo. Los manejadores son flechas escritas en el JSX, o sea nuevos
 * en cada render — igual que en `ChatPanel`, y es justo lo que hace que un
 * `memo` con comparación por referencia de props no sirva de nada.
 */
function Transcript({ inicial }: { inicial: Message[] }) {
    const [mensajes, setMensajes] = useState(inicial);

    return (
        <>
            <button
                type="button"
                onClick={() =>
                    setMensajes((prev) =>
                        prev.map((m, i) =>
                            i === prev.length - 1 ? { ...m, content: m.content + 'x' } : m
                        )
                    )
                }
            >
                token
            </button>
            {mensajes.map((m, idx) => (
                <MessageBubble
                    key={m.id}
                    message={m}
                    isTyping
                    isLast={idx === mensajes.length - 1}
                    isPinned={false}
                    rating={null}
                    onPin={() => { /* nueva en cada render, como en ChatPanel */ }}
                    onRate={() => { /* idem */ }}
                    onRegenerate={idx === mensajes.length - 1 ? () => { /* idem */ } : undefined}
                />
            ))}
        </>
    );
}

describe('un token sólo repinta la burbuja activa', () => {
    beforeEach(() => { renders.length = 0; parseos.length = 0; });

    it('con 20 turnos, un token repinta UNA burbuja, no veinte', () => {
        const mensajes = Array.from({ length: 20 }, (_, i) => turno(`m${i}`, `Turno ${i}. `.repeat(20)));
        const { getByText } = render(<Transcript inicial={mensajes} />);

        // Montaje: las veinte se pintan una vez. Es el suelo, no el problema.
        expect(renders).toHaveLength(20);
        expect(parseos).toHaveLength(20);
        renders.length = 0;
        parseos.length = 0;

        fireEvent.click(getByText('token'));

        // Después del token: UN render y UN parseo. Antes de 4.6/4.7 aquí había
        // 20 renders — con su markdown, su resaltado y su parser cada uno.
        expect(renders).toHaveLength(1);
        expect(parseos).toHaveLength(1);
        expect(parseos[0].endsWith('x')).toBe(true);
    });

    it('diez tokens seguidos son diez renders, no doscientos', () => {
        const mensajes = Array.from({ length: 20 }, (_, i) => turno(`m${i}`, `Turno ${i}`));
        const { getByText } = render(<Transcript inicial={mensajes} />);
        renders.length = 0;
        parseos.length = 0;

        const boton = getByText('token');
        for (let i = 0; i < 10; i++) fireEvent.click(boton);

        expect(renders).toHaveLength(10);
        expect(parseos).toHaveLength(10);
    });
});
