# PLAN_REFACTOR_FRONTEND_V3 — Rediseño visual y de UX del frontend de SPHERE

**Fecha:** 2026-07-29 · **Alcance:** `frontend/` (47 `.tsx`, 16 `.ts`, 14.286 LOC) · **Contrato visual:** [`DESIGN.md`](./DESIGN.md) · **Verdad de producto:** [`PRODUCT.md`](./PRODUCT.md)

Todo dato de este documento está verificado contra el código. Los recuentos de clases muertas se obtuvieron **compilando `src/index.css` con el propio pipeline PostCSS del proyecto** y diffando cada token de clase contra el CSS emitido, no por inspección visual. Los ratios de contraste están calculados. Donde hay una cifra, hay una medición.

---

## 1. Resumen ejecutivo

El frontend de SPHERE es **funcionalmente muy completo y visualmente no existe**. Hay 108 tests en verde, `tsc --noEmit` limpio, un protocolo SSE de nueve eventos de dominio con debate paralelo, votos persistidos, actas accionables, juntas programadas y facturación por créditos: la ingeniería de producto está hecha. Lo que no está hecho es que se vea.

La causa raíz es una sola y es mecánica: **`tailwind.config.js` no lo lee nadie.** Tailwind v4 sólo carga un config legacy con una directiva `@config`, y `index.css` no la tiene. Los tokens que la app cree tener (`text-text-primary`, `text-text-secondary`, `text-agent-cto`, `surface-elevated`) viven allí o en ningún sitio, así que **302 declaraciones de color no generan una sola línea de CSS**. A eso se suma que `@tailwindcss/typography` no está instalado y las 16 declaraciones `prose-*` tampoco existen — y como el Preflight de Tailwind pone `h1-h6` en `font-size: inherit`, `ul/ol` en `list-style: none` y `a` en `color: inherit`, **el acta de la junta, que es el entregable del producto, se renderiza como un muro de texto gris sin encabezados, sin viñetas y sin enlaces distinguibles**.

Debajo de eso hay un suelo de accesibilidad en cero: 69 controles de formulario y **0 `htmlFor`**; 32 `outline-none` y **0 `focus-visible`**; 4 modales y **0 `role="dialog"`**; **0 `aria-live`** en una app cuyo contenido llega en streaming. Y una tipografía que no existe como sistema: **155 usos de texto de 8 a 11px**, incluido el recuento de votos y el saldo de créditos.

A dónde lo llevamos: a una **sala capitular**. Paño verde, latón, oxblood para el disenso, papel para el acta y un sello de anilina violeta que cae una vez, cuando el debate se convierte en constancia. Materia en lugar de luz: se retiran los tres blobs de 700px con `blur(100px)` en bucle infinito y el `backdrop-blur(120px)` a pantalla completa, y se sustituyen por un grano de tejido tileado de 3 KB. El efecto más distintivo es también el más barato. Ese es el indicador de que la dirección es correcta.

Ocho fases, ~24-31 días de una persona. Las fases 0 y 1 (5-7 días) ya arreglan el 80% de lo que hoy se ve roto.

---

## 2. Auditoría del estado actual

### 2.1 Sistema visual: qué hay hoy, exactamente

| Fichero | Qué es | Veredicto |
|---|---|---|
| `frontend/src/index.css` (96 líneas) | **La única** fuente de verdad viva. `@theme` con 11 colores, 2 familias, 2 animaciones + 4 clases de utilidad (`.glass-panel`, `.glass-card`, `.glass-input`, `.aurora-blob`) | Insuficiente: sin tokens de texto, sin semánticos, sin identidades de agente, sin escala tipográfica, sin radios, sin sombras, sin motion |
| `frontend/tailwind.config.js` (46 líneas) | Config v3 con la paleta «Midnight Protocol v1» | **CÓDIGO MUERTO.** Tailwind v4.3.3 no lo lee sin `@config`. Y sus hex **contradicen** al `@theme` vivo |
| `frontend/postcss.config.js` | `@tailwindcss/postcss` + `autoprefixer` | Correcto. `autoprefixer` es redundante en v4 pero inocuo |
| `frontend/index.html` (13 líneas) | Shell mínimo | `lang="en"` sobre UI en español · favicon = `vite.svg` de Vite · sin `<meta description>`, sin OG, sin `theme-color`, sin manifest |
| `frontend/public/` | `grid.svg`, `vite.svg` | Sin logo, sin fuentes, sin texturas, sin favicon propio |

**Conflicto de fuentes de verdad, medido:**

| Token | `tailwind.config.js` (muerto) | `index.css @theme` (vivo) | Hex en TSX |
|---|---|---|---|
| cian de marca | `#00F0C8` | `#00F5D4` | `#00F0C8` ×11, `#00F5D4` ×7, `#00F2FF` ×2 |
| morado | `#7B61FF` | `#9D85FF` | ambos |
| fondo | `#0A0A0F` | `#030305` | 6 tonos distintos: `#030305 #0A0A0F #0D0D12 #12121A #16161C #1C1C26` |

**88 hex y 30 `rgba()` hardcodeados** en `src`, con 34 y 23 valores distintos. Los 8 de Google/Microsoft en `LoginPage`/`RegisterPage` son logos OAuth legítimos; el resto es deuda.

**Tipografía:** `@import url('https://fonts.googleapis.com/...')` en `index.css:3` — CSS bloqueante que dispara otra cadena de peticiones, sin `preconnect`, sin `preload`, bajando 5 pesos de Inter + 2 de JetBrains Mono con todos los rangos unicode. FOUT garantizado. Escala tipográfica: no hay. Hay `text-[10px]` **107 veces**.

**Estado de las clases muertas (compilado y verificado):**

| Clase | Ocurrencias | Consecuencia |
|---|---|---|
| `text-text-secondary` (+ `/30 /40 /50 /60 /70`) | **192** | Todo el texto secundario hereda `text-gray-100`: **primario y secundario se ven idénticos** |
| `text-text-primary` | **105** | Sin color propio |
| `text-text-muted` | 3 | Sin color |
| `text-agent-{ceo,cto,cfo,cmo}` | 5 (en `useChatStore.ts`, `types/index.ts`) | La identidad Tailwind de los directores no existe; sólo funciona `hexColor` inline |
| `bg-surface-elevated`, `bg-text-secondary` | 2 | El punto de selector de modelo inactivo es **invisible** |
| `prose`, `prose-invert`, `prose-sm` + 13 `prose-*:` | **16** | **El acta y las conversaciones compartidas se renderizan sin tipografía** |
| `animate-pulse-slow`, `animate-in`, `fade-in` | 3 | Animaciones que no ocurren |
| **TOTAL** | **~326** | |

> Correcciones a supuestos habituales, verificadas compilando: `scrollbar-thin`, `scrollbar-none` y `scrollbar-thumb-*` **sí funcionan** (Tailwind 4.3 los trae de serie) y `bg-surface-highlight` **sí funciona** (`--color-surface-highlight` existe). No los reporte nadie como deuda.

### 2.2 Inventario componente por componente

`E`=estados que faltan · `A11y`=defectos de accesibilidad · `Resp`=prefijos responsive en el fichero · `T`=usa tokens

| Fichero | LOC | Qué hace | T | Resp | E | A11y | Veredicto |
|---|---|---|---|---|---|---|---|
| `components/modals/AgentCreationWizard.tsx` | **1454** | Asistente de 4 pasos para crear agentes | 12 hex en `PRESET_COLORS` | **3** | skeleton, cancelación de subida, confirmación al cerrar | 6 `<label>` sin `htmlFor`, 12 swatches sin nombre, radiogroup falso, dropzone `<div onClick>`, sin `role=dialog` | **Partir.** 19 `useState`, bug: `'deepseek-chat'` no está en `MODEL_OPTIONS` |
| `store/useChatStore.ts` | **1064** | God store: sesiones, mensajes, streaming, board, artefactos | 5 clases muertas + 8 hex | — | — | — | **Partir en slices.** `.map()` sobre todos los mensajes **por token** |
| `pages/AgentDetailPage.tsx` | 810 | Editor de agente custom | 32 clases muertas, 5 hex | 25 | skeleton, 404 vs red | modal sin `role`, 6 labels sueltos, `type=color` en `opacity-0` | Mejor página del repo en estados; ref muerta en 677-686 |
| `services/api.ts` | 793 | Cliente SSE + servicios REST | — | — | — | — | 17 `any`. El parser SSE es sólido |
| `components/chat/ChatPanel.tsx` | 628 | Chat, board, búsqueda, entrada | ok | **3** | sin virtualización, sin auto-grow del textarea | 4 iconos sin `aria-label`, sin `aria-live` en streaming | Suscribe al store **sin selector**: re-render completo por token |
| `pages/ChatSettingsPage.tsx` | 593 | Apariencia de la sesión + miembros | 31 clases muertas, 10 hex | 40 | loading del toggle | modal sin `role`, toggle sin nombre, `<div onClick>` | 🔴 **VIOLACIÓN DE RULES OF HOOKS** (early return :100, `useState` :152) |
| `components/agents/KnowledgeBasePanel.tsx` | 532 | Documentos del agente | 1 muerta | **0** | validación silenciosa, retry, error de borrado | **Subir es imposible por teclado**; badges sin nombre | 🔴 **3 fetch sin auth → 401** |
| `components/chat/MessageBubble.tsx` | 516 | Burbuja de mensaje + markdown | 9 muertas | 16 | — | acciones inalcanzables en táctil/teclado, `opacity-30` en hora | Parser regex de 180 líneas **dentro del JSX**, ejecutado por token |
| `pages/settings/ServiceCredentialsSettings.tsx` | 402 | Claves de API | 18 muertas | **0** | empty, skeleton | 4 labels sueltos, tooltip solo-hover, sin revelar clave | 🔴 4 rutas relativas → **404 en dev** |
| `components/sidebar/Sidebar.tsx` | 395 | Historial, perfil, navegación | 26 muertas | 14 | **sin empty state**, sin skeleton | `<button>` dentro de `<Link>` (HTML inválido) | 🔴 **Buscador decorativo**: sin `value` ni `onChange` |
| `pages/settings/IntegrationsSettings.tsx` | 386 | OAuth BYO | 14 muertas | **0** | empty; `working` no se limpia → botón bloqueado | copiar sin anuncio, 2 labels sueltos | 2 destructivas sin confirmar |
| `pages/BillingPage.tsx` | 346 | Créditos, packs, cuota | 28 muertas | 10 | success tras Stripe | progressbar sin `role`, `✕` sin nombre | **Único skeleton de la app.** Timers sin limpiar |
| `pages/settings/ProfileSettings.tsx` | 324 | Perfil largo, 5 secciones | 4 muertas | **0** | retry, `savedAt` no se limpia | **14 controles sin etiqueta**, 9 `<select>` sin `appearance-none` | `grid-cols-2` fijo rompe <340px. Ofrece tema «Claro» inexistente |
| `components/modals/AgentSelectorModal.tsx` | 297 | Selector de nuevo chat | ok | 2 | `isLoadingSession` nunca se pinta, sin «sin resultados» | sin `role=dialog`, búsqueda sin etiqueta, borrar sin confirmar | Contención invertida en el filtro (:62); 2 `catch {}` vacíos |
| `pages/settings/ScheduledBoardsSection.tsx` | 286 | Juntas recurrentes | 20 muertas | **0** | pending en borrado | **Mejor a11y del repo** (8 `aria-label`) | Borrado sin confirmar. Sólo UTC. `WEEKDAYS` con posible off-by-one |
| `pages/AdminPage.tsx` | 273 | Panel de admin | 24 muertas | **2** | `submitAdjust` sin `catch`, sin error en métricas | pestañas sin `role=tab` | Ajustar créditos **mueve dinero sin confirmación** |
| `pages/settings/ContactsSettings.tsx` | 260 | Lista blanca de contactos | 13 muertas | 1 | success al añadir | chips sin `aria-pressed` | Borrado sin confirmar en una **frontera de seguridad**. Muestra IDs crudos |
| `pages/ProfilePage.tsx` | 254 | Perfil de usuario | 14 muertas | 37 | avatar sin feedback | `<div onClick>` duplicado | 2 de 4 tarjetas son relleno. Estado «Online» falso |
| `pages/RegisterPage.tsx` | 251 | Registro | **ninguno** | **0** | validación en vivo | sin `autoComplete`, sin `role=alert` | **Segundo lenguaje visual.** Sin consentimiento legal. «empezá» |
| `pages/settings/BoardMeetingSettings.tsx` | 245 | Toggle de debate + juntas | 9 muertas | **0** | retry | modal sin nada, toggle sin nombre | **Duplica el mismo ajuste que `ChatSettingsPage`** con estado propio |
| `pages/LoginPage.tsx` | 226 | Login | **ninguno** | **0** | pending por proveedor | sin `autoComplete`, sin `role=alert`, `text-gray-500` ≈3.6:1 | **No existe recuperación de contraseña en toda la app.** 55 líneas duplicadas con Register |
| `store/useBillingStore.ts` | 200 | Saldo y paywall | — | — | — | — | Sólido. `waitForAuthReady` hace polling de 100ms hasta 5s |
| `pages/settings/AgentOverridesSettings.tsx` | 196 | Overrides por rol | 7 muertas | **0** | success | 3 labels sueltos | «Restaurar default» **borra un prompt escrito a mano sin confirmar** |
| `components/artifacts/ActaActions.tsx` | 196 | Exportar a Notion / GitHub | 5 muertas | **0** | disabled del toggle | expander sin `aria-expanded`, labels en minúscula inglesa | Re-parsea el acta **en cada tecla**. `JSON.parse` sin validar → crash |
| `contexts/AuthContext.tsx` | 184 | Firebase Auth | — | — | — | — | Correcto |
| `App.tsx` | 157 | Rutas | — | — | — | — | **Cero `React.lazy`.** Todo en el chunk inicial |
| `components/artifacts/ArtifactPanel.tsx` | 147 | Workspace de artefactos | ok | 2 | loading, error | tabs sin `role`, `<X>` sin nombre; **bajo `sm` los tabs son iconos sin etiqueta** | `/acta/i.test(title)` como feature flag |
| `components/layout/MainLayout.tsx` | 142 | Shell de 3 columnas | ok | 11 | — | tirador no operable por teclado | `window.innerWidth` **en el render** (:118): no reacciona al resize |
| `components/chat/BoardWarRoom.tsx` | 138 | Cabecera del debate | `text-gray-700` ≈1.6:1 | 1 | — | sin `role=meter` en los votos | `PHASE_LABELS` omite `'devil'` → `phaseIndex = -1` apaga todas las fases |
| `components/chat/ArtifactCard.tsx` | 131 | Tarjeta de artefacto | 6 muertas | **0** | — | — | `conic-gradient` girando **en bucle infinito por cada acta**, sin reduced-motion |
| `components/chat/ToolExecutionCard.tsx` | 130 | Ejecución de herramienta | 6 muertas | **0** | — | `<div onClick>` para expandir, sin `aria-expanded` | Buen manejo de fallo + reintento |
| `components/OnboardingChecklist.tsx` | 127 | Checklist de primer uso | ok | **0** | `loaded` nunca se pinta → parpadeo | pasos completados como `<button disabled>` | `useState({})[0]` usado como `useRef` y mutado |
| `pages/SettingsPage.tsx` | 124 | Shell de ajustes | 5 muertas | 10 | loading de sección | sin `aria-current` | **~1900 LOC en el chunk inicial** para pintar una pestaña |
| `pages/SharedSessionPage.tsx` | 118 | Conversación pública | 7 muertas | **0** | retry | sin `role=log`, distinción sólo por color | 🔴 **La cara pública del producto renderiza markdown sin estilo.** Sin `<title>`, sin OG |
| `components/artifacts/MermaidDiagram.tsx` | 117 | Diagrama mermaid | **11 hex** | **0** | **loading** | SVG sin `role=img` | `mermaid.initialize()` en **scope de módulo**. Error irrecuperable (ref desmontada) |
| `components/artifacts/DataGrid.tsx` | 115 | Tabla de datos | 2 hex | **0** | loading, sorting | `<th>` sin `scope` | 🐛 `parseRow` **descarta celdas vacías y desplaza las columnas** |
| `pages/VerifyEmailPage.tsx` | 114 | Verificación de email | **ninguno** | **0** | `resent` no se limpia | sin `role=status` | Polling cada 5s **indefinido**, sin `document.hidden`. Sin salida si el email está mal |
| `components/artifacts/CodeBlock.tsx` | 107 | Visor de código | 3 hex/rgba | **0** | empty | 2 iconos sin nombre, `text-[9px]` | Importa **todo** refractor (~1 MB). `clipboard` sin try/catch |
| `components/modals/BoardActivationModal.tsx` | 88 | Activar la junta | 1 rgba | **0** | spinner, **error** | cierre de ~24px, `⚡` porta significado | `onActivate(boolean)` es una trampa booleana |
| `components/shared/ErrorBoundary.tsx` | 79 | Límite de error | ok | **0** | — | `role="alert"` ✅ (el único correcto del repo) | Retry no resetea el subárbol → bucle infinito. No envuelve `ArtifactRenderer` |
| `components/AuroraBackground.tsx` | 78 | Fondo animado | ok | **0** | — | `useReducedMotion` ✅ (el único del repo) | 3 blobs de 600-700px con `blur(100px)` + `backdrop-blur(120px)` a pantalla completa |
| `components/CreditsIndicator.tsx` | 72 | Píldora de saldo | 2 muertas | **0** | **loading** | `<div onClick>` que navega; `text-red-400/60` ≈2.6:1 | **Un usuario con saldo ve «0 — Recargar» en cada montaje** |
| `pages/settings/ConnectionsSettings.tsx` | 67 | Shell de conexiones | 2 muertas | **0** | — | `<section>` sin `aria-labelledby` | Limpio, pero compone la página más larga del producto sin subnavegación |
| `components/artifacts/MarkdownViewer.tsx` | 63 | **Visor del acta** | **16 `prose-*` muertas** | 1 | todos | — | 🔴 **El entregable estrella sin tipografía** |
| `components/artifacts/ArtifactRenderer.tsx` | 46 | Switch de tipo | 2 muertas | **0** | loading, aislamiento de error | SVG sin `role=img` | 🔴 Importa `dompurify`, **no declarado en `package.json`** |
| `components/artifacts/MarkdownViewer` → `components/chat/DebateTemplates.tsx` | 32 | Chips de plantilla | ok | 1 | — | emoji sin `role=img` | Limpio |
| `components/common/ErrorOverlay.tsx` | 37 | Toast global de error | rojos crudos | **0** | **dismiss, stacking, retry** | **sin `role=alert`** | `return null` fuera de `AnimatePresence` → el `exit` nunca corre. `w-full`+`right-6` **se sale por la izquierda** |
| `components/modals/PaywallModal.tsx` | 35 | Muro de pago | **`slate`/`indigo`: cero tokens** | **0** | **todos** | sin `role=dialog`, **sin botón de cerrar**, velo sin `onClick` | `window.location.href` → **recarga completa** de la SPA |
| `components/RequireAuth.tsx` | 30 | Guarda de ruta | `bg-gray-900`, `text-purple-400` | **0** | spinner, timeout | sin `role=status` | **Es el primer pixel de cada carga en frío y está fuera de paleta.** Pierde la URL destino |

