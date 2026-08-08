import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // 7.4 · D43 — `any` pasa de aviso a ERROR.
      //
      // `tseslint.configs.recommended` lo deja en `warn`, y un aviso que nadie
      // lee no es un control: el repo llegó a 112 `any` así. Un `any` en el
      // borde de la red no es «no sé qué llega», es apagar el comprobador de
      // tipos para todo lo que toque ese valor después. Costó tres bugs reales
      // encontrados al quitarlos (la forma inventada de `AgentDocument`, el
      // `detail` de FastAPI leído sin comprobar, `t.delta` pintado como
      // «undefined» en verde).
      //
      // Si algún día hace falta uno de verdad —un límite de una librería
      // externa que no se puede tipar—, va con `eslint-disable-next-line` Y un
      // comentario que diga por qué. A fecha de hoy no hay ninguno.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // Accesibilidad: las SIETE reglas que DESIGN §12.14 exige en modo error, ni
    // una más ni una menos. Es una devDependency, 0 KB de runtime.
    //
    // Por qué en error y no en warn: sin puerta dura, la regresión de
    // accesibilidad es cuestión de semanas — y el punto de partida de este
    // repo es 41 `<label>` con 0 `htmlFor`, 4 modales sin `role="dialog"` y
    // subir un documento imposible por teclado. Un aviso que nadie lee no es
    // un control.
    //
    // OJO AL EJECUTARLO HOY: estas reglas ya reportan el backlog que la FASE 1
    // viene a cerrar (D06 etiquetas, D08 diálogos, D14 dropzones, D16 acciones
    // por hover). No son regresiones nuevas: son la lista de trabajo de las
    // tareas 1.7 a 1.11, y ahora está contada y no se puede ampliar sin que
    // salte. Cuando la fase 1 acabe, esto debe salir limpio.
    files: ['**/*.{ts,tsx}'],
    plugins: { 'jsx-a11y': jsxA11y },
    rules: {
      'jsx-a11y/label-has-associated-control': 'error',
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/role-has-required-aria-props': 'error',
      'jsx-a11y/no-noninteractive-element-interactions': 'error',
      'jsx-a11y/click-events-have-key-events': 'error',
      'jsx-a11y/no-static-element-interactions': 'error',
    },
  },
])
