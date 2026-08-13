import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useChatStore } from '../../src/store/useChatStore';
import { chatService, type StreamCallbacks } from '../../src/services/api';

/**
 * Tarea 4.8 · D22 — el buffer de tokens por fotograma, y el riesgo R5.
 *
 * Lo que había: un `set` por token, y ese `set` reconstruye el hilo entero con
 * un `.map()`. Con 100 turnos en pantalla y un modelo emitiendo a 40-60
 * tokens/s son 6.000 objetos nuevos por segundo, cada uno con su render.
 *
 * R5 dice, literalmente: «El buffer de tokens con `rAF` puede desordenar tokens
 * de directores en paralelo», y pide «Test de streaming con CTO y CFO alternando
 * tokens». Está abajo, y con él los tres invariantes que no se pueden romper:
 * no perder texto, no desordenarlo, y que los marcadores de utensilio y
 * artefacto caigan en su sitio dentro del turno.
 *
 * §7.4 prohíbe animar el texto en streaming. El buffer NO lo anima: agrupa
 * escrituras. El texto sigue apareciendo por trozos y sin transición ninguna —
 * lo que cambia es cuántas veces se reconstruye el hilo para enseñarlo.
 */

vi.mock('../../src/services/api', () => ({
    chatService: {
        getSessions: vi.fn(),
        getCustomAgents: vi.fn(),
        createCustomAgent: vi.fn(),
        deleteCustomAgent: vi.fn(),
        createSession: vi.fn(),
        getSessionHistory: vi.fn(),
        updateSession: vi.fn(),
        deleteSession: vi.fn(),
        streamChat: vi.fn(),
    },
}));

const SID = 's-buffer';
const stream = chatService.streamChat as never as ReturnType<typeof vi.fn>;

const abrirJunta = () => {
    useChatStore.setState({
        currentSessionId: SID,
        selectedAgentId: 'group-chat',
        messagesBySession: { [SID]: [] },
    });
};

const enviar = async (guion: (cb: StreamCallbacks) => void | Promise<void>) => {
    stream.mockImplementation(async (_q: string, _s: string, cb: StreamCallbacks) => guion(cb));
    await useChatStore.getState().sendMessage('¿avanzamos?');
};

const mensajes = () => useChatStore.getState().messagesBySession[SID] ?? [];
const porRol = (rol: string) => mensajes().find((m) => m.role === rol);

/**
 * Cuenta cuántas VECES se reconstruye el hilo de la sesión. Es la medida que
 * importa: cada reconstrucción es un `.map()` sobre todos los turnos más el
 * render de React que cuelga de él.
 */
function contarEscriturasDelHilo() {
    let n = 0;
    let ultimo = useChatStore.getState().messagesBySession[SID];
    const cancelar = useChatStore.subscribe((s) => {
        const ahora = s.messagesBySession[SID];
        if (ahora !== ultimo) { ultimo = ahora; n += 1; }
    });
    return { total: () => n, cancelar };
}

beforeEach(() => {
    useChatStore.getState().resetState();
    vi.clearAllMocks();
});

