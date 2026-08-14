# VISUAL_CHECK — revisión visual del rediseño v3

**Rama:** `redesign/visual-identity-v3` · **Fecha:** 2026-08-07
**Método:** Vite dev server en `localhost:3000` + Chromium (playwright-core 1.62.1) a 390×844 (DPR 3, táctil) y 1440×900.
**Contrato:** `DESIGN.md`
**Capturas:** `/tmp/claude-1000/-home-jarvis-code-SPHERE/547aee8f-16bd-43c9-9f66-4f13b1f9915f/scratchpad/visual/`

> Todo lo que sigue marcado como **[VISTO]** procede de una captura que he abierto y mirado, o de un valor calculado en el navegador vivo. Lo marcado como **[DEDUCIDO]** procede de leer el código y **no** lo he visto renderizado. No se ha modificado ningún fichero del proyecto salvo este.

---

## 1. Veredicto en tres frases

**No, esto todavía no se puede enseñar a un cliente.** El producto por dentro (home, ajustes, sesión compartida, estados de error) sí ha adoptado la sala capitular y se ve bien —paño, latón, filetes, foco de latón, cero errores de consola, cero scroll horizontal—, pero **las tres pantallas de entrada (`/login`, `/register`, `/verify-email`) siguen siendo íntegramente el diseño viejo rechazado**: campo violeta en degradado, wordmark rosa→morado, botón primario morado→magenta y tarjeta de glassmorphism, con los inputs nuevos verde paño incrustados dentro. Son el primer pixel de toda carga en frío, así que hoy la app se presenta con dos sistemas visuales contradictorios en la misma pantalla, y además el botón primario del producto (`INICIAR NUEVO CHAT`) lleva texto blanco sobre latón a **≈2.2:1**, ilegible y muy por debajo del 8.96:1 que fija §2.3.

---

## 2. Superficies vistas, y a qué anchos

Todas capturadas a **390×844 primero** y luego a **1440×900**.

### Sin credenciales (accesibles de verdad)

| Superficie | Ruta | 390 | 1440 |
|---|---|---|---|
| Login | `/login` | `login-390.png` | `login-1440.png` |
| Registro | `/register` | `register-390.png` | `register-1440.png` |
| Verificación de correo | `/verify-email` → **redirige a `/login`** | `verify-email-390.png` | `verify-email-1440.png` |
| Sesión compartida (cargando) | `/share/:token` | `share-badtoken-390.png` | `share-badtoken-1440.png` |
| Sesión compartida (backend caído) | `/share/:token` | `share-backend-down-390.png` | `share-backend-down-1440.png` |
| Sesión compartida (404, enlace caducado) | `/share/:token` | `share-404-390.png` | `share-404-1440.png` |
| Ruta inexistente | `/esta-ruta-no-existe` → **redirige a `/login`** | `notfound-390.png` | `notfound-1440.png` |
| Registro, comprobación de recorte superior | `/register` | `register-390-scrolltop.png` | — |

### Detrás del login — alcanzadas sustituyendo el módulo de auth en vuelo

No tengo credenciales y el backend no está levantado. Para llegar igualmente intercepté con Playwright la petición del módulo `/src/contexts/AuthContext.tsx` y serví un stub que devuelve un usuario ficticio, y stubeé `localhost:8000` con respuestas vacías. **No se tocó ningún fichero en disco.** Lo que se ve es por tanto la UI con datos vacíos o inválidos, no con datos reales.

| Superficie | Ruta | 390 | 1440 |
|---|---|---|---|
| Home / chat vacío | `/` | `home-chat-390.png` | `home-chat-1440.png` |
| Perfil | `/profile` | `profile-390.png` | `profile-1440.png` |
| Ajustes | `/settings` | `settings-390.png` | `settings-1440.png` |
| Ajustes de chat | `/chat/settings` | `chat-settings-390.png` | `chat-settings-1440.png` |
| Facturación (esqueletos de carga) | `/billing` | `billing-390.png` | `billing-1440.png` |
| Admin (cayó en ErrorBoundary) | `/admin` | `admin-390.png` | `admin-1440.png` |