**Cobertura responsive: 30 de 47 ficheros `.tsx` tienen CERO prefijos responsive**, incluidos login, registro, las 8 secciones de ajustes, los 4 modales y `KnowledgeBasePanel` (532 LOC).

**Cobertura de accesibilidad, medida:** 14 `aria-label` · 2 `role=` · 0 `aria-live` · 0 `focus-visible` · 0 `htmlFor` (con 41 `<label>` y 69 controles) · 0 `tabIndex` · 1 `onKeyDown` · 1 `useReducedMotion` · 31 `title=` usados como etiqueta.

### 2.3 Rendimiento

| Hallazgo | Evidencia | Impacto |
|---|---|---|
| Cero code splitting | 0 `React.lazy` / `Suspense` en 47 ficheros | Todo en un chunk |
| `mermaid` estático | `MermaidDiagram.tsx:2` + `initialize()` en scope de módulo | ~600 KB ejecutados en arranque frío para todo usuario |
| `react-syntax-highlighter` completo | `CodeBlock.tsx:2` importa `Prism` (no `prism-light`) | ~1 MB de gramáticas |
| **Dos stacks de resaltado** | `rehype-highlight` + tema `highlight.js` en `MessageBubble.tsx:4,6` **y** Prism en `CodeBlock.tsx` | Peso duplicado |
| Ajustes eager | `SettingsPage.tsx:28-34` | ~1900 LOC para una pestaña |
| Fondo siempre compuesto | 3 blobs `blur(100px)` + `mix-blend-screen` + `backdrop-blur(120px)` a pantalla completa | GPU permanente en todos los dispositivos |
| Store sin selectores | `ChatPanel`, `Sidebar`, `ArtifactPanel`, `CreditsIndicator`, `AgentSelectorModal` | Re-render completo **por token de streaming** |
| Parser en el JSX | `MessageBubble.tsx:240-420` | Regex + construcción de array por token, por burbuja |
| `.map()` por token | `useChatStore.ts:651-660` | O(n) objetos nuevos por token |
| Sin virtualización | `ChatPanel.tsx:453` | Transcript largo = jank garantizado |
| Fuentes remotas | `index.css:3` | FOUT + cadena de peticiones |
| 4 constantes de build muertas | `vite.config.ts:7-13` | Config zombi de la StatusPage revertida |

---

## 3. Gaps y deuda técnica