describe('el buffer no pierde ni desordena', () => {
    it('200 tokens intercalados de CTO y CFO llegan enteros y en orden (R5)', async () => {
        abrirJunta();
        await enviar((cb) => {
            cb.onBoardAgent?.({ role: 'CTO', is_conclusion: false, phase: 'analysis' });
            cb.onBoardAgent?.({ role: 'CFO', is_conclusion: false, phase: 'analysis' });
            // Debaten en paralelo: los tokens se intercalan uno a uno.
            for (let i = 0; i < 100; i++) {
                cb.onToken(`c${i} `, 'CTO');
                cb.onToken(`f${i} `, 'CFO');
            }
        });

        const esperadoCTO = Array.from({ length: 100 }, (_, i) => `c${i} `).join('');
        const esperadoCFO = Array.from({ length: 100 }, (_, i) => `f${i} `).join('');

        expect(porRol('CTO')!.content).toBe(esperadoCTO);
        expect(porRol('CFO')!.content).toBe(esperadoCFO);
        // Y no se han mezclado: ni una `f` en el turno del CTO.
        expect(porRol('CTO')!.content).not.toMatch(/f\d/);
        expect(porRol('CFO')!.content).not.toMatch(/c\d/);
    });

    it('el marcador de un utensilio cae DONDE llegó, no al principio ni al final', async () => {
        // Es el invariante que se rompe solo: si el marcador se escribiera al
        // instante mientras los tokens esperan fotograma, aterrizaría antes que
        // texto que llegó antes que él.
        abrirJunta();
        await enviar((cb) => {
            cb.onToken('Voy a mirarlo. ', null);
            cb.onToolStart?.({ tool_name: 'calendario', args: {} });
            cb.onToken('Ya está. ', null);
            cb.onToolResult?.({ tool_name: 'calendario', result: '3 huecos' });
            cb.onToken('Listo.', null);
        });

        expect(mensajes()[1].content).toBe(
            'Voy a mirarlo. \n[TOOL_START:calendario]\nYa está. \n[TOOL_RESULT:calendario:3 huecos]\nListo.'
        );
    });

    it('el razonamiento se acumula aparte del contenido y tampoco se pierde', async () => {
        abrirJunta();
        await enviar((cb) => {
            for (let i = 0; i < 50; i++) cb.onThinking?.(`p${i} `, null);
            cb.onToken('respuesta', null);
        });

        expect(mensajes()[1].thinking).toBe(Array.from({ length: 50 }, (_, i) => `p${i} `).join(''));
        expect(mensajes()[1].content).toBe('respuesta');
    });

    it('`onBoardAgent` vacía antes de mirar si la burbuja inicial está vacía', async () => {
        // Sin vaciar, vería la burbuja vacía —los tokens están en el buffer— y
        // se la robaría a quien ya estaba hablando: el texto del primero
        // acabaría dentro del turno del segundo.
        abrirJunta();
        await enviar((cb) => {
            cb.onToken('ruido de apertura', null);
            cb.onBoardAgent?.({ role: 'CEO', is_conclusion: false });
            cb.onToken('yo soy el CEO', 'CEO');
        });

        const ms = mensajes();
        expect(ms).toHaveLength(3);
        expect(ms[1].content).toBe('ruido de apertura');
        expect(ms[2].content).toBe('yo soy el CEO');
    });

    it('el turno cortado conserva lo que estuviera en el buffer, y la marca va al final', async () => {
        abrirJunta();
        await enviar((cb) => {
            cb.onToken('a medias', null);
            cb.onError?.(new Error('corte'));
        });

        const texto = mensajes()[1].content;
        expect(texto.startsWith('a medias')).toBe(true);
        expect(texto).toContain('La respuesta se cortó aquí');
        expect(mensajes()[1].interrupted).toBe(true);
    });

    it('un fallo de red no se lleva por delante los tokens encolados', async () => {
        abrirJunta();
        stream.mockImplementation(async (_q: string, _s: string, cb: StreamCallbacks) => {
            cb.onToken('lo que dio tiempo a decir', null);
            throw new Error('offline');
        });

        await useChatStore.getState().sendMessage('¿avanzamos?');

        expect(mensajes()[1].content).toBe('lo que dio tiempo a decir');
        expect(mensajes()[1].interrupted).toBe(true);
    });
});

describe('el buffer agrupa: menos escrituras del hilo', () => {
    it('200 tokens en un fotograma son UNA reconstrucción del hilo, no 200', async () => {
        abrirJunta();
        // Se cuenta desde después de crear las burbujas, para medir sólo lo que
        // cuestan los tokens.
        let sonda: ReturnType<typeof contarEscriturasDelHilo> | null = null;
        await enviar((cb) => {
            cb.onBoardAgent?.({ role: 'CTO', is_conclusion: false });
            cb.onBoardAgent?.({ role: 'CFO', is_conclusion: false });
            sonda = contarEscriturasDelHilo();
            for (let i = 0; i < 100; i++) {
                cb.onToken('c', 'CTO');
                cb.onToken('f', 'CFO');
            }
        });

        const total = sonda!.total();
        sonda!.cancelar();

        // Antes de 4.8: 200 escrituras, una por token, cada una con su `.map()`
        // sobre el hilo entero. Ahora: 1.
        expect(total).toBe(1);
        expect(porRol('CTO')!.content).toBe('c'.repeat(100));
        expect(porRol('CFO')!.content).toBe('f'.repeat(100));
    });

    it('el fotograma vacía solo, sin esperar al final del stream', async () => {
        // Lo importante para el usuario: el texto aparece MIENTRAS llega, no de
        // golpe al terminar. El vaciado del cierre es la red, no el mecanismo.
        abrirJunta();
        await enviar(async (cb) => {
            cb.onToken('primera parte ', null);
            // Un fotograma de verdad.
            await new Promise<void>((r) => requestAnimationFrame(() => r()));
            expect(mensajes()[1].content).toBe('primera parte ');
            cb.onToken('segunda parte', null);
        });

        expect(mensajes()[1].content).toBe('primera parte segunda parte');
    });

    it('las burbujas que no reciben nada conservan su referencia', async () => {
        // Es lo que permite que el `React.memo` de la burbuja (4.7) descarte el
        // render: si el `map` devolviera objetos nuevos para todas, el memo no
        // podría ahorrar nada y el buffer sólo habría movido el problema.
        abrirJunta();
        await enviar((cb) => {
            cb.onBoardAgent?.({ role: 'CTO', is_conclusion: false });
            cb.onBoardAgent?.({ role: 'CFO', is_conclusion: false });
            cb.onToken('sólo el CTO habla', 'CTO');
        });

        const antesDelUltimo = mensajes()[0];   // el turno del usuario
        const cfo = porRol('CFO')!;

        // Otro turno de tokens sobre el CTO: ni el usuario ni el CFO cambian.
        await enviar((cb) => cb.onToken('más', null));

        expect(mensajes()[0]).toBe(antesDelUltimo);
        expect(porRol('CFO')).toBe(cfo);
    });
});