### Foco de teclado

`focus-login-tab3.png`, `focus-login-tab6.png`, `focus-home-tab3.png`, `focus-home-tab6.png`, `focus-primary-button-1440.png`, `focus-newchat-1440.png`, `focus-search-1440.png`.

---

## 3. Qué NO he podido ver, y por qué

Esta lista es parte del entregable: es lo que llegará a producción sin verificación visual.

**Bloqueado por no haber backend ni sesión real (lo más grave, porque es donde vive la marca):**
- **Todo el debate en vivo**: transcript, turnos, burbujas de agente (§9.11), streaming de tokens.
- **§8.1 La Mesa / el Palco / la Sala** — el primer viewport de diseño del producto. No lo he visto ni en móvil ni en escritorio.
- **§8.2 La Aguja de Confianza** — no vista.
- **§8.3 El Sello** — no visto. Es «el fotograma con el que este producto se vende» según el propio DESIGN.
- **§8.4 El Rail / el Canto del orden del día** — no visto en ninguna de las dos formas.
- **§8.6 Sesión de Muestra**, **§8.7 Registro de Actuaciones**, **§8.8 Pluma del Acta**, **§8.9 Latido**, **§8.11 Deliberación**, **§8.12 Odómetro** — ninguno visto. Requieren eventos SSE reales.
- **§8.10 Cambio de Sala** (View Transitions entre rutas) — no verificado.
- **El acta / panel de artefactos** y por tanto `.doc-prose`.
- Modales, toasts, tooltips, tablas y pestañas reales (§9.4–§9.8) con contenido.
- Contenido real de Facturación (se quedó en esqueletos) y de Admin (cayó en el ErrorBoundary por culpa de mi stub, no del código).
- `/chat/:sessionId` y `/agents/:agentId`.

**Literata (§3.3) — NO VERIFICADA.** [VISTO] El fichero `literata-var.woff2` se descarga correctamente (200) y el `@font-face` está bien declarado, pero en **las nueve superficies alcanzadas** `document.fonts.check('16px Literata')` devuelve `false`: ninguna superficie alcanzable usa `--font-serif`. Solo la usa `.doc-prose` (`index.css:388`), que vive en el acta. **No he visto un solo carácter de Literata renderizado.** Que cargue no está demostrado; que se aplique, tampoco.

**Otros huecos:**
- **Tema claro**: no evaluado en absoluto.
- **`prefers-reduced-motion`** (§7.6): no verificado.
- **Movimiento y rendimiento** (§7): las capturas son estáticas; no he medido animaciones, curvas ni presupuesto de bucles.
- **Dispositivo real / Safari iOS**: todo es Chromium de escritorio emulando móvil. `env(safe-area-inset-*)`, `h-dvh` y el gesto de swipe no se pueden juzgar así.
- **`/verify-email`**: la ruta existe pero estando deslogueado redirige a `/login`, así que su contenido propio no se ha visto. Lo que se sabe de ella es [DEDUCIDO] de `VerifyEmailPage.tsx`.

---

## 4. Fallos encontrados

Severidad por lo que sufre el usuario.

