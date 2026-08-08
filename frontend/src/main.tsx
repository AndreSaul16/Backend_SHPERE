/**
 * Punto de entrada.
 *
 * `App` se importa de forma DINÁMICA a propósito. Con el `import` estático que
 * había, cualquier fallo al evaluar el grafo de módulos —el caso real:
 * `lib/firebase.ts` reventando con `auth/invalid-api-key` porque faltaba una
 * variable de entorno— ocurría antes de que React montara nada y dejaba la app
 * entera en una página en blanco absoluta, sin ni un mensaje. Un
 * `<ErrorBoundary>` de React no puede cubrir eso: sólo captura errores de
 * render de sus hijos, y aquí no llegaba a haber hijos.
 *
 * Con el `import()` dinámico el fallo es un rechazo de promesa que sí se puede
 * capturar, y entonces se pinta `<StartupError>` en vez del vacío.
 *
 * Las dos redes son complementarias y hacen falta las dos:
 *   - `catch` del import  → fallo al CARGAR la aplicación.
 *   - `<ErrorBoundary>`   → fallo al RENDERIZARLA.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import { ErrorBoundary } from './components/shared/ErrorBoundary'
import { StartupError } from './components/shared/StartupError'
import { inicializarDensidad } from './lib/densidad'
import { inicializarTema } from './lib/tema'

// 5.7 · Q11 — la densidad se fija ANTES del primer pintado. Hacerlo en un
// efecto de React haría que la primera pintura fuera con las filas de 44px y
// la segunda con las de 34: un salto de layout en cada arranque para quien ha
// elegido compacto.
inicializarDensidad()

// 6.11 · D61 — el tema también se fija antes del primer pintado, y por el mismo
// motivo: leerlo en un efecto de React pintaría la primera pantalla en paño y
// la segunda en papel. Devuelve la baja del oyente de `prefers-color-scheme`,
// que aquí no se usa porque este oyente vive lo que vive la pestaña.
inicializarTema()

const root = createRoot(document.getElementById('root')!)

import('./App')
  .then(({ default: App }) => {
    root.render(
      <StrictMode>
        <ErrorBoundary fallback={<StartupError error={null} />}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ErrorBoundary>
      </StrictMode>,
    )
  })
  .catch((error: unknown) => {
    console.error('SPHERE no ha podido arrancar:', error)
    root.render(<StartupError error={error} />)
  })
