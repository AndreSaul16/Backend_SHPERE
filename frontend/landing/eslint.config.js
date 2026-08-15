import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },

  // Fuente de la landing: navegador, TypeScript con tipos.
  {
    files: ['src/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-restricted-syntax': [
        'error',
        {
          // DIRECCION §3.0 / §0.2.7: ScrollSmoother y Observer prohibidos.
          selector:
            "ImportDeclaration[source.value=/(ScrollSmoother|[/]Observer)/]",
          message: 'DIRECCION §3.0: solo ScrollTrigger, SplitText y DrawSVGPlugin.',
        },
      ],
    },
  },

  // Tests y configuración: Node.
  {
    files: ['test/**/*.ts', 'vite.config.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: globals.node,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },

  // Scripts one-off de generación de activos (JS plano, Node).
  //
  // Llevan los globals del navegador ADEMÁS de los de Node porque el cuerpo de
  // un `page.evaluate(() => …)` es una función que se serializa y se ejecuta
  // DENTRO de Chromium: ahí `document` y `window` existen, aunque el fichero
  // que los contiene lo ejecute Node.
  {
    files: ['scripts/**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
      ecmaVersion: 2023,
      sourceType: 'module',
    },
  },

  // El propio fichero de configuración de ESLint.
  {
    files: ['eslint.config.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
);