| ID | Hallazgo | Fichero:línea | Sev | Coste | Acción |
|---|---|---|---|---|---|
| **D01** | `tailwind.config.js` no lo lee Tailwind v4 (sin `@config`) → **302 clases de color muertas**; y sus hex contradicen al `@theme` vivo | `frontend/tailwind.config.js` (todo); 26 ficheros | **P0** | S | Borrar el fichero. Declarar todos los tokens en `@theme inline` (DESIGN §13) |
| **D02** | El acta y la conversación compartida se renderizan **sin tipografía**: 16 `prose-*` muertas + Preflight anula h1-h6, listas y enlaces | `MarkdownViewer.tsx:44-54`, `MessageBubble.tsx:238`, `SharedSessionPage.tsx:87` | **P0** | M | Capa `.doc-prose` propia (DESIGN §13). **Sin instalar `@tailwindcss/typography`** |
| **D03** | Violación de Rules of Hooks: early return antes de `useState`/`useEffect` → «Rendered more hooks than during the previous render» | `ChatSettingsPage.tsx:100` vs `:152,:155` | **P0** | S | Subir los dos hooks por encima del guard |
| **D04** | Knowledge Base entera devuelve 401: 3 llamadas sin `Authorization` + shape mismatch (`DocumentListResponse` ≠ `AgentDocument[]`) | `KnowledgeBasePanel.tsx:115,224,243` (+`:117`) | **P0** | S | Usar `chatService.{getAgentDocuments,uploadAgentDocument,deleteAgentDocument}` |
| **D05** | `dompurify` importado pero **no declarado** en `package.json`; resuelve por hoisting de `mermaid` | `ArtifactRenderer.tsx:2` | **P0** | S | `npm i dompurify @types/dompurify` |
| **D06** | 0 `htmlFor` con 41 `<label>` y 69 controles: **ningún campo de la app está etiquetado** | todo `pages/`, `modals/` | **P0** | M | `<Field>` compartido con `id` autogenerado (`useId`) |
| **D07** | 32 `outline-none` y 0 `focus-visible`: no hay foco visible en toda la app | `index.css:77` + 31 sitios | **P0** | S | Regla global en `@layer base` (DESIGN §13) + borrar los `outline-none` |
| **D08** | 4 modales sin `role="dialog"`, `aria-modal`, trampa de foco, `Escape` ni restauración de foco | `AgentSelectorModal`, `AgentCreationWizard`, `BoardActivationModal`, `PaywallModal` | **P0** | M | Un `<Modal>` y adoptarlo en los cuatro |
| **D09** | 0 `aria-live` en una app cuyo contenido llega por streaming | global | **P0** | M | `aria-live="polite"` con throttle de 1s en el turno, saldo, toasts y resultado de guardado |
| **D10** | Buscador de sesiones **decorativo**: `<input>` sin `value`, sin `onChange`, sin estado | `Sidebar.tsx:161-165` | **P0** | S | Cablearlo, o quitarlo. Un control que no hace nada es peor que su ausencia |
| **D11** | `text-[8..11px]` **155 veces**, incluido recuento de votos y saldo | 107× `[10px]`, 25× `[11px]`, 19× `[9px]`, 4× `[8px]` | **P0** | M | Escala de DESIGN §3.2. Suelo 12px |
| **D12** | Contraste: `text-gray-700` ≈1.6:1, `text-gray-600` ≈2.6:1, `opacity-30`, `text-red-400/60` ≈2.6:1 en información real | `BoardWarRoom.tsx:106,111`, `ChatPanel.tsx:620`, `MessageBubble.tsx:507`, `CreditsIndicator.tsx:66` | **P0** | M | Tokens de DESIGN §2.2. Suelo `ink-500` (4.91:1) |
| **D13** | `<button>` dentro de `<Link>`: HTML inválido, elementos interactivos anidados | `Sidebar.tsx:233-241` | **P0** | S | Sacar el botón fuera del ancla |
| **D14** | Subir documentos **imposible por teclado**: dropzone `<div onClick>` + `<input type=file class="hidden">` | `KnowledgeBasePanel.tsx:475-486`, `AgentCreationWizard.tsx:1127-1139` | **P0** | S | `<button>` real + `sr-only` en el input |
| **D15** | `lang="en"` sobre interfaz en español | `index.html:2` | **P0** | S | `lang="es"` |
| **D16** | Acciones de mensaje **inalcanzables** en táctil y teclado (`opacity-0 group-hover:`) | `MessageBubble.tsx:443`, `KnowledgeBasePanel.tsx:461`, `AgentSelectorModal.tsx:254`, `AgentCreationWizard.tsx:1229` | **P0** | S | + `focus-within:opacity-100` + visibles en `(hover: none)` |
| **D17** | Cero code splitting: `mermaid` (~600 KB) + refractor completo (~1 MB) + 1454 LOC de wizard + ~1900 LOC de ajustes en el chunk inicial | `App.tsx`, `ArtifactRenderer.tsx`, `SettingsPage.tsx:28-34`, `CodeBlock.tsx:2`, `MermaidDiagram.tsx:2` | **P0** | M | `React.lazy` en rutas, artefactos, wizard y pestañas; `prism-light` + `registerLanguage` |
| **D18** | 8 acciones destructivas **sin confirmación** (una de ellas mueve dinero) | `AdminPage.tsx:187`, `AgentOverridesSettings.tsx:118`, `ContactsSettings.tsx:243`, `ScheduledBoardsSection.tsx:170`, `ServiceCredentialsSettings.tsx:387`, `IntegrationsSettings.tsx:351,370`, `ProfilePage.tsx:240` | **P1** | S | `<ConfirmDialog>` sobre `<Modal>` |
| **D19** | **No hay sistema de toast** — el propio código lo admite: `// (Si no hay sistema de toast aún, se queda como console.warn.)`. 24 `console.error` son fallos invisibles | `errorHandler.ts:165` + 11 ficheros | **P1** | M | `<ToastProvider>` (DESIGN §9.5) y cablear los 24 |
| **D20** | Suscripción al store sin selector → re-render completo por token de streaming | `ChatPanel.tsx:20-32`, `Sidebar.tsx:30-39`, `ArtifactPanel.tsx:20-25`, `CreditsIndicator.tsx:17`, `AgentSelectorModal.tsx:25-32` | **P1** | M | Selectores atómicos + `useShallow` |
| **D21** | Parser de artefactos/herramientas de 180 líneas **dentro del JSX**, ejecutado por token y por burbuja | `MessageBubble.tsx:240-420` | **P1** | M | Extraer a `utils/parseMessageParts.ts` + `useMemo(…, [content])` + `React.memo` en la burbuja |
| **D22** | `.map()` sobre todos los mensajes en cada token: O(n) objetos nuevos por token | `useChatStore.ts:651-660` | **P1** | M | Buffer de token con `requestAnimationFrame` y actualización dirigida por índice |
| **D23** | `PaywallModal` usa `slate`/`indigo`: **cero tokens**; y `window.location.href` recarga la SPA | `PaywallModal.tsx:14-27` | **P1** | S | Repintar con tokens + `useNavigate()` + botón de cerrar |
| **D24** | `RequireAuth` está fuera de paleta y es **el primer pixel de cada carga en frío** | `RequireAuth.tsx:13-15` | **P1** | S | Tokens + `role="status"` + `min-h-dvh` + preservar la URL destino |
| **D25** | Login/Register/VerifyEmail son un **segundo lenguaje visual** (`gray-800`/`purple-900`/`pink-600`), sin un solo token | 3 ficheros, 591 LOC | **P1** | M | Repintar sobre el sistema |
| **D26** | **No existe recuperación de contraseña** en toda la app | `LoginPage.tsx` | **P1** | S | `/reset-password` + `sendPasswordResetEmail` |
| **D27** | Sin `autoComplete` en ningún campo de autenticación | `LoginPage.tsx:101-122`, `RegisterPage.tsx:113-147` | **P1** | S | `email` / `current-password` / `new-password` |
| **D28** | «Guardar» de `ChatSettingsPage` es **decorativo**: sólo hace `navigate(-1)`. Y las ediciones de miembros van sólo a Zustand (sin `persist`, sin API) → **se pierden al recargar** | `ChatSettingsPage.tsx:231-237`, `:95-96` | **P1** | M | Guardado real + indicador de estado + persistir por API |
| **D29** | `MermaidDiagram` con 11 hex clavados → un cambio de paleta arreglaría la app y dejaría los diagramas en la antigua. Y `initialize()` en scope de módulo | `MermaidDiagram.tsx:6-25` | **P1** | S | Derivar de `getComputedStyle` + import dinámico |
| **D30** | `MainLayout` lee `window.innerWidth` **en el render**: no reacciona al resize | `MainLayout.tsx:118` | **P1** | S | `matchMedia` + estado, o mover a CSS |
| **D31** | Tirador de redimensionar no operable por teclado | `MainLayout.tsx:121-132` | **P1** | S | `role="separator"` + `tabIndex` + ←/→ |
| **D32** | `ErrorOverlay`: sin `role="alert"`, sin cerrar, sin apilar, `exit` inalcanzable y **se sale por la izquierda** bajo 448px | `ErrorOverlay.tsx:11,19` | **P1** | S | Sustituir por el sistema de toasts |
| **D33** | `CreditsIndicator` pinta «0 — Recargar» antes de que resuelva `refresh()`: **un usuario con saldo ve que no tiene** | `CreditsIndicator.tsx:21,56` | **P1** | S | Estado de carga con skeleton |
| **D34** | `PHASE_LABELS` omite `'devil'` → con esa fase `phaseIndex = -1` y **todas** las fases se pintan como futuras | `BoardWarRoom.tsx:7-12,26` | **P1** | S | Incluir `devil` |
| **D35** | `DataGrid.parseRow` **descarta celdas vacías y desplaza las columnas**; y el split de cabecera rompe si una fila lleva `-` | `DataGrid.tsx:13,16` | **P1** | S | No filtrar por vacío; separar cabecera por la fila de guiones |
| **D36** | `clipboard.writeText` sin `try/catch` y con `setCopied(true)` inmediato: muestra ✓ aunque falle | `MessageBubble.tsx:113-117`, `CodeBlock.tsx:16-20` | **P1** | S | try/catch + estado de fallo |
| **D37** | 6 `<img>` sin `onError`: un avatar 404 deja icono roto | `MessageBubble.tsx:166,183`, `Sidebar.tsx:207,327,329`, `ProfilePage.tsx:148` | **P1** | S | `onError` → placa de texto |
| **D38** | `ServiceCredentialsSettings` usa 4 rutas relativas `/api/v1/...` → **404 en dev** (no hay `server.proxy` en Vite) | `ServiceCredentialsSettings.tsx:76,106,137,156` | **P1** | S | Usar `serviceCredentialsService`, que ya existe en `api.ts:645` |
| **D39** | `ARCHITECTURE.md` describe una arquitectura **inexistente**: `features/`, `widgets/`, `shared/ui/`, interceptores de **Axios** (no instalado). 8 ficheros llaman `fetch()` directo | `frontend/ARCHITECTURE.md` | **P1** | S | Reescribirlo describiendo lo real, o borrarlo |
| **D40** | `useChatStore.ts` = 1064 líneas (la auditoría de abril lo marcó como «God Store» con 723) | `store/useChatStore.ts` | **P1** | L | Partir en `slices/{session,message,board,artifact,ui}.ts` |
| **D41** | `AgentCreationWizard.tsx` = 1454 líneas con 19 `useState` y un reset de 15 setters | `modals/AgentCreationWizard.tsx` | **P1** | L | Partir por los 5 límites que ya existen; `useReducer` |
| **D42** | 4 constantes de build muertas de la StatusPage revertida | `vite.config.ts:7-13`, `vite-env.d.ts:4-7` | **P2** | S | Borrar |
| **D43** | 164 errores de ESLint (112 `no-explicit-any`, 33 unused, 2 `rules-of-hooks`); 67 localizaciones de `any` | `api.ts` 17, `useChatStore.ts` 12, `MessageBubble.tsx` 7 | **P2** | L | Tipar; `no-explicit-any` a error en CI |
| **D44** | Sin `eslint-plugin-jsx-a11y`: la regresión de accesibilidad es cuestión de semanas | `eslint.config.js` | **P2** | S | Añadirlo (devDependency, 0 KB de runtime) |
| **D45** | 88 hex + 30 `rgba()` hardcodeados (34 y 23 valores distintos); 3 cianes y 6 midnights compitiendo | `AgentCreationWizard` 12, `MermaidDiagram` 12, `ChatSettingsPage` 10 | **P2** | M | Migrar a tokens. Los 8 de OAuth se quedan |
| **D46** | 4 modales y 3 diálogos inline duplican el mismo patrón; `inputCls` duplicado literal; `SocialButton` duplicado (55 líneas) | `ProfileSettings.tsx:289` = `ContactsSettings.tsx:259`; `LoginPage:177-226` = `RegisterPage:202-251` | **P2** | M | `components/ui/` compartido |
| **D47** | El mismo ajuste de junta implementado dos veces con estado local independiente → pueden mostrar valores contradictorios | `ChatSettingsPage.tsx:62-84` y `BoardMeetingSettings.tsx:45-84` | **P2** | S | Un slice de store compartido |
| **D48** | `VerifyEmailPage` hace polling cada 5s **indefinidamente**, sin backoff ni `document.hidden` | `VerifyEmailPage.tsx:35-41` | **P2** | S | Backoff + pausa en pestaña oculta + tope |
| **D49** | Timers sin limpiar en desmontaje (3 en `BillingPage`, 1 en `CodeBlock`, varios `setTimeout` de feedback) | `BillingPage.tsx:96-100`, `CodeBlock.tsx:18` | **P2** | S | `useEffect` con cleanup |
| **D50** | Precios, número de créditos y el texto legal de desistimiento **hardcodeados en el componente** | `BillingPage.tsx:11-21,279` | **P2** | M | Derivar de la API de billing |
| **D51** | `ErrorBoundary.retry` no resetea el subárbol → **bucle infinito** en un error determinista. Y no envuelve `ArtifactRenderer`, que es donde va a fallar | `ErrorBoundary.tsx:29-31` | **P2** | S | `resetKeys` + contador + envolver el renderer |
| **D52** | `ActaActions` re-parsea el acta completa **en cada tecla** del campo owner/repo; y `JSON.parse` sin validar puede crashear | `ActaActions.tsx:41,15-21` | **P2** | S | `useMemo` + validación del `localStorage` |
| **D53** | Emojis como interfaz: `⚡` de logo, `🏛️` de avatar, `🤖`, `💬`, `⚔️`, `🎨`, `👥`; `⚡` **porta el significado «créditos»** sin alternativa textual | `ChatPanel.tsx:281,187`, `MessageBubble.tsx:170`, `Sidebar.tsx:210`, `BoardActivationModal.tsx:53` | **P2** | M | Glifos de lucide con `aria-label`. Logo real pendiente |
| **D54** | Copy de ciencia ficción sobre un producto de decisiones: «Neuro-Link v2.0», «Canal Encriptado de Extremo a Extremo», «OBJETOS DETECTADOS» | `ChatPanel.tsx:310,355,621`, `ArtifactPanel.tsx:43` | **P2** | S | DESIGN §11 |
| **D55** | Restos de inglés: «Pinned», «Artifact Workspace», «Document Preview», `aria-label="owner"`. Y «empezá» (voseo) | `MessageBubble.tsx:436`, `ArtifactPanel.tsx:39`, `MarkdownViewer.tsx:29`, `RegisterPage.tsx:93` | **P2** | S | Unificar en español peninsular |
| **D56** | `useUserAvatar` guarda el avatar como base64 en `localStorage` sin validar tipo ni tamaño ni comprimir: una foto de 5 MB son ~7 MB de string | `hooks/useUserAvatar.ts`, `ProfilePage.tsx:39-43` | **P2** | M | Validar, redimensionar a 256px en canvas, o subir al backend |
| **D57** | `Sidebar` detecta admin **provocando un 403** en cada montaje de todo usuario no-admin | `Sidebar.tsx:53-60` | **P2** | S | Exponer el rol en `GET /me` |
| **D58** | Doble `fetchSessions()` en el arranque (`App.tsx:31` y `Sidebar.tsx:149`) | ambos | **P2** | S | Dejar uno |
| **D59** | IDs de mensaje de historial basados en índice (`history-<id>-<idx>`) → pins y valoraciones **no sobreviven a la recarga** | `useChatStore.ts:448` | **P2** | M | ID estable del backend |
| **D60** | El `textarea` del chat tiene `rows={1}` y `max-h-48` pero **no crece**: el `max-h` revela una intención sin implementar | `ChatPanel.tsx:558-566` | **P2** | S | Auto-grow con `field-sizing: content` (+ fallback) |
| **D61** | `ProfileSettings` ofrece tema «Claro» y la app no tiene tema claro | `ProfileSettings.tsx:237` | **P2** | S | Se resuelve en la fase 6 al implementarlo de verdad |
| **D62** | `AgentDetailPage` navega a `/chat`, que **no es una ruta**: cae en el catch-all | `AgentDetailPage.tsx:359,389,418` | **P2** | S | `/` o `/chat/:sessionId` |
| **D63** | Sin guarda de cambios sin guardar en 4 formularios largos | `AgentDetailPage` (calcula `isDirty` y no lo usa), `ProfilePage`, `ProfileSettings`, `ChatSettingsPage` | **P2** | M | `useUnsavedGuard` + `beforeunload` + bloqueo de navegación de Router 7 |
| **D64** | 19 `String(e)` crudos llegan al usuario: «Error: Error cargando credenciales» | 6 ficheros de `settings/` | **P2** | M | Mapa de errores → mensaje humano (DESIGN §11) |
| **D65** | `AgentOverridesSettings` permite escribir un modelo **libre** mientras `AgentDetailPage` restringe a una lista → se puede guardar un modelo inválido | `AgentOverridesSettings.tsx:169-177` vs `AgentDetailPage.tsx:28` | **P2** | S | Misma lista en los dos |
| **D66** | `AgentCreationWizard` pone `model: 'deepseek-chat'`, que no está en `MODEL_OPTIONS` → el radio queda **sin selección** en la ruta «desde cero» | `AgentCreationWizard.tsx:295` vs `:98-99` | **P2** | S | Usar un id válido |
| **D67** | `AgentCreationWizard` asume `customAgents[0]` para asociar documentos: si el store cambia de orden, **suben al agente equivocado** | `AgentCreationWizard.tsx:360-362` | **P2** | S | `addCustomAgent` devuelve el id |
| **D68** | Sin metadatos: sin `<meta description>`, sin OG/Twitter, sin `theme-color`, sin manifest, favicon = `vite.svg`. `SharedSessionPage` es la única superficie pública y no tiene `<title>` | `index.html`, `SharedSessionPage.tsx` | **P2** | S | Metadatos + OG por sesión compartida |
| **D69** | `WEEKDAYS` indexado a lunes mientras `cron`/JS indexan a domingo: posible desfase de un día | `ScheduledBoardsSection.tsx:13,29,218-220` | **P2** | S | Verificar contra el backend |
| **D70** | Todas las horas de las juntas programadas en **UTC** sin conversión ni previsualización local | `ScheduledBoardsSection.tsx:13,29,225,231` | **P2** | S | Mostrar hora local + «(09:00 UTC)» |

**Recuento:** 17 P0 · 24 P1 · 29 P2.

---

## 4. Sin implementar

### 4.1 OpenSpec: 112 de 112 tareas cerradas