| Sev | Qué se ve | Dónde | Captura |
|---|---|---|---|
| **P0** | **Las pantallas de entrada son el diseño viejo entero.** Campo violeta en degradado, wordmark rosa→morado con `bg-clip-text`, botón primario morado→magenta, tarjeta `backdrop-blur-xl` (glassmorphism, prohibido en §0). Dentro conviven los inputs nuevos verde paño: dos sistemas visuales chocando en la misma pantalla. Es el primer pixel de toda carga en frío. [VISTO] | `LoginPage.tsx:74,78,87,126,163`; `RegisterPage.tsx:86,90,99,150`; `VerifyEmailPage.tsx:69,72,74,91` | `login-390.png`, `login-1440.png`, `register-390.png`, `register-1440.png` |
| **P0** | **El botón primario del producto lleva texto blanco sobre latón: ≈2.2:1.** Medido en vivo: relleno `linear-gradient(to right, oklch(0.76 0.12 82), oklch(0.68 0.115 82))` y `color: rgb(255,255,255)`. §2.3 exige relleno **sólido** `brass-500` con texto `baize-950` = 8.96:1, y dice literalmente que «no necesita sombra ni degradado». Aquí tiene degradado **y** sombra. [VISTO] | `ChatPanel.tsx:338` | `home-chat-1440.png`, `focus-primary-button-1440.png` |
| **P1** | **En móvil el cajón lateral se abre solo en todas las rutas** y tapa la aplicación entera tras un velo desenfocado. El usuario aterriza en el menú, no en el producto. `isSidebarOpen` nace en `true`, lo cual solo es correcto en `lg+`, donde la barra es fija. [VISTO] | `useChatStore.ts:225`; `MainLayout.tsx:101-112` | `home-chat-390.png`, `settings-390.png` |
| **P1** | **La sesión compartida se queda en «Cargando conversación…» para siempre** si el backend no responde (conexión rechazada): sin timeout, sin mensaje, sin reintento. Es la única superficie pública y el canal de adquisición. (Con 404 sí resuelve bien.) [VISTO] | `SharedSessionPage.tsx` | `share-backend-down-390.png`, `share-backend-down-1440.png` |
| **P1** | **Sin variables de entorno de Firebase la app entera renderiza una página en blanco absoluta**, sin error boundary en la raíz: `FirebaseError: Firebase: Error (auth/invalid-api-key)` revienta en el arranque del módulo y no queda nada en pantalla, ni un mensaje. Un despliegue mal configurado da pantalla blanca muda. [VISTO] | `lib/firebase.ts`, `main.tsx` (sin boundary raíz) | primera pasada, `textLen=0` en las 10 superficies |
| **P1** | **Avatar de usuario en degradado índigo→morado** (`bg-gradient-to-br from-indigo-500 to-purple-600`, medido: `oklch(0.585 0.233 277)` → `oklch(0.558 0.288 302)`). §2.5 reserva la anilina violeta **solo** para el sello; §0 rechaza expresamente el degradado morado→azul. Se ve en la barra lateral de todas las pantallas y a 128px en Perfil. [VISTO] | `Sidebar.tsx:420`; `ProfilePage.tsx:155`; `MessageBubble.tsx:218` | `home-chat-1440.png`, `profile-1440.png` |
| **P1** | **Resplandor de neón cian heredado en el botón primario**: `box-shadow: rgba(0,240,200,0.15) 0 0 40px`, y a 60px en hover. Es el glow que §0 rechaza («casi-negro + neón + glow… es exactamente la app de hoy»). Sobrevivió porque es un `rgba` crudo dentro de un valor arbitrario de Tailwind, invisible a cualquier auditoría de tokens. [VISTO, medido] | `ChatPanel.tsx:338` | `home-chat-1440.png` |
| **P2** | **Los colores de identidad de los directores no se migraron.** Siguen los hex de la columna «Hex hoy» de §2.8: Oberon `#8A63D2`, Nexus `#00C1B3`, Vortex `#E34A95`, Ledger `#6B8AFD`, Némesis `#FF4D6D`, grupo `#00F0C8`, y los agentes personalizados nacen en `#00f2ff`. §2.8 da valores nuevos precisamente para que los cinco pasen AA sobre las cuatro superficies de paño; Oberon con el hex viejo da ≈4.47:1 sobre `baize-950`, por debajo de AA. [DEDUCIDO — no he visto un debate] | `useChatStore.ts:124,135,146,157,168,184,276,301` | — |
| **P2** | **No hay pantalla 404.** `path="*"` redirige a `/`, que a su vez rebota a `/login`. Una URL mal tecleada deja al usuario en el login sin explicación. [VISTO] | `App.tsx:139` | `notfound-390.png`, `notfound-1440.png` |
| **P2** | **`#00F5D4` y `#9D85FF` siguen vivos como literales** en el tema de Mermaid y en tarjetas de artefacto. No los he visto renderizados (viven detrás del acta), pero están en el código. [DEDUCIDO] | `MermaidDiagram.tsx:11,13,14,19`; `ArtifactCard.tsx:82`; `AgentCreationWizard.tsx:94`; `MessageBubble.tsx:155`; `BoardWarRoom.tsx:73` | — |
| **P2** | **`AuroraBackground` sigue montado** en la raíz. Los blobs están apagados (`.aurora-blob{display:none}`, correcto), pero queda vivo un `<div class="absolute inset-0 bg-midnight/20 backdrop-blur-[120px]">` a pantalla completa: una capa compuesta con desenfoque de 120px que no aporta nada y difumina el grano del paño. [VISTO, medido: `backdrop-filter: blur(120px)`] | `App.tsx:17,148`; `AuroraBackground.tsx:75` | — |
| **P2** | **En Perfil hay dos avatares a la vez**: el cuadrado morado con la inicial y, a su derecha, un icono grande de persona en trazo. Parece un fallback duplicado. Debajo queda un guion suelto donde iría el nombre. [VISTO] | `ProfilePage.tsx` | `profile-1440.png` |
| **P2** | **El correo se muestra en monoespaciada y versalitas** (`DEMO@SPHERE.TEST`) en Perfil. §3.3 reserva JetBrains Mono a código y diagramas. [VISTO] | `ProfilePage.tsx` | `profile-1440.png` |
| **P3** | **A 390px el `<h1>` del registro queda pegado al borde superior** (medido: `top = 0px` con la página arriba del todo, `scrollHeight` 855 vs `innerHeight` 844). No está recortado, pero no respira y parece cortado. Lo provoca `min-h-screen flex items-center` con contenido más alto que el viewport. [VISTO] | `RegisterPage.tsx:86` | `register-390.png`, `register-390-scrolltop.png` |
| **P3** | **`min-h-screen` en vez de `h-dvh`**, que §4.3 prohíbe expresamente por el hueco de Safari móvil. [VISTO en código, no verificable en Chromium] | `App.tsx:147`; `LoginPage.tsx:74`; `RegisterPage.tsx:86`; `VerifyEmailPage.tsx:69`; `RequireAuth.tsx:13`; `SharedSessionPage.tsx:41` | — |
| **P3** | **Radios fuera de escala.** El botón primario mide 16px de radio (`rounded-2xl`) y el icono del hero 36px (`rounded-[36px]`). §0/§6 fijan 2/4/8/12px. [VISTO, medido `border-radius: 16px`] | `ChatPanel.tsx:313,338` | `home-chat-1440.png` |
| **P3** | **Mezcla de voseo y tuteo.** «Ocurrió un error inesperado. Por favor, **intentá** nuevamente… **recargá** la página» y «empezá a usar» conviven con «Crea tu experto», «Envía una decisión», «Tu equipo». [VISTO] | `ErrorBoundary.tsx`, `RegisterPage.tsx` | `admin-1440.png`, `register-390.png` |
| **P3** | **Jerga interna en la UI**: «Se inyecta en el system prompt de los agentes (USER_CONTEXT)» y el pie «POWERED BY SPHERE NEURO-LINK V2.0», que además es voz de la marca anterior. [VISTO] | `settings`, `ChatPanel.tsx` | `settings-1440.png`, `home-chat-1440.png` |
| **P3** | **Iconos de sección en colores dispares** (latón, verde `success`, oxblood) usados de forma decorativa. §2 hace del latón el único metal estructural. [VISTO] | `settings` | `settings-1440.png` |

