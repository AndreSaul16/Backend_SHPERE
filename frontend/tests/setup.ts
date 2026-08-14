import '@testing-library/jest-dom';
import { beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { MotionGlobalConfig } from 'framer-motion';
import { setupServer } from 'msw/node';
import { handlers } from './mocks/handlers';
import { olvidarSiEsAdmin } from '../src/hooks/useEsAdmin';

// Framer Motion sin animación en los tests.
//
// Motivo: con `AnimatePresence`, un elemento que sale sigue montado hasta que su
// animación de salida acaba, y en jsdom esa animación depende de un bucle de
// rAF que con temporizadores falsos no avanza. Sin esto, «el toast se cierra» y
// «el modal se ha ido» se vuelven inverificables — o peor, se «arreglan» con
// esperas arbitrarias que dejan el test verde por casualidad.
//
// Es lo mismo que hace `prefers-reduced-motion` en producción (DESIGN §7.6), o
// sea que se prueba un camino que la app ya tiene que soportar.
MotionGlobalConfig.skipAnimations = true;

export const server = setupServer(...handlers);

// Establecer mocks de API antes de todos los tests
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

// Resetear handlers después de cada test para evitar interferencias
afterEach(() => server.resetHandlers());

// «¿Soy admin?» se responde UNA vez por sesión y se cachea a nivel de módulo
// (QA-4): es lo que evita las ~11 peticiones por remontaje del shell. Esa caché
// no la limpia `vi.clearAllMocks()`, así que sin esto el primer test de cada
// fichero le dictaría la respuesta a todos los siguientes.
beforeEach(() => olvidarSiEsAdmin());

// Limpiar después de todos los tests
afterAll(() => server.close());

// Mock de DOM APIs que JSDOM no soporta
window.HTMLElement.prototype.scrollIntoView = vi.fn();
window.HTMLElement.prototype.scrollTo = vi.fn();

// jsdom no implementa ResizeObserver. La tira de pestañas del panel de
// artefactos lo usa para saber si desborda (§9.8, el desvanecido de los
// cantos); sin este doble, montar el panel revienta con un ReferenceError.
// Nunca dispara: en jsdom no hay layout que medir, y el estado por defecto
// —«no desborda»— es el que corresponde.
class ResizeObserverDoble {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}
globalThis.ResizeObserver ??= ResizeObserverDoble as unknown as typeof ResizeObserver;