`openspec/changes/**/tasks.md` no tiene **ni un solo** `- [ ]`. Verificado con dos patrones distintos. `production-readiness` 18/18, `production-ready-v2` 16/16, y los dos archivados 16/16 y 62/62. Deuda residual anotada **dentro** de tareas ya marcadas:

- `archive/2026-05-14-.../verify-report.md:78` — «**CS-003 Admin HTTP endpoint** — ❌ Not implemented. `_repair_wallet()` exists but no `/admin/repair-wallet` HTTP route was created». Backend.
- `production-ready-v2/tasks.md:63` — «**Limitación conocida:** el recargo sólo aplica a `counted_as == 1` — los board meetings (5 créditos) no reciben recargo por tokens (decisión pendiente de producto)».
- `production-readiness/tasks.md:62` — «Tests blocked by Node 26 + vitest incompatibility» → **ya resuelto**: 108 tests pasan.

### 4.2 `PLAN_IMPLEMENTACION_BOARD_V2.md`: implementado de punta a punta

Las 14 tareas frontend de las fases 3-6 están todas en el código (verificado fichero por fichero: `bubbleByRole`, slice `boardSession`, `BoardWarRoom`, `BoardActivationModal`, chip de coste, modo intervenir, aurora reactiva, `ActaActions`, `VerifyEmailPage`, `OnboardingChecklist`). `FREQ: XXXMHz` eliminado: 0 apariciones.

Sin evidencia de ejecución, de la FASE 7:
- **línea 135** — «**E2E real:** re-ejecutar `%TEMP%\sphere-chrome\qa2.js` contra prod tras deploy → latencia total objetivo **<100 s**, sin evento duplicado, votos visibles, acta descargable, cobro 5→refund 2».
- **línea 136** — «**Smoke manual:** regenerar conclusión, sesión vieja pre-V2, board con flag V2 off».
- **línea 24** — «El pre-check sigue exigiendo 5 (**limitación v1 documentada**)».
- **línea 85** — «`thinking` en board … **fallback documentado:** status sintético por rol en frontend y se cierra como limitación».

### 4.3 Roadmap de `docs/AUDITORIA_PRODUCCION_2026-06-10.md`

Abiertos y accionables en frontend: **A8** (mensaje perdido si el stream falla, sin retry — es D-nuevo, ver §3 «fallo de envío»), **A15** (clipboard sin try/catch = D36), **A16** (`<img>` sin `onError` = D37), **A17** (títulos de sesión sin `title=`), **A30** (input deshabilitado sin indicador fuerte), **A10** (subida sin `xhr.timeout` ni cancelar), **A9** parcial (el toggle falla en silencio; bloqueado por la falta de toasts = D19), **A34** (validación de contraseña sólo HTML5), **A37** (selección de código en móvil, nunca verificado en dispositivo real).

Del roadmap B, nunca empezados en frontend, ordenados por lo que el propio documento marcó como más valioso:

| # | Qué | Nota del documento original |
|---|---|---|
| **B11** | **Agentes custom en la mesa de la junta** | *«Es LA feature que une tus dos sistemas estrella»*. `BOARD_AGENTS_ORDER` hardcodeado en backend; hace falta generalizar a los `members` de la sesión + UI de selección |
| **B16** | **Citas RAG clicables** (`source_file_id`, `chunk_index` → footnote con el fragmento) | *«La diferencia entre "me lo creo" y "no me lo creo"»*. 0 apariciones de esos campos en todo el repo |
| **B32** | **Disagreement scoring** | *«El de mayor wow por línea de código»*. Confianza ✅; scoring, replay del debate y límite de tokens ❌ |
| — | **«Preguntar a Ledger» sobre el acta a 1 crédito** | *«El follow-up barato es el upsell natural del board»* |
| — | **Junta de muestra pregrabada** en el historial de cuentas nuevas | *«Vende el wow sin gastar créditos ni API»*. Esfuerzo S/M, coste marginal cero |
| B4 | Upsell preventivo (<5 créditos, CTA post-board) | Hoy `PaywallModal` sólo reacciona a 402 |
| B12/B13/B14 | Playground antes de guardar · fork/import-export · sliders de personalidad | 0 apariciones de `playground`/`fork` |
| B19 | Preview de documento + reindexar | El endpoint `GET /agents/{id}/documents/{file_id}` existe y **nadie lo llama** |
| B5 | Export del acta a PDF | Markdown ✅ |
| B21 | Catálogo de integraciones con logs | — |
| B27-B31 | Marketplace, workspaces, API pública, hybrid search, PWA | `is_public` existe en el schema y **siempre se envía `false`** |

### 4.4 Endpoints que el backend expone y el frontend nunca llama

De 62 endpoints, cuatro son features frontend sin construir:

| Endpoint | Feature que falta | Prioridad |
|---|---|---|
| `POST /api/v1/billing/portal` (`billing.py:56`) | **Autoservicio de facturación** (método de pago, facturas, historial). `docs/FUNCIONALIDADES.md:219` lo documenta como hecho: **es falso**, 0 apariciones de `portal` en `frontend/src` | **Alta** |
| `GET /api/v1/me/usage` (`auth.py:96`) | Uso de tokens. `TokenUsageBar.tsx` lo consumía y **fue borrado sin sustituto** | Media |
| `GET /api/v1/agents/{id}/documents/{file_id}` | Preview de documento (= B19) | Media |
| `GET /api/v1/agents/templates/{template_id}` | Detalle / deep-link de plantilla | Baja |

`GET /api/v1/health/deploy` está huérfano **a propósito** y documentado como tal.

### 4.5 Documentación que miente y va a desorientar al siguiente agente

- **`frontend/ARCHITECTURE.md`** describe `src/shared/ui/`, `features/chat`, `features/auth`, `widgets/` e **interceptores de Axios**. Nada de eso existe: la estructura es `src/{components,contexts,hooks,lib,pages,services,store,types,utils}`, no hay `axios` en `package.json`, y **8 ficheros llaman `fetch()` directo** violando su propia regla. **Es el documento más peligroso del repo** porque parece autoritativo.
- **`docs/FUNCIONALIDADES.md`** miente en 4 filas: `billing/portal` (:219), `GET /me/usage` (:211), `ToolConfirmationModal` (:238, el fichero no existe), y las secciones `api-keys`/`storage` (:207-209, hoy son redirecciones legacy).
- **`frontend/Docs/00-START-HERE.md`** dice «Estamos en la etapa de inicialización (Greenfield)» y pide Podman + Cloud Run + vLLM en Runpod. **`frontend/Docs/01-PRD.md`** declara el mismo stack y fija «Latencia: objetivo <2s para el primer token» — el QA del 2026-06-11 midió **43,7 s**. Ninguno de los dos está en `legacy/`.
- **`frontend/Docs/legacy/Resumen_Frontend.md`** lista como pendientes `TokenUsageBar` y `ToolConfirmationModal`; **los dos ficheros fueron borrados**, no integrados.

---

## 5. Nueva identidad visual aplicada, pantalla por pantalla

`DESIGN.md` tiene el sistema. Aquí están las decisiones concretas por pantalla. Cada una nombra qué sustituye.

### 5.1 Shell (`MainLayout`)

Fondo: **grano de paño** (WebP de 128px, 3 KB, `overlay` al 4%) más **una** lámpara `radial-gradient` fija arriba a la izquierda. *Sustituye* a tres blobs de 600-700px con `blur(100px)` + `mix-blend-screen` animando transform en bucle infinito y a un `backdrop-blur(120px)` a pantalla completa. `AuroraBackground.tsx` **se elimina** — un componente entero, menos.

Sidebar: 288px (era 320: 32px que se los queda el transcript), e1, filete en el canto interior, sin `glass-panel`. Historial **agrupado por fecha** (Hoy / Ayer / Esta semana / Anteriores) en vez de una lista plana con `toLocaleDateString()` por fila. Buscador **cablearlo de verdad** (D10) con `⌘K` como atajo.

Canal izquierda del transcript: **rail del orden del día** de 56px (§8.4 de DESIGN), sticky, con el cursor de latón sobre la fase viva. *Sustituye* a la fila de fases en `text-gray-700` (1.6:1, invisible) de `BoardWarRoom`.

Panel de artefactos: 380/480/760px, tirador con `role="separator"` operable con ←/→. El ancho persiste. *Corrige* `window.innerWidth` en el render.

### 5.2 Chat / Junta (`ChatPanel`, `MessageBubble`, `BoardWarRoom`)

La cabecera del war-room se convierte en **La Mesa** (§8.1): asientos por rumbo en arco a la derecha en `lg+`, cada uno una **placa de latón** con el nombre en Archivo condensada y una barra de identidad de 3px, más su **aguja de confianza** (§8.2). La placa que habla se alza y la lámpara se mueve hacia ella. *Sustituye* a 5 avatares redondos con `boxShadow` pulsando en bucle y a los chips de voto idénticos.

Turno del debate: nombre del director **en el margen** (estilo Hansard), cuerpo en **Literata 16px/1.55 a 68ch** de medida. *Sustituye* a `max-w-4xl` (896px ≈ 112 caracteres por línea) y a la burbuja con `rounded-2xl` y `boxShadow` teñido.

Conclusión del CEO: se renderiza sobre **papel** (`--surface-doc`, `paper-50`) en los dos temas, con el bisel de 6px, y recibe **el sello** (§8.3) una vez. Este es el fotograma con el que el producto se vende y hoy es una burbuja más con un chip que dice «· CONCLUSIÓN».

Disenso de Némesis: filete `oxblood-500` y la cita clave en **Literata itálica** — el disidente de un laudo se marca con itálica, no con un emoji de espada.

Entrada: `field-sizing: content` para que crezca de verdad (hoy `rows={1}` + `max-h-48` y no crece). Coste en cifras tabulares dentro del propio botón: «Convocar junta · 5 créditos». `aria-live="polite"` con throttle de 1s sobre el turno en streaming.

### 5.3 Acta (`MarkdownViewer`, `ArtifactPanel`, `ActaActions`)

**Es el arreglo de mayor impacto de todo el plan.** La hoja del acta usa `.acta-sheet` + `.doc-prose`: `paper-50`, Literata 16px, h2 con filete inferior, listas con viñetas de latón, enlaces subrayados, tablas con cifras tabulares, medida 68ch centrada. *Sustituye* a 16 `prose-*` que no generan CSS sobre `bg-[#0d0d12]`, es decir, a un volcado de texto gris sin encabezados ni viñetas.

`ActaActions` deja de ser un expander sin `aria-expanded` y pasa a un panel de la hoja con los próximos pasos como **lista de casillas** que se pueden enviar a GitHub una por una.

Pestañas de artefactos: `role="tablist"` con subrayado de latón deslizante y **etiqueta visible también bajo `sm`** (hoy son iconos sin nombre).

### 5.4 Autenticación (`LoginPage`, `RegisterPage`, `VerifyEmailPage`, `RequireAuth`)

Las tres pantallas se repintan sobre el sistema: paño con el grano, hoja de `paper-50` centrada a 420px con el bisel, primario de latón macizo, campos con `--stroke-control` (3.47:1) y anillo de foco de latón. *Sustituye* a `from-gray-900 via-purple-900` + `from-purple-600 to-pink-600`, que hoy son un producto distinto.

Se añade `/reset-password` (hoy **no hay forma de recuperar una cuenta**), `autoComplete` correcto, conmutador de visibilidad de contraseña, validación en vivo con `aria-describedby`, `role="alert"` en el banner, y consentimiento legal en el registro (que hoy sólo existe en billing).

`RequireAuth` es el primer pixel de cada carga en frío: pasa a `min-h-dvh` sobre paño, con la marca en latón y `role="status"`, y **conserva la URL destino**.

### 5.5 Ajustes (`SettingsPage` + 8 secciones)

Navegación de 224px en `lg+` con `aria-current`; bajo `sm`, pestañas con desvanecimiento en los dos cantos (hoy se desplazan sin ninguna pista y a 320px «Contactos» es indescubrible). **Facturación y Admin entran en esta navegación** — hoy están en tres sitios distintos.

Un `<Field>` compartido resuelve de golpe los ~40 controles sin etiqueta. `<select>` con `appearance-none` y galón propio (hoy 9 selects heredan el desplegable del sistema, a menudo blanco sobre blanco). Toda sección larga con **barra de guardado adherida** que muestra «3 cambios sin guardar» y guarda desde donde estés.

`ConnectionsSettings` deja de ser un scroll de 10+ tarjetas expandidas: acordeón con una abierta, buscador y estado por servicio.

### 5.6 Facturación (`BillingPage`, `PaywallModal`, `CreditsIndicator`)

El saldo es una **cifra grande en Archivo tabular** (`--text-4xl`) sobre papel, con la cuota como barra de 3px y `role="progressbar"`. La consola de créditos se lee como un extracto bancario, no como una tienda de apps.

`CreditsIndicator` con skeleton mientras carga: hoy **un usuario con saldo ve «0 — Recargar»** en cada montaje.

`PaywallModal` se reescribe entero: tokens en vez de `slate`/`indigo`, `<Modal>` de verdad, botón de cerrar, `useNavigate()` en lugar de `window.location.href`, y **un mensaje y un destino distintos por razón** (402 ≠ cuota de RAG ≠ límite de agentes). Y explica los 30 créditos gratuitos, que hoy no se explican en ningún sitio.

### 5.7 Admin (`AdminPage`)

Tabla real con `<caption>`, `scope="col"`, `aria-sort` y cifras tabulares. Ajustar créditos pasa por `<ConfirmDialog>` con el importe y el usuario escritos en el cuerpo — **hoy mueve dinero con un clic y sin confirmación**. Guarda de rol en cliente para no pintar un shell y un spinner a quien va a recibir un 403.