**Resumen:** 2 P0 · 5 P1 · 6 P2 · 6 P3 = **19 fallos**.

---

## 5. Errores de consola

**En las cinco superficies públicas, con las variables de entorno puestas: cero errores y cero avisos**, a 390 y a 1440. Las dos fuentes precargadas responden 200. Literal de la comprobación:

```
login@390          errores=0 warnings=0 hScroll=false scrollW=390/390
register@390       errores=0 warnings=0 hScroll=false scrollW=390/390
verify-email@390   errores=0 warnings=0 hScroll=false scrollW=390/390
share-badtoken@390 errores=0 warnings=0 hScroll=false scrollW=390/390
notfound@390       errores=0 warnings=0 hScroll=false scrollW=390/390
(idéntico a 1440)
TOTAL errores en superficies publicas: 0

200 http://localhost:3000/fonts/archivo-var.woff2
200 http://localhost:3000/fonts/literata-var.woff2
```

**Sin `.env` (primera pasada), en las 10 superficies, literal:**

```
FirebaseError: Firebase: Error (auth/invalid-api-key).
```

Con `textLen=0` en las diez: página en blanco absoluta.

**Detrás del login.** Estos dos proceden de que mis stubs devolvieron formas de datos que la UI no espera; **son artefactos de mi instrumentación, no fallos del rediseño**, y los dejo literales para que nadie los persiga:

