import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './tests/setup.ts',
        // `landing/` es otro proyecto: otro Vite, otro Tailwind, otro vitest
        // (entorno `node` y happy-dom, no jsdom) y su propia suite, que corre
        // desde `frontend/landing` en el job `test-landing` de CI.
        //
        // Sin esta exclusión, el patrón por defecto de vitest recoge
        // `landing/test/*.test.ts` y esta suite pasó de 129 ficheros/1101 tests
        // a 138/1184, con dos ficheros en fallo por dependencias que sólo están
        // instaladas allí (happy-dom). Medido, no supuesto.
        //
        // Se conservan los `exclude` por defecto: sobrescribirlos a secas
        // devolvería node_modules y dist al escaneo.
        exclude: [...configDefaults.exclude, 'landing/**'],
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
        coverage: {
            reporter: ['text', 'json', 'html'],
            exclude: ['node_modules/', 'tests/setup.ts'],
        },
    },
});