### 5.8 Conversación compartida (`SharedSessionPage`)

Es la **única superficie pública** del producto. Recibe la hoja de papel, `.doc-prose`, las placas de los directores con su color y sus votos, `<title>` y metadatos OG por sesión. Y una firma discreta con el sello. Hoy renderiza markdown sin estilo y un debate de cuatro agentes se lee como un muro indiferenciado.

---

## 6. Mejoras de calidad de vida que nadie planeó

Catorce. Ninguna está en `openspec/`, ni en `PLAN_IMPLEMENTACION_BOARD_V2.md`, ni en el roadmap B. Todas pasadas por el filtro de **este** producto: una junta que deja constancia.

| # | Qué es | Por qué importa aquí | Coste | Impacto |
|---|---|---|---|---|
| **Q1** | **Acta en modo presentación.** `P` sobre un acta abre pantalla completa: una sección por diapositiva, recuento de votos como diapositiva propia, próximos pasos como cierre. Navegación con ←/→, `Esc` sale. Sólo CSS + `requestFullscreen()` + un índice de sección. | El usuario de SPHERE **presenta esa decisión a alguien**: a su socio, a su consejo real, a un inversor. Hoy tiene que copiar el markdown a Google Slides. Convierte el acta en el artefacto que sale de la app y entra en una reunión. Y es la mejor demo posible del producto. | **M** | **Alto** |
| **Q2** | **Comparador de directores.** Dos casillas en las placas y `⇧C` abre una vista de dos columnas con las intervenciones de esos dos directores enfrentadas, con sus votos y confianzas en la cabecera. | El producto **existe** para el desacuerdo (P2 de DESIGN) y hoy hay que hacer scroll arriba y abajo para comparar lo que dijo el CFO con lo que dijo el CTO. Es la lectura natural de un debate y no existe. | **M** | **Alto** |
| **Q3** | **Borrador persistido por sesión.** Lo que se escribe en el input se guarda con debounce de 400ms en `localStorage` con clave `draft:<sessionId>`, y se restaura al volver, con un «Borrador recuperado · Descartar». | Un prompt de junta bien redactado son 4-6 líneas de contexto. Hoy se pierde al navegar, al recargar y **cuando el envío falla** (A8, sigue abierto). Cuesta ~25 líneas y elimina la peor pérdida de trabajo de la app. | **S** | **Alto** |
| **Q4** | **Paleta de comandos (`⌘K` / `Ctrl+K`).** Sesiones, agentes, secciones de ajustes, acciones («Convocar junta», «Exportar acta», «Ir a facturación»), y las 6 plantillas de debate. Búsqueda difusa sobre la lista, ~120 líneas sin dependencias. | La app tiene **13 rutas, 8 secciones de ajustes y 3 puntos de entrada de navegación distintos**; y ya existe una lista de sesiones que buscar. Además absorbe el buscador muerto de la sidebar (D10) en vez de arreglarlo dos veces. | **M** | **Alto** |
| **Q5** | **Deshacer el borrado de sesión.** El borrado se hace optimista y deja un toast de 8s con «Deshacer»; la llamada real se dispara al expirar. | Borrar una sesión hoy destruye un debate de 5 créditos con un «¿Confirmar borrado? Sí / No» de 10px. Un `undo` es más humano **y más barato** que un modal de confirmación, y elimina el diálogo. | **S** | **Alto** |
| **Q6** | **Próximos pasos como casillas reales.** Los items que ya parsea `actaParser.ts` se renderizan como checkboxes con estado persistido; cada uno con «→ GitHub», «→ Notion», «→ Preguntar a la junta». Progreso en la cabecera del acta: «2 de 5 hechos». | `parseProximosPasos` ya existe, con tests, y sólo se usa para un export en bloque. Convierte el acta de documento **leído** en documento **ejecutado**, que es la promesa entera del producto. | **M** | **Alto** |
| **Q7** | **Replay del debate.** Un acta cerrada se puede reproducir: los turnos aparecen en su orden con las agujas moviéndose, a 1×/2×/8×, con barra de progreso por fase. Es sólo un reproductor sobre datos que ya están en el store. | Un debate de junta tarda ~100 s en producción; el usuario a menudo se va. El replay recupera el *espectáculo* sin gastar créditos, **y sirve como junta de muestra pregrabada para cuentas nuevas** — que es exactamente lo que pedía `docs/BOARD_FRONTERA_Y_QA §5.4` y sigue abierto. Dos pájaros. | **M** | **Alto** |
| **Q8** | **Grado de desacuerdo en la cabecera.** Una barra de una línea que resume el recuento: dividido 2-1 con confianzas altas se pinta en oxblood y dice «Junta dividida»; unánime dice «Unanimidad». Se calcula de `tally` + `votes`, que ya están en el store. | ~40 líneas sobre datos existentes, y es lo primero que un usuario quiere saber al abrir un debate viejo. `docs/AUDITORIA §B32` lo llamó *«el de mayor wow por línea de código»* y nunca se hizo. | **S** | **Alto** |
| **Q9** | **Atajos de teclado con su hoja (`?`).** `⌘K` paleta · `⌘⏎` enviar · `⌘⇧⏎` convocar junta · `Esc` detener generación · `⌘/` buscar en la conversación · `⌘B` sidebar · `⌘J` panel de artefactos · `P` presentación · `J/K` turno anterior/siguiente. | Hoy hay **un solo `onKeyDown` en 47 ficheros**. Un usuario que convoca varias juntas al día vive con el ratón. Y la hoja de atajos es, de hecho, la mejor documentación de lo que la app sabe hacer. | **M** | **Medio** |
| **Q10** | **Coste y saldo proyectado en el propio botón.** «Convocar junta · 5 créditos · te quedan 25». Y si el saldo no llega, el botón lo dice **antes** en vez de dejar que el 402 abra el paywall a mitad de conversación. | P4 de DESIGN. Hoy el coste está en un chip de 9px al lado del botón y el paywall aparece **después** de que el usuario haya escrito su pregunta. Cierra el `B4` (upsell preventivo) sin construir nada nuevo. | **S** | **Alto** |
| **Q11** | **Densidad configurable.** Conmutador `comfortable`/`compact` en ajustes, persistido, implementado con dos custom properties (`--row-h`, `--pad-y`) y nada más. Forzado a `comfortable` en `(pointer: coarse)`. | Un fundador que revisa cinco juntas y un extracto de créditos quiere ver más filas; el mismo fundador leyendo un acta de 2.000 palabras quiere aire. Coste real: dos variables, cero componentes tocados. Y sustituye el impulso de bajar la tipografía a 10px, que es de donde salió la deuda de D11. | **S** | **Medio** |
| **Q12** | **Diff de una respuesta regenerada.** Al regenerar un turno, se conserva el anterior y aparece «v1 / v2» con un diff por palabras. | «Regenerar» ya existe y hoy **destruye** la respuesta anterior (`useChatStore.ts:562-576` trunca desde el mensaje). Si has gastado créditos en dos versiones, deberías poder verlas juntas y decidir. La pérdida silenciosa de una respuesta pagada es un fallo de producto, no una feature que falta. | **M** | **Medio** |
| **Q13** | **Onboarding contextual por primera vez, no checklist.** El `OnboardingChecklist` se sustituye por tres pistas que aparecen **la primera vez que se ve cada cosa**: la primera vez que se abre la mesa, una nota junto a la placa del CEO explica el rumbo de los asientos; la primera vez que llega un voto, una nota junto a la aguja explica el umbral de 70; la primera vez que se cierra un acta, una nota junto al sello explica que se puede exportar. Cada una se descarta y no vuelve. | El checklist actual dispara 3 llamadas a la API en cada montaje para **todo** usuario, parpadea porque no espera a `loaded`, y explica pasos en abstracto. Enseñar la aguja de confianza **cuando la aguja se mueve** es la única vez que el usuario tiene contexto para entenderla. | **M** | **Medio** |
| **Q14** | **Exportar la junta como una sola página HTML autocontenida.** Un fichero con el acta, el recuento, las agujas en SVG y el transcript completo, con los estilos incrustados. Se abre en cualquier navegador, se adjunta a un correo, se archiva. | El export actual es markdown plano y pierde todo lo que hace reconocible el producto: los votos, las confianzas, el sello. Una junta archivada **es un documento legal de facto** para el usuario, y un markdown no lo parece. Un HTML sellado, sí. Reutiliza `.doc-prose` y `exportChat.ts`. | **M** | **Medio** |

---

## 7. Plan de ejecución por fases

Cada tarea es atómica, nombra sus ficheros y tiene un criterio de aceptación **verificable con un comando o una comprobación observable**. Las dependencias son estrictas: no empezar una fase sin cerrar la anterior.

---

### FASE 0 — Cimientos de tokens (bloquea todo lo demás) · 1,5-2 días

> Sin esto, cualquier trabajo visual se hace sobre clases que no generan CSS.

| # | Tarea | Ficheros | Aceptación |
|---|---|---|---|
| **0.0** | **Arreglar el CI antes de tocar nada** *(añadida por la auditoría — hoy el workflow NO corre nunca)*: trigger a `branches: [master]` (o `['**']`) en push y PR; typecheck a `npx tsc -b --noEmit` (sin `-b` es un no-op con este tsconfig solution-style); sustituir `npm test` por `./node_modules/.bin/vitest run` (corepack redirige `npm test` a pnpm en el entorno actual); confirmar en GitHub una ejecución REAL en verde antes del primer push de la fase 0. Decidir a la vez la estrategia de rama: el rediseño va en rama larga `redesign/` con previews, porque Railway despliega cada push a `master` | `.github/workflows/ci.yml:11,13,72,75` | Una ejecución del workflow visible en GitHub Actions con los 3 jobs en verde sobre la rama de trabajo |
| 0.1 | Escribir `index.css` completo desde DESIGN §13: `@custom-variant dark`, `@font-face` ×4, escalas crudas, **tema oscuro en `:root` (por defecto) y claro en `[data-theme="light"]`**, `@theme inline`, `@layer base`, `.doc-prose`, `.acta-sheet` con su re-mapeo de variables. **Incluir un shim temporal de transición** que re-implemente `.glass-panel`, `.glass-card`, `.glass-input`, `.hover-lift`, `.active-scale` y `.aurora-blob` sobre los tokens nuevos (15 usos de `glass-*` en 5 ficheros + 14 de `hover-lift`/`active-scale` + 6 blobs siguen vivos hasta las fases 3-6), marcado `/* SHIM — retirar en fase 6 */` | `frontend/src/index.css` | Compilar contra el fichero sonda de DESIGN §13.1 (no contra `src`, que aún no usa los tokens): las utilidades del contrato emiten su valor; `.doc-prose h2` y `.acta-sheet` presentes; el shim compila |
| 0.2 | Borrar `tailwind.config.js` | `frontend/tailwind.config.js` | `test ! -f frontend/tailwind.config.js` y `npm run build` pasa |
| 0.3 | Añadir las 4 fuentes variables subseteadas (latin + latin-ext) a `public/fonts/`; quitar el `@import` de Google. **Fuentes de descarga:** TTF variables de los repos oficiales en github.com/google/fonts (`ofl/literata`, `ofl/archivo`, `ofl/jetbrainsmono`). **Prerequisito de entorno:** `pip install fonttools brotli`. Comando: `pyftsubset in.ttf --flavor=woff2 --layout-features='kern,liga,tnum' --unicodes='U+0000-00FF,U+0100-017F,U+2000-206F,U+20AC,U+2018-201F'` **conservando los ejes** (verificar tras subsetear que `wdth` sigue en Archivo y `opsz` en Literata: `python -c "from fontTools.ttLib import TTFont; print([a.axisTag for a in TTFont('out.woff2').get('fvar').axes])"`) | `public/fonts/*.woff2`, `index.css:3` | `grep -rn 'fonts.googleapis' frontend/` = 0. Cada fichero ≤ 45 KB. Los ejes `wght`+`wdth` (Archivo) y `wght`+`opsz` (Literata) presentes |
| 0.4 | `preload` de `archivo-var` y `literata-var`; `lang="es"`; **favicon provisional** (anillo de sello monocromo simple — el definitivo llega con el logo en 3.9); `<meta description>`, OG, `theme-color`; el contrato de dirección como comentario HTML. *(No hace falta `data-theme` en el HTML: desde B1 el `:root` ya es el tema oscuro.)* | `frontend/index.html` | `grep 'lang="es"'` ok; `grep 'THESIS' dist/index.html` tras `npm run build` |
| 0.5 | Grano de paño: WebP 128×128 ≤ 3 KB en `public/textures/baize-128.webp`. **Método de generación:** ruido monocanal (p. ej. `sharp` con `raw` + ruido gaussiano suave, o canvas en Node) con direccionalidad leve de tejido (dos pasadas de ruido desplazadas 1px en diagonal), exportado WebP calidad ~60; el blend real lo hace el CSS (`overlay` al 4%), así que el tile puede ser gris neutro | nuevo | El fichero existe, pesa < 3072 bytes y tilea sin costura visible a 100% |
| 0.6 | **Codemod de tokens muertos** (script único, revisado a mano después): `text-text-primary`→`text-content-strong`, `text-text-secondary`→`text-content-muted`, `text-text-secondary/XX`→`text-content-quiet`, `text-text-muted`→`text-content-quiet`, `bg-surface-elevated`→`bg-surface-3`, **`bg-text-secondary`→`bg-content-muted`** (AgentDetailPage.tsx:726, faltaba en el mapa), `text-agent-X`→`text-agent-x`, y quitar `animate-pulse-slow`/`animate-in`/`fade-in` | 26 ficheros | El script de detección (0.8) reporta **0** clases muertas. Ahora sí: el CSS compilado contra `src` contiene `.text-content-strong`, `.bg-surface-1` (criterio movido desde 0.1: las utilidades sólo se emiten al usarse) |
| 0.7 | Sustituir las 16 `prose-*` por `.doc-prose` (y `.acta-sheet` en el visor del acta) | `MarkdownViewer.tsx`, `MessageBubble.tsx:238`, `SharedSessionPage.tsx:87` | `grep -rE '\bprose(-\|"\| )' frontend/src` = 0. Un acta con h1/h2/listas/enlaces/tabla se ve jerarquizada |
| 0.8 | **Formalizar el detector de clases muertas** en `scripts/check-dead-classes.mjs` (compila `index.css` con el PostCSS del proyecto y diffea contra los tokens de clase de `src/**/*.tsx`) y añadirlo a `.github/workflows/ci.yml` | nuevo + CI | El job falla si aparece una clase muerta nueva |
| 0.9 | Declarar `dompurify` + `@types/dompurify`; añadir `eslint-plugin-jsx-a11y` en modo error para las 7 reglas de DESIGN §12.14 | `package.json`, `eslint.config.js` | `npm ls dompurify` sin `extraneous`; `npx eslint src` no reporta violaciones nuevas de a11y |