```
[home-chat@390] TypeError: Cannot read properties of undefined (reading 'length')

[admin@390] TypeError: users.map is not a function
    at AdminPage (http://localhost:3000/src/pages/AdminPage.tsx:200:17)
[admin@390] ErrorBoundary caught an error: TypeError: users.map is not a function
[admin@390] Component stack:
    at AdminPage (http://localhost:3000/src/pages/AdminPage.tsx:10:31)
    at ErrorBoundary (http://localhost:3000/src/components/shared/ErrorBoundary.tsx:5:5)
```

---

## 6. Cumplimiento del contrato, sección por sección

Solo las secciones que he podido juzgar de verdad.

| § | Veredicto | Evidencia |
|---|---|---|
| **§2 Paleta** | **Parcial.** El tema oscuro es correcto en el producto: `body` en `oklch(0.155 0.018 158)` = `baize-950` exacto, texto en `oklch(0.945 0.006 95)` = `ink-100`. Pero las tres pantallas de entrada usan la paleta cruda de Tailwind (`purple-900`, `pink-600`, `gray-800`), los avatares son morados y las identidades de agente siguen sin migrar. | `login-*.png`, `home-chat-1440.png` |
| **§2.5 Anilina solo para el sello** | **Incumplido.** El violeta aparece en avatares de usuario en todas las pantallas. | `profile-1440.png` |
| **§3.1 Carga de fuentes** | **Cumplido.** Auto-hospedadas, precargadas antes de la hoja de estilos, 200 en red, cero `@import` de Google Fonts en el CSS vivo (verificado recorriendo `document.styleSheets`). | red |
| **§3.3 Asignación tipográfica** | **Parcial / no verificable.** Archivo carga y se aplica en todo el cromo. **Literata no se ha visto renderizada en ninguna superficie alcanzable.** | `document.fonts.check` |
| **§4.3 Móvil primero** | **Incumplido en lo esencial.** No hay desbordes horizontales (bien), pero el cajón tapa el producto en todas las rutas a 390px, y las pantallas de entrada no están diseñadas a 390px. Además `min-h-screen` sigue en seis sitios donde §4.3 exige `h-dvh`. | `home-chat-390.png`, `settings-390.png` |
| **§6 Radios** | **Parcial.** Tarjetas e inputs con radios cortos; el botón primario a 16px y el icono del hero a 36px se salen. | `home-chat-1440.png` |
| **§8.5 Grano del paño** | **Cumplido, y es lo mejor del trabajo.** Verificado en vivo: `background-image: url("/textures/baize-128.webp")` con `background-blend-mode: overlay` en `body`, y la lámpara como `body::before` con `position: fixed` — exactamente el `radial-gradient(120% 90% at 12% -8%, …)` que pide el documento. Los blobs están apagados. | `home-chat-1440.png` |
| **§8.1–8.4, 8.6–8.12** | **No verificable.** Ninguno de los once efectos restantes se ha podido ver. | — |
| **§9.1 Botón** | **Incumplido en el primario** (degradado + sombra + texto blanco). Los secundarios y los de latón perfilado sí se ven correctos. | `home-chat-1440.png` |
| **§9.2 Input** | **Cumplido.** Relleno de paño, filete de control visible, foco de latón, etiquetas en versalitas micro. Se ven bien incluso incrustados en la tarjeta violeta del login. | `login-390.png`, `settings-1440.png` |
| **§9.12 Skeleton** | **Cumplido.** Bloques de paño con radios cortos, sin brillo ni degradado. | `billing-1440.png` |
| **§9.14 Estado vacío / error** | **Cumplido.** El 404 de sesión compartida y el ErrorBoundary son sobrios y de marca (oxblood para el aviso, latón para la acción). Sobra aire vertical, pero no está roto. | `share-404-390.png`, `admin-1440.png` |
| **§12.2 Foco visible** | **Cumplido.** Recorrido con Tab (14 saltos en login-390 y en home-1440): **todos** los elementos accionables muestran anillo. Medido sobre el botón primario, el de nuevo chat y el buscador: `outline: 2px solid oklch(0.82 0.1 82)` = `brass-400` exacto, el valor que fija §2.3. Confirmado también a ojo. No hay ningún `outline-none` en `src`. | `focus-home-tab6.png`, `focus-primary-button-1440.png` |
| **§13.1 Tokens prohibidos** | **Cumplido en la letra, incumplido en el espíritu.** Cero `#00F5D4`/`#9D85FF` en el CSS compilado y cero clases muertas — pero el diseño viejo sobrevive como **utilidades crudas de Tailwind** y **`rgba()` dentro de valores arbitrarios**, que ninguna auditoría de tokens puede ver. Ahí está el hueco que dejó pasar los dos P0. | 21 ficheros con paleta cruda, 41 usos de `gray-*` |