> **Nota:** el detector de 0.8 ya existía como scratch sin commitear (`frontend/__tw_probe.mjs`, `__tw_diff.mjs`, `__tw_out.css`). Alguien lo escribió, vio el problema y no lo formalizó. Esta tarea lo convierte en control de CI.

---

### FASE 1 — Corrección de P0 funcionales y de accesibilidad · 3-4 días

**Depende de:** Fase 0.

| # | Tarea | Ficheros | Aceptación |
|---|---|---|---|
| 1.1 | **D03** Subir `useState`/`useEffect` por encima del early return | `ChatSettingsPage.tsx:100,152,155` | `npx eslint src` sin `rules-of-hooks`; navegar a `/chat/settings` durante la carga de la sesión no lanza |
| 1.2 | **D04** Enrutar `KnowledgeBasePanel` por `chatService`; corregir el shape (`data.documents`) | `KnowledgeBasePanel.tsx:48-50,115,224,243` | Listar/subir/borrar documentos devuelve 200 con un usuario logueado; test MSW que verifica la cabecera `Authorization` |
| 1.3 | **D38** Enrutar `ServiceCredentialsSettings` por `serviceCredentialsService`; borrar el `API_URL` local | `ServiceCredentialsSettings.tsx:76,106,137,156` | `grep '"/api/v1' frontend/src` = 0; la sección carga en `npm run dev` |
| 1.4 | **D10** Cablear el buscador de sesiones (filtra por título; `⌘K` se añade en la Fase 5) | `Sidebar.tsx:161-165` | Escribir filtra la lista; test que teclea y comprueba el filtrado |
| 1.5 | **D13** Sacar el botón de menú fuera del `<Link>`; el menú pasa a `role="menu"` con `Escape` | `Sidebar.tsx:194-242` | Validador HTML sin anidamiento interactivo; el menú se abre y cierra con teclado |
| 1.6 | **D07** Regla global de `:focus-visible`; borrar los 32 `outline-none` sin sustituto | `index.css` + 31 sitios | Recorrer la app con Tab: **cada** elemento accionable muestra anillo de latón. `grep 'outline-none'` ≤ nº de `focus-visible` |
| 1.7 | **D06** `<Field>` compartido con `useId`; adoptarlo en los ~40 controles sin etiqueta | `components/ui/Field.tsx` + 12 ficheros | `htmlFor` ≥ nº de `<label>`; `eslint-plugin-jsx-a11y/label-has-associated-control` limpio |
| 1.8 | **D08** `<Modal>` con `role="dialog"`, `aria-modal`, `aria-labelledby`, trampa de foco, `Escape`, restauración de foco, scroll bloqueado. Adoptarlo en los 4 modales y en los 3 diálogos inline | `components/ui/Modal.tsx` + 7 ficheros | 4+ `role="dialog"`; test que abre, tabula en círculo, pulsa `Escape` y comprueba que el foco vuelve al disparador |
| 1.9 | **D18** `<ConfirmDialog>` sobre `<Modal>`; aplicarlo a las 8 destructivas | `components/ui/ConfirmDialog.tsx` + 8 sitios | Cada acción destructiva abre un diálogo con el nombre del objeto y el foco inicial en Cancelar |
| 1.10 | **D14** Dropzones a `<button>` real + input `sr-only` | `KnowledgeBasePanel.tsx:475-486`, `AgentCreationWizard.tsx:1127-1139` | Se puede subir un documento con Tab + Enter |
| 1.11 | **D16** `focus-within:opacity-100` + visibles en `(hover: none)` en las 4 filas de acciones | `MessageBubble.tsx:443` +3 | Con `--emulate hover:none` en DevTools las acciones son visibles; alcanzables con Tab |
| 1.12 | **D09** `<ToastProvider>` (D19) + `aria-live` en turno de streaming (throttle 1s), saldo, guardado y recuento | `components/ui/Toast.tsx`, `ChatPanel`, `CreditsIndicator` | ≥5 regiones `aria-live`; un lector de pantalla anuncia el fin de un turno |
| 1.13 | **D19** Cablear los 24 `console.error` al sistema de toasts | 11 ficheros | `grep -c 'console.error' frontend/src` ≤ 2 (sólo `ErrorBoundary`) |
| 1.14 | **D12** Sustituir todo color por debajo de 4.5:1 (`gray-600/700`, `opacity-30`, `red-400/60`) | 5 ficheros | Auditoría de contraste de DevTools sin fallos; `grep 'text-gray-[567]00'` = 0 |
| 1.15 | **D11** Los 155 `text-[8..11px]` a la escala; suelo 12px | 20+ ficheros | `grep -rE 'text-\[(8\|9\|10\|11)px\]' frontend/src` = 0 |
| 1.16 | **D34/D35/D36/D37/D30/D31/D33** Los siete bugs pequeños: fase `devil`, `parseRow`, clipboard, `onError`, `matchMedia`, tirador con teclado, skeleton de créditos | 8 ficheros | Un test por bug |

---

### FASE 2 — El acta y el documento · 2-3 días

**Depende de:** Fase 0 (`.doc-prose`).

| # | Tarea | Ficheros | Aceptación |
|---|---|---|---|
| 2.1 | Hoja del acta: `.acta-sheet` con bisel, medida 68ch, cabecera con fecha y recuento | `MarkdownViewer.tsx`, `ArtifactPanel.tsx` | Un acta real muestra h1/h2/h3 diferenciados, viñetas y enlaces subrayados |
| 2.2 | **Efecto de firma: el Sello** (DESIGN §8.3, revisado móvil): `mask-image` con la sangría de tinta **pre-renderizada** (3-4 variantes horneadas offline con feTurbulence como herramienta de generación, elegidas por hash de sesión; **prohibido el filtro SVG en runtime**), color `aniline-500` explícito (nunca `var(--certify)` sobre la hoja), respetando `prefers-reduced-motion` | `components/artifacts/ActaSeal.tsx`, `public/seals/*.svg` | El sello cae una vez al cerrar el acta; con movimiento reducido aparece asentado; ningún `filter: url(` en runtime (`grep -rn 'url(#' frontend/src/components/artifacts/ActaSeal.tsx` = 0); sin frame >16.6 ms en el móvil de referencia (CPU 6×) |
| 2.3 | Extender el mapa `components` de `MessageBubble` a h1-h6, tabla, `hr`, enlace, `strong`, `em`, `img` (o envolver en `.doc-prose`) | `MessageBubble.tsx:253-288` | Una respuesta con encabezados y tabla se ve jerarquizada |
| 2.4 | `SharedSessionPage`: hoja de papel, `.doc-prose`, placas con identidad y votos, `<title>` dinámico. **OG por sesión exige backend** (los crawlers no ejecutan JS en una SPA): endpoint FastAPI que sirva el HTML de `/share/:token` con las metas pre-rendidas para user-agents de crawler, o meta-tags genéricas de producto como alcance de esta tarea y el por-sesión como tarea backend aparte | `SharedSessionPage.tsx` + tarea backend nueva | Meta OG genéricas correctas en un validador; si se hace el endpoint, vista previa por sesión correcta |
| 2.5 | **D29** `MermaidDiagram`: derivar `themeVariables` de `getComputedStyle`; `initialize()` dentro del import dinámico; corregir el error irrecuperable | `MermaidDiagram.tsx` | Cambiar `data-theme` recolorea el diagrama; un contenido corregido tras un error se renderiza |
| 2.6 | **Q6** Próximos pasos como casillas con estado persistido y acción por item | `ActaActions.tsx`, `utils/actaParser.ts` | Marcar un item persiste tras recargar; «→ GitHub» crea un solo issue |
| 2.7 | **D52** `useMemo` en el parseo + validar el `localStorage` de `ActaActions` | `ActaActions.tsx:15-21,41` | Teclear en owner/repo no re-parsea (verificable con el Profiler); un valor corrupto no crashea |

---

### FASE 3 — Shell, mesa y rail · 3-4 días

**Depende de:** Fases 0 y 1.

| # | Tarea | Ficheros | Aceptación |
|---|---|---|---|
| 3.1 | **Efecto de firma: el Grano del Paño** (§8.5, con la lámpara en `body::before` fixed — iOS ignora `background-attachment: fixed`). **Borrar `AuroraBackground.tsx`** y su test, **y los 6 `aurora-blob` locales** de las 3 páginas que tienen el suyo propio | `index.css`, `App.tsx:17,147`, `components/AuroraBackground.tsx`, `tests/components/AuroraBackground.test.tsx`, `ProfilePage.tsx:85,89`, `AgentDetailPage.tsx:405,409`, `ChatSettingsPage.tsx:211,215` | 0 elementos animados en el fondo **en todas las rutas** (no sólo `/`); `grep -rn 'aurora' frontend/src` = 0; GPU en reposo ~0% |
| 3.2 | **Efecto de firma: La Mesa, móvil primero** (§8.1): construir **el Palco** como caso base (banda adherida con todos los asientos + asiento en foco con swipe, diseñado a 390px) y **la Sala** como expansión `lg+` (arco 2D con `translate`/`scale` y lámpara móvil). El arco `preserve-3d` NO se construye en esta fase: queda como mejora opcional tras QA en dispositivo real (texto de 12px sobre planos rotados se empasta) | `components/chat/BoardTable.tsx`, `BoardWarRoom.tsx` | A 390px: todos los asientos visibles sin scroll horizontal, swipe entre asientos en foco, la placa del que habla se alza y la lámpara la sigue. En `lg+`: la Sala en arco 2D |
| 3.3 | **Efecto de firma: la Aguja de Confianza** (§8.2) con `SPRING_NEEDLE`, umbral de 70 en oxblood, `role="meter"` + `aria-valuenow`; en la banda del Palco se dibuja a 32×20 con la cifra en el asiento en foco | `components/chat/ConfidenceNeedle.tsx` | La aguja sobrepasa y se posa; con movimiento reducido salta; un lector de pantalla lee el valor; legible a 32×20 en 390px |
| 3.4 | **Efecto de firma: el Canto / Rail del Orden del Día, móvil primero** (§8.4): caso base = **el Canto** (uñero de 3px en el borde izquierdo, segmentos por fase, cursor ligado al scroll con `animation-timeline: scroll()` + fallback rAF, salto por toque, etiqueta flotante al mantener); `lg+` añade el gutter de 56px con números y nombres al margen vía `animation-timeline: view()` + `@supports` | `components/chat/AgendaRail.tsx`, `MainLayout.tsx` | En 390px el cursor sigue el scroll y tocar un segmento salta a la fase; en `lg+` los nombres aparecen al margen; sin soporte de scroll-timeline todo es visible y funcional |
| 3.5 | `MainLayout`: sidebar a 288px, canal de 56px, panel de 380/480/760 con ancho persistido, `h-dvh` | `MainLayout.tsx` | Sin scroll horizontal del body a 320px; el ancho sobrevive a la recarga |
| 3.6 | Historial agrupado por fecha + **estado vacío** + skeleton | `Sidebar.tsx` | Una cuenta nueva ve un vacío con acción, no una sección ausente |
| 3.7 | Transcript a 68ch, turnos con nombre al margen, filete de identidad de 2px, sin pico | `MessageBubble.tsx`, `ChatPanel.tsx:426` | Medida entre 65 y 75 caracteres a 16px |
| 3.8 | Entrada: `field-sizing: content` con fallback, coste en el botón (**Q10**), `⌘⏎` | `ChatPanel.tsx:558-566` | El textarea crece hasta 8 líneas y luego desplaza |
| 3.9 | **D53** Sustituir los 7 emojis de interfaz por glifos de lucide con `aria-label`; encargar/crear el logo (anillo de sello con arco de mesa) | 5 ficheros, `public/logo.svg` | 0 emojis fuera de `debateTemplates.ts`; favicon propio |
| 3.10 | **D54/D55** Pasada de copy según DESIGN §11 | 8 ficheros | 0 apariciones de «Neuro-Link», «Canal Encriptado», «OBJETOS DETECTADOS», «Pinned», «empezá» |

---

### FASE 4 — Rendimiento · 2-3 días

**Depende de:** Fase 3 (para medir contra la línea base ya limpia).

| # | Tarea | Ficheros | Aceptación |
|---|---|---|---|
| 4.1 | **D17a** `React.lazy` + `Suspense` en las 13 rutas | `App.tsx` | El chunk de entrada baja ≥ 40% (medir con `rollup-plugin-visualizer`) |
| 4.2 | **D17b** `React.lazy` en los 4 visores de artefacto; `mermaid` con `await import()` | `ArtifactRenderer.tsx`, `MermaidDiagram.tsx` | `mermaid` no aparece en el chunk de entrada |
| 4.3 | **D17c** `CodeBlock` con `prism-light` + `registerLanguage` de 8 lenguajes | `CodeBlock.tsx` | El chunk de resaltado baja de ~1 MB a < 60 KB |
| 4.4 | **Unificar el resaltado**: quitar `rehype-highlight` y el tema de `highlight.js`; usar el mismo Prism ligero en el markdown | `MessageBubble.tsx:4,6`, `package.json` | `rehype-highlight` y `highlight.js` fuera de `package.json` |
| 4.5 | **D17d** `React.lazy` en el wizard y en las 5 pestañas de ajustes | `AgentSelectorModal.tsx:8`, `SettingsPage.tsx:28-34` | Abrir `/settings/profile` no carga `IntegrationsSettings` (visible en la pestaña Network) |
| 4.6 | **D20** Selectores atómicos + `useShallow` en los 5 componentes que suscriben todo el store | 5 ficheros | Con el Profiler, un token de streaming re-renderiza **sólo** la burbuja activa |
| 4.7 | **D21** Extraer el parser a `utils/parseMessageParts.ts` + `useMemo` + `React.memo` en la burbuja | `MessageBubble.tsx:240-420`, nuevo | Test unitario del parser (hoy es intestable); el parseo no corre para burbujas que no cambian |
| 4.8 | **D22** Buffer de tokens con `requestAnimationFrame` y actualización dirigida | `useChatStore.ts:647-661` | Un transcript de 100 mensajes recibiendo tokens mantiene ≥ 55 fps |
| 4.9 | Virtualizar el transcript por encima de 80 turnos (ventana propia con `IntersectionObserver`, sin dependencias) | `ChatPanel.tsx:453` | 300 turnos desplazan sin jank |
| 4.10 | **D42** Borrar las 4 constantes de build muertas | `vite.config.ts:7-13`, `vite-env.d.ts:4-7` | `grep '__GIT_COMMIT_SHA__' frontend/src` = 0 |
| 4.11 | `server.proxy` para `/api/v1` en Vite (paridad dev/prod con nginx) | `vite.config.ts` | Una ruta relativa funciona en `npm run dev` |
| 4.12 | Presupuestos en CI: entry ≤ 220 KB gzip, CSS ≤ 45 KB gzip, LCP ≤ 2,0 s en 4G simulada | `.github/workflows/ci.yml` | El job falla al superarlos |

---

### FASE 5 — Calidad de vida · 4-5 días

**Depende de:** Fases 1-4.

| # | Tarea | Ficheros | Aceptación |
|---|---|---|---|
| 5.1 | **Q3** Borrador persistido por sesión + restauración tras fallo de envío (cierra A8) | `hooks/useDraft.ts`, `ChatPanel.tsx` | Escribir, recargar, el texto vuelve; un envío fallido no pierde el texto |
| 5.2 | **Q4** Paleta de comandos `⌘K` (sesiones, agentes, ajustes, acciones, plantillas) | `components/ui/CommandPalette.tsx` | `⌘K` abre; navegable con teclado; `Escape` cierra; ≥ 5 tipos de resultado |
| 5.3 | **Q9** Atajos + hoja con `?` | `hooks/useShortcuts.ts`, `components/ui/ShortcutSheet.tsx` | Los 9 atajos funcionan y aparecen en la hoja |
| 5.4 | **Q5** Deshacer el borrado de sesión (optimista + toast de 8s) | `useChatStore.ts`, `Sidebar.tsx` | Borrar y deshacer restaura la sesión sin llamada de borrado |
| 5.5 | **Q8** Grado de desacuerdo en la cabecera del debate | `components/chat/DisagreementBar.tsx` | 2-1 con confianzas altas pinta «Junta dividida» en oxblood |
| 5.6 | **Q10** Coste y saldo proyectado en el botón + aviso preventivo bajo 5 créditos (cierra B4) | `ChatPanel.tsx`, `useBillingStore.ts` | Con 3 créditos, convocar junta avisa **antes** de escribir |
| 5.7 | **Q11** Densidad configurable | `index.css`, `ProfileSettings.tsx` | Conmutar cambia el alto de fila; persiste; forzado a `comfortable` en táctil |
| 5.8 | **Q1** Modo presentación del acta (`P`) | `components/artifacts/ActaPresentation.tsx` | `P` abre pantalla completa; ←/→ navega; `Esc` sale |
| 5.9 | **Q2** Comparador de directores (`⇧C`) | `components/chat/DirectorCompare.tsx` | Dos directores marcados se muestran enfrentados con sus votos |
| 5.10 | **Q7** Replay del debate + junta de muestra pregrabada para cuentas nuevas | `components/chat/DebateReplay.tsx`, `lib/sampleBoard.ts` | Un acta cerrada se reproduce a 1×/2×/8×; una cuenta nueva ve la junta de muestra sin gastar créditos |
| 5.11 | **Q12** Diff de respuesta regenerada (v1/v2) | `useChatStore.ts`, `MessageBubble.tsx` | Regenerar conserva la versión anterior y muestra el diff |
| 5.12 | **Q13** Onboarding contextual; retirar `OnboardingChecklist` | `hooks/useFirstTimeHint.ts`, `components/OnboardingChecklist.tsx` | 3 pistas contextuales, cada una una vez; 0 llamadas a la API en el montaje para usuarios ya activados |
| 5.13 | **Q14** Export de la junta como HTML autocontenido | `utils/exportBoardHtml.ts` | El fichero se abre sin red y muestra acta, recuento, agujas y transcript |
| 5.14 | **D26/D27** `/reset-password`, `autoComplete`, conmutador de visibilidad, validación en vivo | `LoginPage.tsx`, `RegisterPage.tsx`, `pages/ResetPasswordPage.tsx` | Se puede recuperar una cuenta; el gestor de contraseñas rellena bien |
| 5.15 | **D63** `useUnsavedGuard` en los 4 formularios largos | `hooks/useUnsavedGuard.ts` + 4 ficheros | Salir con cambios pide confirmación (Router 7 + `beforeunload`) |

---

### FASE 6 — Pantallas restantes y tema claro · 4-5 días

**Depende de:** Fases 0-3.

| # | Tarea | Ficheros | Aceptación |
|---|---|---|---|
| 6.1 | **D25** Repintar autenticación sobre el sistema | `LoginPage`, `RegisterPage`, `VerifyEmailPage` | 0 clases `gray-*`/`purple-*`/`pink-*`; ≥ 6 prefijos responsive cada una |
| 6.2 | **D24** `RequireAuth` con tokens, `role="status"`, `min-h-dvh`, URL destino preservada | `RequireAuth.tsx` | Entrar a `/billing` sin sesión y volver a `/billing` tras login |
| 6.3 | **D23** Reescribir `PaywallModal` (tokens, `<Modal>`, cerrar, `useNavigate`, mensaje y destino por razón, explicar los 30 créditos) | `PaywallModal.tsx` | 4 razones → 4 mensajes y 3 destinos; sin recarga de página |
| 6.4 | Shell de ajustes: nav con `aria-current`, pestañas con desvanecimiento, Facturación y Admin dentro | `SettingsPage.tsx` | A 320px todas las pestañas son alcanzables y hay pista visual de scroll |
| 6.5 | Barra de guardado adherida + estado de cambios en las secciones largas | `ProfileSettings`, `AgentDetailPage`, `ChatSettingsPage` | «3 cambios sin guardar» + guardar desde cualquier posición |
| 6.6 | **D28** Guardado real en `ChatSettingsPage` + persistir miembros por API | `ChatSettingsPage.tsx:95-96,231-237` | Editar un miembro sobrevive a la recarga; el botón «Guardar» guarda |
| 6.7 | **D47** Un solo slice para el ajuste de junta | `store/slices/board.ts`, 2 ficheros | Las dos vistas nunca muestran valores distintos |
| 6.8 | `ConnectionsSettings` como acordeón con buscador y estado por servicio | `ConnectionsSettings.tsx` | Un solo servicio abierto; se puede ir a uno concreto sin scroll |
| 6.9 | `AdminPage` con tabla accesible + confirmación del ajuste de créditos + guarda de rol | `AdminPage.tsx` | `<caption>`, `scope`, `aria-sort`; mover créditos exige confirmación |
| 6.10 | Facturación: saldo como cifra grande, cuota con `role="progressbar"`, **cablear `POST /billing/portal`** | `BillingPage.tsx` | El botón de portal abre el portal de Stripe |
| 6.11 | **Tema claro completo** (`data-theme`, conmutador de 3 estados, `prefers-color-scheme`, persistido). Cierra **D61** | `index.css`, `hooks/useTheme.ts`, `ProfileSettings.tsx` | Conmutar recolorea todo, incluidos diagramas y acta, sin fallo de contraste |
| 6.12 | Estados vacíos que faltan (sidebar, buscador del selector, credenciales, contactos, artefactos) | 5 ficheros | Cada uno con glifo, título, frase y una acción |
| 6.13 | Skeletons donde la forma se conoce; retirar los `<p>Cargando...</p>` | 12 ficheros | ≥ 8 skeletons; 0 `Cargando...` a pelo |
| 6.14 | **D64** Mapa de errores → mensaje humano; retirar los 19 `String(e)` | 6 ficheros | 0 `String(e)` en JSX; cada error dice qué pasó, qué hacer y qué se conservó |
| 6.15 | Pasada responsive de los 30 ficheros sin prefijos | 30 ficheros | Sin scroll horizontal del body a 320px en **ninguna** ruta; sin solapes a 400% de zoom |

---

### FASE 7 — Estructura y deuda de tipos · 3-4 días

**Depende de:** Fases 1-6. Se hace al final **a propósito**: refactorizar antes de que la superficie visual esté estable duplica el trabajo.

| # | Tarea | Ficheros | Aceptación |
|---|---|---|---|
| 7.1 | **D40** Partir `useChatStore` en `slices/{session,message,board,artifact,ui}.ts` | `store/` | Ningún fichero > 300 LOC; los 108 tests siguen verdes |
| 7.2 | **D41** Partir `AgentCreationWizard` por sus 5 límites; `useReducer` en lugar de 19 `useState` | `modals/AgentCreationWizard/` | Shell ≤ 200 LOC; ningún paso > 250 LOC |
| 7.3 | Partir `AgentDetailPage` (Toast, DeleteModal, `useAgentDetail`, 3 secciones) | `pages/AgentDetailPage/` | Shell ≤ 200 LOC |
| 7.4 | **D43** Tipar los 67 `any`; `no-explicit-any` a error | 17 ficheros, `eslint.config.js` | `npx eslint src` = 0 errores |
| 7.5 | **D46** `components/ui/` compartido: `Button`, `Field`, `Select`, `Card`, `Badge`, `Skeleton`, `EmptyState`, `Table`, `Tabs`, `SocialButton` | nuevo + 20 ficheros | 0 duplicados de `inputCls`/`SocialButton`; cada primitivo con test de estados |
| 7.6 | **D45** Migrar los 88 hex y 30 `rgba()` a tokens (salvo los 8 de OAuth) | 15 ficheros | `grep -rEn '#[0-9a-fA-F]{6}\|rgba?\(' frontend/src --include=*.tsx` ≤ 8 |
| 7.7 | **D51** `ErrorBoundary` con `resetKeys` + contador; envolver `ArtifactRenderer` | `ErrorBoundary.tsx`, `ArtifactRenderer.tsx` | Un error determinista no entra en bucle; un mermaid roto no tira la ruta |
| 7.8 | **D39** Reescribir `ARCHITECTURE.md` describiendo la estructura real; corregir las 4 filas falsas de `FUNCIONALIDADES.md`; mover `00-START-HERE.md` y `01-PRD.md` a `Docs/legacy/` con banner de OBSOLETO | 4 docs | Ninguna afirmación del doc contradice al código |
| 7.9 | **D56/D57/D58/D48/D49/D59/D62/D65/D66/D67/D69/D70** Los doce restos de P2 | 15 ficheros | Un test o una comprobación por item |

---

### FASE 8 — Verificación y cierre · 1,5-2 días

**Depende de:** todas.

| # | Tarea | Aceptación |
|---|---|---|
| 8.1 | Tests de accesibilidad con `axe-core` en las 13 rutas (nueva devDependency, sólo test) | 0 violaciones críticas ni serias |
| 8.2 | Recorrido completo de teclado en los 8 flujos de §5 | Cada flujo se completa sin ratón |
| 8.3 | Pasada de contraste en los dos temas | Cuerpo ≥ 7:1; el resto ≥ 4.5:1; UI ≥ 3:1 |
| 8.4 | Perfil de rendimiento **contra el móvil de referencia** (DESIGN §7.7: Android gama media ~200 €, emulado CPU 6× + una pasada en hardware real): reposo, streaming, 300 turnos, apertura de artefacto, scroll de landing | Presupuesto por superficie × dispositivo de §7.4/§7.7 cumplido; ≥ 55 fps en streaming y en 10 s de scroll con pulgar; GPU en reposo ~0% |
| 8.5 | Matriz responsive **390** / 320 / 375 / 768 / 1024 / 1440 / 1920 en las 13 rutas (390×844 es la celda de diseño, no una más) | Sin scroll horizontal del body en ninguna celda; en 390px el Palco muestra todos los asientos y el Canto es operable |
| 8.6 | **QA E2E de Board V2** de `PLAN_IMPLEMENTACION_BOARD_V2.md` FASE 7 (nunca ejecutado) | Latencia total < 100 s; sin evento duplicado; votos visibles; acta descargable; cobro 5 → refund 2 verificable en `/me` |
| 8.7 | Ejecutar el detector de diseño de la skill: `node ~/.claude/skills/impeccable/scripts/detect.mjs --json frontend/src` | Sin hallazgos nuevos |
| 8.8 | `grep` del contrato de dirección en `dist/index.html` | La clave `b620ecfd` aparece en el build de producción |
| 8.9 | Actualizar `DESIGN.md` con lo que se construyó de verdad (el sistema se documenta desde el artefacto, no desde la intención) | Cada token de `DESIGN.md` existe en `index.css` y viceversa |