---

## 7. Lo que se ve bien — no lo toquéis

Honestamente, hay bastante trabajo bueno aquí y sería fácil estropearlo al arreglar lo de arriba:

1. **El grano del paño y la lámpara (§8.5) están perfectos.** Sutiles, baratos, y dan exactamente la sensación de tejido en penumbra que pide el documento. Es la decisión más distintiva del rediseño y está bien ejecutada.
2. **El tema oscuro es el correcto y sale por defecto.** El bloqueante B1 **no** está vivo: `baize-950` e `ink-100` son los valores exactos del contrato.
3. **El foco de latón es impecable y universal.** 2px de `brass-400`, en todo lo accionable, sin una sola excepción. La regla `:where()` con especificidad 0 fue una buena decisión y ha aguantado.
4. **La jerarquía tipográfica funciona de verdad.** Archivo carga y se aplica; las etiquetas en versalitas micro con tracking se distinguen sin esfuerzo del cuerpo; el texto primario y el secundario **ya no se ven iguales**. El problema histórico está resuelto.
5. **Cero scroll horizontal en las diez superficies públicas, a 390 y a 1440.** Medido, no supuesto.
6. **La home de escritorio, los ajustes y la sesión compartida ya son la sala capitular.** Paño, latón, filetes de 1px, cero glass. Si el cliente entrara por ahí, la conversación sería otra.
7. **Los estados de error y los esqueletos son sobrios y de marca.**
8. **El shim de tokens heredados fue la decisión correcta**: es lo que hace que el interior del producto se vea nuevo sin repintar 660 usos a mano.

---

## 8. Nota de método

- Servidor: `./node_modules/.bin/vite --port 3000`, arrancado con variables Firebase ficticias **solo en el entorno del shell** (`VITE_FIREBASE_*`), sin crear ni modificar ningún `.env`. No se ejecutó ningún build.
- Las superficies autenticadas se alcanzaron interceptando la respuesta HTTP del módulo `AuthContext.tsx` en el navegador. Ningún fichero del repositorio fue modificado; `git status` sigue limpio salvo por este documento.
- El servidor de desarrollo quedó detenido al terminar.