---

### Resumen de esfuerzo

| Fase | Días | Acumulado |
|---|---|---|
| 0 · Tokens | 1,5-2 | 2 |
| 1 · P0 funcionales y a11y | 3-4 | 6 |
| 2 · Acta y documento | 2-3 | 9 |
| 3 · Shell, mesa y rail | 3-4 | 13 |
| 4 · Rendimiento | 2-3 | 16 |
| 5 · Calidad de vida | 4-5 | 21 |
| 6 · Pantallas y tema claro | 4-5 | 26 |
| 7 · Estructura y tipos | 3-4 | 30 |
| 8 · Verificación | 1,5-2 | **31** |

**24-31 días** de una persona. **Camino mínimo defendible (corregido por la auditoría): fases 0 + 1 + 2 completas + el subconjunto de la 3 que porta la identidad (3.1 grano, 3.2 Palco/Sala, 3.4 Canto, 3.7 medida, 3.9 logo/emojis, 3.10 copy) + 4.1/4.2 (lazy de rutas y mermaid) ≈ 12-14 días.** El corte anterior (0+1+2, 7-9 días) dejaba la app *corregida* pero no *rediseñada*: ninguno de los efectos que definen la marca estaba en él, y la «prueba del recuerdo» del checklist final fallaría. Con tráfico mayoritario móvil, el Palco y el Canto (versiones base de 390px de la Mesa y el Rail) NO son aplazables: son lo que ve la mayoría.

Se puede paralelizar en dos vías tras la fase 1: **A** = 2 → 3 → 6 (visual), **B** = 4 → 7 (rendimiento y estructura). La fase 5 necesita las dos. La 6.11 (tema claro) es la única tarea recomendada como **aplazable indefinidamente**: retirar ya la opción muerta del select (D61, 5 minutos en la fase 1) y construir el claro cuando el marketing sobre campo de papel lo ejercite — el contrato ya lo deja preparado con `[data-theme="light"]` inerte.

---

## 8. Riesgos y mitigaciones

| # | Riesgo | Probabilidad | Impacto | Mitigación | Test |
|---|---|---|---|---|---|
| **R1** | *(Corregido por la auditoría: la premisa original — «26 de los 30 test files consultan clases» — es falsa. Son 28 ficheros, sólo 2 mencionan `className` y **0 asertan clases de Tailwind**, verificado por grep.)* El riesgo real del codemod sobre tests es mínimo; el riesgo de tests está en las fases que **reescriben comportamiento**: `ErrorOverlay.test.tsx` (1.12 lo sustituye por toasts), `PaywallModal.test.tsx` (6.3), `Sidebar.test.tsx` (3.6), `CreditsIndicator.test.tsx` (D33), `SettingsPage.test.tsx` (6.4), `OnboardingChecklist` (5.12) | Media | Medio | Mapa tarea→tests afectados antes de cada fase; cada tarea que reescribe un componente adapta o retira su test **en el mismo commit** | `./node_modules/.bin/vitest run` verde en cada commit |
| **R2** | Borrar `tailwind.config.js` parece destructivo y alguien lo revertirá «por si acaso» | Media | Alto | Dejarlo escrito en `ARCHITECTURE.md` y en el mensaje del commit: *Tailwind v4 no lo lee sin `@config`; sus hex contradicen al `@theme` vivo*. El detector de CI (0.8) fallaría si volviera | `test ! -f frontend/tailwind.config.js` en CI |
| **R3** | El `React.lazy` masivo introduce parpadeos de `Suspense` en la navegación | Media | Medio | Un `<Suspense>` por ruta con el skeleton del **layout de esa ruta**, nunca un spinner centrado. Precarga en `onMouseEnter` de los enlaces de la sidebar | Test que navega y comprueba que no aparece un spinner de página completa |
| **R4** | Escribir `.doc-prose` a mano en lugar de instalar `@tailwindcss/typography` deja huecos (definiciones, `sup`, `kbd`, listas de tareas) | Media | Medio | Fixture con un markdown que ejerza **todos** los elementos que GFM puede emitir; revisión visual en los dos temas | Test de snapshot del fixture renderizado |
| **R5** | El buffer de tokens con `rAF` (4.8) puede desordenar tokens de directores en paralelo | Media | **Alto** | El buffer se llena **por rol**, no global; el orden se preserva por `bubbleByRole`, que ya es el mecanismo. Ampliar `tests/store/streaming.test.ts` con dos roles intercalados | Test de streaming con CTO y CFO alternando tokens |
| **R6** | Los selectores atómicos (4.6) pueden dejar la UI desincronizada si se olvida una dependencia | Media | Alto | `useShallow` para objetos, y un test de re-render por componente con el Profiler. No mezclar 4.6 con otras tareas en el mismo commit | Test que verifica que un token re-renderiza sólo la burbuja activa |
| **R7** | El filtro SVG del sello es caro en móviles antiguos | Baja | Bajo | Vive 400ms sobre 96×96 y luego se sustituye por estado pre-renderizado. Se salta entero con `prefers-reduced-motion` o si `navigator.hardwareConcurrency <= 4` | Medición de pintado en un perfil con CPU a 4× |
| **R8** | `animation-timeline: view()` no está en todos los navegadores | Alta | **Bajo** | `@supports (animation-timeline: view())`; sin soporte los nombres al margen son **visibles siempre**, que además es el comportamiento correcto | Test con la feature deshabilitada |
| **R9** | El tema claro (6.11) puede introducir fallos de contraste no vistos | Media | Medio | Los valores de `DESIGN.md §2.6` están calculados contra `paper-100`. El anillo de foco es `brass-700`, **no** `brass-400` (1.61:1 en claro) | Auditoría de contraste automatizada en los dos temas |
| **R10** | Partir el store (7.1) es la tarea con mayor riesgo de regresión funcional | Media | **Alto** | Se hace **al final**, con la superficie visual estable. Un slice por commit, los 108 tests verdes entre cada uno. Sin cambiar ninguna firma pública en el mismo commit | `npx vitest run` verde tras cada slice |
| **R11** | Las 4 fuentes auto-hospedadas pueden superar el presupuesto tras el subseteo | Baja | Bajo | Subsetear con `pyftsubset --flavor=woff2 --layout-features=kern,liga,tnum`. Presupuesto duro de 45 KB por fichero en CI | Comprobación de tamaño en CI |
| **R12** | Añadir `jsx-a11y` en modo error revienta el pipeline con decenas de violaciones el primer día | **Alta** | Medio | Activarlo en la tarea 0.9 en modo `warn`, y **subirlo a `error` al final de la fase 1**, cuando 1.6-1.11 ya han cerrado el grueso | `npx eslint src` = 0 errores al cerrar la fase 1 |
| **R13** | La Mesa 3D puede quedar mal en pantallas muy anchas o con 6+ agentes custom (B11) | Media | Medio | El radio del arco es una custom property calculada del número de asientos; por encima de 6 se pasa a dos filas. Probar con 8 asientos sintéticos | Test visual con 4, 6 y 8 asientos |
| **R14** | *(Rediagnosticado por la auditoría: el riesgo real era el contrario.)* El CI **no corre nunca** — dispara sobre `main` y la rama es `master`, el typecheck era un no-op (`tsc --noEmit` sin `-b`) y `npm test` no es fiable con corepack. No hay red de seguridad, y Railway despliega cada push directo a producción | **Alta** | **Alto** | La tarea **0.0** (nueva) arregla trigger, typecheck y comando de test, verifica una ejecución real en verde, y fija la estrategia de rama larga `redesign/` con previews | Ejecución del workflow visible en GitHub Actions; ningún push del rediseño llega a `master` sin CI verde |
| **R15** | Cambiar el nombre de los tokens rompe la conversación compartida en cachés de CDN | Baja | Bajo | El CSS va con hash de contenido en el build de Vite; nginx sirve `index.html` sin caché | Comprobar los headers de `Cache-Control` tras el deploy |

**Cobertura de test que hay que añadir:** `axe-core` en 13 rutas · recorrido de teclado por flujo · contraste en los dos temas · streaming con dos roles en paralelo · re-render por token con el Profiler · fixture de markdown completo · matriz responsive · presupuestos de bundle. Los 108 tests actuales cubren lógica y **cero** de estas ocho dimensiones.

---

## 9. Checklist de verificación final

Cada línea es comprobable por alguien que no participó en el trabajo.

### Tokens y sistema
- [ ] `test ! -f frontend/tailwind.config.js`
- [ ] `node scripts/check-dead-classes.mjs` → **0** clases muertas
- [ ] `grep -rE '\bprose(-|"| )' frontend/src` → 0
- [ ] `grep -rEn '#[0-9a-fA-F]{6}|rgba?\(' frontend/src --include=*.tsx` → ≤ 8 (sólo logos OAuth)
- [ ] `grep -rE 'text-\[(8|9|10|11)px\]' frontend/src` → 0
- [ ] `grep -rE 'rounded-\[[0-9]+px\]|rounded-(2xl|3xl)' frontend/src` → 0
- [ ] `grep -rn 'fonts.googleapis' frontend/` → 0
- [ ] `grep -rn 'backdrop-blur' frontend/src` → ≤ 1 (velo de modal)
- [ ] Todo token de `DESIGN.md §13` existe en `index.css`, y todo token de `index.css` está en `DESIGN.md`

### Documento
- [ ] Un acta con h1/h2/h3, listas anidadas, tabla, enlaces, `blockquote` y código se ve **jerarquizada** en los dos temas
- [ ] Los enlaces del markdown se reconocen como enlaces sin pasar el ratón
- [ ] Las listas tienen viñetas
- [ ] La medida del transcript está entre 65 y 75 caracteres a 16px
- [ ] El sello cae una vez al cerrar el acta, y no cae con `prefers-reduced-motion`

### Accesibilidad
- [ ] `axe-core`: 0 violaciones críticas ni serias en las 13 rutas
- [ ] Nº de `htmlFor` ≥ nº de `<label>`
- [ ] Tab por toda la app: **cada** elemento accionable muestra anillo de latón
- [ ] Los 4 modales: `role="dialog"`, `aria-modal`, foco atrapado, `Escape`, foco restaurado
- [ ] ≥ 5 regiones `aria-live`; el fin de un turno se anuncia
- [ ] `<html lang="es">`
- [ ] Los 8 flujos de §5 se completan **sin ratón**
- [ ] Con `(hover: none)` emulado, ninguna acción queda oculta
- [ ] Áreas táctiles ≥ 44×44px en `(pointer: coarse)`
- [ ] Con `prefers-reduced-motion`: ninguna animación en bucle, ninguna información perdida
- [ ] Cuerpo ≥ 7:1 · resto ≥ 4.5:1 · UI y bordes ≥ 3:1, en **los dos** temas

### Rendimiento
- [ ] Entry ≤ 220 KB gzip · CSS ≤ 45 KB gzip
- [ ] `mermaid`, `prism` y el wizard **no** están en el chunk de entrada
- [ ] En reposo: **0** animaciones en bucle en el fondo; GPU ~0%
- [ ] En pantalla: ≤ 2 animaciones en bucle simultáneas
- [ ] Streaming con 100 turnos: ≥ 55 fps
- [ ] Un token re-renderiza **sólo** la burbuja activa (Profiler)
- [ ] LCP ≤ 2,0 s en 4G simulada; CLS ≤ 0,05 (sin salto por carga de fuente)

### Responsive
- [ ] 320 / 375 / 768 / 1024 / 1440 / 1920 × 13 rutas: sin scroll horizontal del `body`
- [ ] A 400% de zoom no hay solapes ni texto cortado
- [ ] Tablas, diagramas y código desplazan **dentro** de su contenedor, con `tabindex="0"`
- [ ] Ningún fichero `.tsx` con contenido de layout tiene 0 prefijos responsive

### Producto y copy
- [ ] 0 apariciones de «Neuro-Link», «Canal Encriptado de Extremo a Extremo», «OBJETOS DETECTADOS», «Pinned», «Artifact Workspace», «Document Preview», «empezá»
- [ ] 0 emojis fuera de `debateTemplates.ts`
- [ ] Favicon y logo propios; `vite.svg` borrado
- [ ] Todo botón que gaste créditos dice su coste en el propio botón
- [ ] Las 8 acciones destructivas piden confirmación con el nombre del objeto
- [ ] Todo error dice qué pasó, qué hacer y qué se conservó. 0 `String(e)` en pantalla
- [ ] Se puede recuperar una contraseña

### Cierre
- [ ] `npx tsc -b --noEmit` limpio (**con `-b`**: sin él, este tsconfig solution-style no comprueba nada y la línea pasa siempre) · `npx eslint src` = 0 errores · `./node_modules/.bin/vitest run` verde
- [ ] `grep 'b620ecfd' frontend/dist/index.html` encuentra el contrato de dirección
- [ ] `node ~/.claude/skills/impeccable/scripts/detect.mjs --json frontend/src` sin hallazgos nuevos
- [ ] QA E2E de Board V2 ejecutado: < 100 s, sin evento duplicado, votos visibles, acta descargable, cobro 5 → refund 2
- [ ] `ARCHITECTURE.md` no contradice al código; las 4 filas falsas de `FUNCIONALIDADES.md` corregidas
- [ ] **La prueba del recuerdo:** alguien que ve la app un minuto y la cierra, ¿qué describe una hora después? Si la respuesta es «un chat oscuro con IA», el rediseño no se ha hecho. Si es «la mesa con las placas y el acta sellada», sí.
