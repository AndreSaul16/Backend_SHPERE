# VISUAL_CHECK_2 — segunda revisión visual: las pantallas con datos

**Rama:** `redesign/visual-identity-v3` · **Fecha:** 8 de agosto de 2026
**Método:** Vite dev en `localhost:3000` + Chromium (playwright-core 1.62.x, `chromium-1234`) a **390×844 (DPR 3, táctil) primero** y 1440×900 después.
**Contrato:** `DESIGN.md`
**Capturas:** `/tmp/claude-1000/-home-jarvis-code-SPHERE/547aee8f-16bd-43c9-9f66-4f13b1f9915f/scratchpad/visual/`

> Convención, igual que en `VISUAL_CHECK.md`: **[VISTO]** = sale de una captura que he abierto y mirado. **[MEDIDO]** = valor leído del DOM/CSSOM en el navegador vivo. **[NO VISTO]** = no se ha podido renderizar, y se dice por qué. No hay nada aquí deducido de leer código salvo donde lo diga expresamente. No se ha modificado ningún fichero del proyecto salvo este documento.

---

## 1. Veredicto en tres frases

**El acta funciona y es lo mejor que tiene este producto: Literata se renderiza de verdad, la hoja es papel con tinta oscura y la jerarquía tipográfica es real — el muro gris se acabó.** Pero de los doce efectos de firma de §8 solo **uno** existe (§8.5, el grano del paño): los otros once no están implementados en absoluto —ni la Mesa, ni la Aguja, ni el Sello, ni el Rail—, y lo que ocupa su sitio es una banda de war-room que **no llega a montarse nunca al reabrir un debate**, porque `loadSession` pierde la identidad de grupo de la sesión y la convierte en un chat 1-a-1 con el CEO. Además hay dos fallos que hoy pegan a todos los usuarios en cada carga: **un modal de «Has agotado tus créditos» que salta solo** porque el sondeo de admin devuelve 403, y **el acta clipada a media palabra en escritorio** porque el panel de artefactos le deja 215px de los 1440 de pantalla.

---

## 2. Cómo se sembraron los datos

Reproducible, y sin tocar `src/`. Todo vive en el scratchpad: `harness.mjs`, `fixtures.mjs`, `run-acta.mjs`, `run-debate.mjs`, `run-efectos.mjs`, `diag.mjs`.

1. **Servidor.** `scratchpad/start-vite.sh` arranca `./node_modules/.bin/vite --port 3000 --strictPort` con variables `VITE_FIREBASE_*` ficticias **solo en el entorno del shell**. Sin `.env`, sin build.
2. **Auth.** `ctx.route('**/src/contexts/AuthContext.tsx*')` sirve un módulo JS propio que exporta `AuthProvider` y `useAuth` con un usuario ficticio (`emailVerified: true`, `providerId: 'google.com'`, para pasar el gate de `RequireAuth`). El módulo importa React desde el URL de dep que sirve Vite, descubierto en caliente con una regex sobre el módulo original — así no hay hash quemado.
3. **Store.** `ctx.route('**/src/store/useChatStore.ts*')` descarga el módulo transformado y le **añade** `window.__chatStore = useChatStore`. Con eso se puede sembrar y leer el estado desde el navegador. (Hay que pedirlo sin cabeceras condicionales: un 304 devuelve cuerpo vacío y rompe el módulo.)
4. **Backend.** `ctx.route('**localhost:8000/**')` responde a `/api/v1/sessions/`, `/sessions/:id/history`, `/sessions/:id/pins`, `/agents/`, `/billing/me`, `/me/board-settings`, `/me/scheduled-boards` y `/admin/users` (403, como en producción para un no-admin).
5. **El debate va por el camino real del producto**, no por `setState`: el historial se sirve en el formato del backend que parsea `useChatStore.loadSession` — `{ type: 'human'|'ai', content, additional_kwargs: { agent_role, agent_id, board_phase, board_vote: {decision, confidence}, is_conclusion, timestamp } }` — con los artefactos como XML `<sphere_artifact title=… type=… language=…>…</sphere_artifact>` embebido en el contenido, que es como el backend los persiste. Formas sacadas de `tests/mocks/handlers.ts`, `tests/store/hydration.test.ts` y `useChatStore.ts:469-545`.
   (Corregido en `lanzamiento-p0` · AD-001: aquí ponía `artifact_type=…`, un atributo que no escribe ningún emisor del backend. El error venía de copiar los fixtures de los tests, que llevaban el mismo nombre inventado que el lector del historial buscaba — por eso 844 tests en verde nunca vieron que el acta volvía de la recarga como bloque de código.)
   El debate sembrado: pregunta del usuario, apertura del CEO, CTO **a favor 78**, CFO **en contra 91** (el disenso de §P2), CMO **condicional 64**, Abogado del Diablo **en contra 83** en fase `devil`, y síntesis del CEO marcada `is_conclusion`. Tres artefactos: acta en markdown (encabezados h1-h3, lista con viñetas, lista numerada, tabla de 4 columnas, dos enlaces, cita, código en línea, `hr`), código Python y diagrama Mermaid.
6. **Lo que NO se pudo sembrar por el camino real:** `boardSession` (el estado vivo del war-room). `loadSession` **no lo restaura** — solo lo escriben los eventos SSE del stream, que no existen sin backend. Se inyectó a mano con `window.__chatStore.setState({ boardSession })`, con la forma de `tests/components/BoardWarRoom.test.tsx`. **Y ahí apareció el hallazgo**: para que la banda se monte hubo además que forzar `selectedAgentId: 'group-chat'`, porque al cargar la sesión el store lo había puesto en `ceo-1` (ver F2).

---

## 3. Los doce efectos de firma (§8), uno por uno

Sonda ejecutada en la sesión de debate viva, a 390 y a 1440, con el war-room forzado a montarse.

| § | Efecto | Veredicto | Evidencia |
|---|---|---|---|
| **8.1** | La Mesa / el Palco | **NO LO HE VISTO — no existe.** Lo que hay es `BoardWarRoom`: una banda con 5 placas de 36px, glifo de voto y % debajo, y una barra de fases textual. No es el Palco: no hay asiento en foco, ni swipe, ni lámpara que se desliza, ni arco en `lg+`. Y en móvil la barra de fases es `hidden sm:flex`, o sea **a 390px el orden del día desaparece entero**. Además la banda solo aparece durante un debate en vuelo: al reabrir la sesión no vuelve (F2). | `mesa-1440.png`, `mesa-390.png`, `mesa-banda-1440.png`, `mesa-forzada-1440.png` |
| **8.2** | La Aguja de Confianza | **NO LO HE VISTO — no existe.** [MEDIDO] `document.querySelectorAll('[role="meter"]').length === 0` en las dos anchuras. No hay arco SVG ni aguja: el voto es un chip de texto `✗ EN CONTRA · 91%`. Los 4 `<svg>` de la banda son los iconos `Check` de lucide. Tampoco existe `aria-valuenow`, así que la medida no existe para quien no la ve. | `mesa-banda-1440.png` |
| **8.3** | El Sello | **NO LO HE VISTO — no existe.** [MEDIDO] cero elementos con `mask-image` de sello, cero usos de anilina pintados (`aniline`/`oklch(0.6 0.2 300)` no aparece en ningún `background`, `color` ni `border` del DOM vivo). Las variables `--aniline-*` y `--certify` están declaradas en `index.css` y nadie las consume. Llegué al acta cerrada y con `is_conclusion` y **no cae ningún sello**. | `acta-390.png`, `acta-1440.png` |
| **8.4** | El Rail / el Canto | **NO LO HE VISTO — no existe.** [MEDIDO] cero `[role="navigation"]`, cero elementos con clase de rail. El token `--rail-order:56px` está declarado en `index.css:81` y **nadie lo usa**. No hay filamento en el borde, ni cursor de latón, ni `animation-timeline: scroll()` en ninguna regla viva. | — |
| **8.5** | El Grano del Paño | **LO HE VISTO Y ESTÁ BIEN.** [MEDIDO] `body { background-image: url("/textures/baize-128.webp"); background-blend-mode: overlay }` y la lámpara en `body::before` con `position: fixed` y `radial-gradient(120% 90% at 12% -8%, oklab(0.82 …))` — exactamente lo que pide el documento, incluida la corrección de iOS. Se ve en todas las capturas: tejido en penumbra, luz cálida arriba a la izquierda. | todas |
| **8.6** | La Sesión de Muestra | **NO LO HE VISTO — no existe.** No hay landing: `/` está detrás de `RequireAuth` y rebota a `/login`. No hay `sampleBoard.ts`, ni reproductor de timeline, ni mesa en miniatura. | — |
| **8.7** | El Registro de Actuaciones | **NO LO HE VISTO — no existe.** [MEDIDO] cero `[role="log"]` en el DOM. La cabecera del panel de artefactos dice «ARTIFACT WORKSPACE · 6 OBJETOS DETECTADOS» y no lleva cinta de eventos ni contador. | `acta-1440.png` |
| **8.8** | La Pluma del Acta | **NO LO HE VISTO — no existe.** La tarjeta del acta en el transcript tiene un glifo de pluma y un filete de latón (bonito, ver F-bien-4), pero no hay trazo que avance: en `ArtifactCard.tsx` no hay ningún `scaleX` ni estado «Redactando…». | `debate-final-1440.png` |
| **8.9** | El Latido de la Actuación | **NO LO HE VISTO.** `ToolExecutionCard` existe, pero no lleva anillo `::after` ni barra indeterminada, y **no he conseguido montarlo**: se dispara desde marcadores de contenido que solo emite el stream SSE. Es el único de los doce en el que no puedo separar «no está» de «no lo he sabido sembrar». Lo digo en vez de rellenarlo. | — |
| **8.10** | El Cambio de Sala | **NO LO HE VISTO — no está cableado.** [MEDIDO] `document.startViewTransition` existe en el navegador, pero el único `view-transition-name` del documento es el `root` que pone el propio navegador; ningún elemento de la app declara uno. Y no hay un solo `viewTransition` en `src/` (ni en `<Link>` ni en `navigate`). Navegar entre rutas es un corte seco. | — |
| **8.11** | La Deliberación | **NO LO HE VISTO — no existe** el filamento de identidad. Lo que hay es peor que nada según §0: la placa de quien habla lleva un `box-shadow` animado **en bucle infinito** (`0 0 14px <hex>99` ↔ 0, `repeat: Infinity`, 1.4s) — o sea un **glow perpetuo**, que es justo lo que §0 rechaza. No hay `scaleX` alimentado por tokens, ni fase que engorde. | `mesa-forzada-1440.png` |
| **8.12** | Las Cifras que Asientan | **NO LO HE VISTO — no existe.** El indicador de créditos pinta `37 +120 FREE` de golpe, sin rodillo, sin máscara de `overflow:hidden`, sin subrayado de latón. [MEDIDO] `font-variant-numeric: tabular-nums` sí está presente en 7 nodos, que es la mitad barata del efecto; el rodillo no. | `artefacto-mermaid-1440.png` (arriba a la derecha) |

**Recuento: 1 visto y bien · 10 no existen · 1 no verificable (8.9).** De los once que la primera revisión no pudo ver, ahora sé que diez **no están escritos**, no es que no se vieran.

---

## 4. El acta y Literata — lo que se ve exactamente

**Sí. Literata se renderiza, y el acta ya no es un muro gris.** Esto es lo más importante de este informe y está verificado por tres vías independientes.

**[MEDIDO] en el navegador vivo, sobre el texto real del acta:**

```
document.fonts.check('16px Literata')            → true
[...document.fonts]  → Archivo|loaded  Literata|loaded  Literata|loaded|italic  JetBrains Mono|loaded
sonda de anchura, 40px, mismo texto:  Literata 695px  vs  Georgia 625px   → son fuentes distintas
```

Es decir: no es que el `.woff2` responda 200 (eso ya lo sabíamos), es que **el glifo que se pinta es de Literata y no del fallback**.

**[MEDIDO] la jerarquía, elemento por elemento dentro de `.doc-prose`:**

| Elemento | Familia | Tamaño | Peso | Color |
|---|---|---:|---:|---|
| `h1` | Literata | 33.18px | 600 | `oklch(0.245 0.016 158)` |
| `h2` | Literata | 27.65px | 600 | idem, con filete inferior |
| `h3` | Literata | 23.04px | 600 | idem |
| `p` | Literata | 16px | 400 | `oklch(0.32 0.018 158)` |
| `strong` | Literata | 16px | **650** | `content-strong` |
| `em` / `blockquote` | Literata | 16px | 400 | *itálica real*, no oblicua sintética |
| `a` | Literata | 16px | 400 | `oklch(0.52 0.09 82)` = latón sobre papel, **subrayado** |
| `li::marker` | — | — | — | latón |
| `code` | JetBrains Mono | 14px | 400 | chip con relleno y filete |
| `table` / `th` | Archivo | 14px / micro | — | versalitas con tracking, `tabular-nums` |

Cuatro tamaños distintos y tres pesos: **hay jerarquía real, no un bloque plano**.

**[MEDIDO] la hoja:** `.acta-sheet` tiene `background: oklch(0.988 0.006 88)` (papel) con `color: oklch(0.32 0.018 158)` (grafito), radio 12px y el bisel de 6px por `clip-path`. El re-mapeo de contexto de variables funciona: dentro de la hoja los enlaces y las viñetas salen en `brass-800` y la cita en `oxblood-600`, todos legibles sobre papel — que era exactamente el bloqueante B9.

**[VISTO], `acta-390.png`:** sobre el paño oscuro, una hoja color crema. «Acta de la Junta Directiva» en un serif pesado y negro, a tres líneas. Debajo, en cuerpo: «**Sesión:** `junta-q4-enterprise` · **Fecha:** 8 de agosto de 2026 · **Quórum:** 5 de 5», con el id de sesión en un chip monoespaciado gris. Una regla horizontal. «1. Orden del día» como h2 con su filete. Un párrafo en Literata. Y la cita del orden del día en itálica con una barra vertical oxblood a la izquierda y un lavado rosado de fondo. **Es un documento, no una transcripción.**

**[VISTO], `acta-tabla-390.png`:** la tabla financiera sale con encabezados en versalitas micro (`CONCEPTO`, `Q4 ADELANTADO`), cifras alineadas a la derecha con cifras tabulares (`148.000 €`, `41.500 €`, `189.500 €`) y filetes finos entre filas. Se lee bien. **Pero solo caben 2 de las 4 columnas**: las otras dos están cortadas fuera de la hoja, sin ninguna señal de que existan (F4).

**El pero grande.** [VISTO] `acta-1440.png`: en escritorio el acta está **clipada a media palabra**. El panel de artefactos se lleva unos 450px del ancho, de los cuales 224px son el carril de pestañas, y a la hoja le quedan ~215px de los 1440 de pantalla. El h1 sale como «Acta / de / la / Junt‸ / Direc‸», partido y cortado por el borde derecho. El entregable del producto, en la pantalla donde más sitio hay, es ilegible por defecto (F3). En móvil el problema es de otra forma: la hoja mide 261px con 32px de padding, o sea **197px de medida de lectura** — unos 25 caracteres por línea — porque el carril de pestañas se queda ocupando 64px incluso a 390px.

---

## 5. Fallos

Severidad por lo que sufre el usuario.

| Sev | Qué se ve | Dónde | Captura |
|---|---|---|---|
| **P0** | **F1 — Un modal de «Límite Alcanzado · Has agotado tus créditos» salta solo en cada carga, a todo usuario que no sea admin, y tapa la aplicación.** El `Sidebar` sondea `/admin/users` para decidir si enseña el enlace de Admin; el backend contesta **403** («no eres admin», que es la respuesta correcta); `inferCodeFromStatus` mapea 403 → `perm.plan_not_allowed`; `handleError` llama a `billing.openPaywall('upgrade_cta')`. El usuario aterriza en un aviso falso de que se ha quedado sin créditos. Reproducido en las dos anchuras y en todas las rutas del producto. [VISTO, y el 403 sale literal en consola] | `Sidebar.tsx:64-73` (sonda) · `services/errorHandler.ts:112-118` (403→`perm.plan_not_allowed`) · `errorHandler.ts:146` (→ paywall) | primera pasada de `acta-390.png` / `acta-1440.png` (antes de descartarlo) |
| **P0** | **F2 — Al reabrir un debate de junta, la sesión deja de ser una junta.** La sesión trae `base_agent_id: 'group-chat'`, pero `loadSession` hace `detectedAgentId = session.base_agent_id \|\| 'group-chat'` y acto seguido `if (detectedAgentId === 'group-chat') { … inferir del primer mensaje }` — o sea que **precisamente cuando la sesión SÍ es de grupo, la descarta** y se queda con el `agentId` del primer turno (`ceo-1`). [MEDIDO] tras cargar: `selectedAgentId: "ceo-1"`, `boardSession: null`. Consecuencia en cadena: `isGroupChat` es falso → **la mesa de directores no se monta nunca**, el coste pasa de «5 por debate» a «1 por mensaje», el nombre del rol en la cabecera cambia, y **todas las burbujas del debate se pintan con el color del CEO** en vez del suyo. La banda solo se ve forzando el estado a mano. | `useChatStore.ts:549-560` | `debate-inicio-1440.png` (sin banda) vs `mesa-forzada-1440.png` (forzado) |
| **P0** | **F3 — El acta sale clipada a media palabra en escritorio.** El panel abre con `DEFAULT_PANEL_WIDTH = 450px`, de los que **224px fijos** son el carril de pestañas (`w-56`); a la hoja le quedan ~215px de los 1440 de pantalla. «Junta Directiva» se corta como «Junt», «Direc»; `junta-q4-enterprise` como `enterpris`. Se puede ensanchar arrastrando hasta 800px, pero **el tirador es `hidden xl:flex`** (solo ≥1280px) y nada indica que el documento esté cortado: el defecto es lo que ve todo el mundo. Es el entregable del producto, en la pantalla que más sitio tiene. | `MainLayout.tsx:14-17,152,184` · `ArtifactPanel.tsx:60` (`w-16 sm:w-56` fijo) · `MarkdownViewer.tsx:49` | `acta-1440.png` |
| **P1** | **F4 — La tabla del acta se desborda y se corta sin aviso.** [MEDIDO] a 390px el visor tiene `clientWidth 325` y `scrollWidth 463`: 138px de contenido fuera de vista. `.doc-prose table` es `inline-size:100%` sin envoltorio `overflow-x:auto`, así que con 4 columnas la tabla revienta la hoja. Se ven 2 columnas de 4 y nada indica que falten dos. | `index.css:446` | `acta-tabla-390.png` |
| **P1** | **F5 — Los cinco directores son visualmente el mismo.** `ChatPanel` pasa `agentColor={effectiveBubbleColor}` a **todas** las burbujas, y en `MessageBubble` `activeHexColor = agentColor \|\| agent?.hexColor` — el color de sesión gana siempre y el color de identidad del agente **nunca llega al transcript**. [MEDIDO] con la sesión de grupo: Oberon, Nexus, Ledger, Vortex y Némesis salen los cinco con `rgb(215,169,79)` (latón) de etiqueta, borde y resplandor. Los hex de §2.8 sí están bien migrados en el store (`#B290EC`, `#00BFB0`, `#7BA2F9`, `#DF80B8`, `#ED7F84`) y **se ven correctos en las placas de la banda** — pero en el transcript, que es donde se lee el debate, se pierden. §P2 dice que el desacuerdo es la señal; aquí el desacuerdo se distingue solo por el nombre. | `ChatPanel.tsx:485` · `MessageBubble.tsx` (`activeHexColor`) | `mesa-forzada-1440.png` |
| **P1** | **F6 — El chip de voto no dice nada por color.** `✓ A FAVOR · 78%`, `✗ EN CONTRA · 91%` y `~ CONDICIONAL · 64%` se pintan **todos con el mismo color**, el de la burbuja (latón en grupo, lila si la sesión quedó en CEO por F2). §2.4 reserva el oxblood para el disenso y §2.5 la anilina para el sello: aquí el voto en contra con 91% de confianza —la señal más importante del producto— es cromáticamente idéntico al voto a favor. Solo el glifo `✓ ✗ ~` distingue. | `MessageBubble.tsx` | `mesa-forzada-1440.png` |
| **P1** | **F7 — `/billing` se queda en esqueletos para siempre.** Con `/api/v1/billing/me` devolviendo un cuerpo válido (el indicador de créditos de la cabecera **sí** pinta `37 +120 FREE`), la página de Facturación no sale nunca del estado de carga: tres bloques grises y nada más, sin mensaje, sin reintento, sin timeout. [MEDIDO] `document.body.innerText.length = 217`, que es solo la barra lateral. Necesita algún endpoint más que mi stub no cubre — pero el modo de fallo (esqueleto perpetuo mudo) es un fallo de la pantalla, no de mi fixture. | `BillingPage.tsx` | `billing-1440.png`, `billing-390.png` |
| **P2** | **F8 — Bucles de animación infinitos en el transcript, uno por turno.** [MEDIDO] `MessageBubble.tsx:258` pinta `<span class="h-1 w-1 rounded-full bg-current animate-pulse">` en **cada** burbuja de agente, hable o no, para siempre. Con 6 turnos son 6 bucles perpetuos, y crecen con el debate. §7.4 prohíbe los bucles infinitos de fondo y §8.11 solo presupuesta **uno**, el de quien está hablando. Se suman el icono del estado vacío del panel de artefactos (`ArtifactPanel.tsx:127`) y el `box-shadow` en bucle de la placa activa (§8.11 arriba). | `MessageBubble.tsx:258`, `ArtifactPanel.tsx:127`, `BoardWarRoom.tsx:85-90` | `debate-inicio-1440.png` |
| **P2** | **F9 — Resplandor y cian heredados en las burbujas.** [MEDIDO] toda burbuja de agente lleva `box-shadow: rgba(215,169,79,0.063) 0 0 20px` — un glow, que §0 rechaza. Y la burbuja de usuario lleva `border-color: rgba(34,211,238,0.125)`, o sea el `#22D3EE` de la paleta vieja escrito a pelo, no el `--agent-user` (`#2EB2EA`) de §2.8. La burbuja de usuario **se lee bien** (tinta `ink-100` sobre un lavado teal al 12%), pero el filete es del sistema anterior. | `MessageBubble.tsx` | `debate-inicio-1440.png` |
| **P2** | **F10 — Restos del diseño viejo en el panel de artefactos.** [VISTO] el visor de código lleva los **tres puntos de semáforo de macOS** (rojo/ámbar/verde) como decoración; `MarkdownViewer.tsx:23` tiene `bg-[#0d0d12]` a pelo y `hover:text-electric-cyan`; `ArtifactPanel.tsx:34,94,125` sigue usando `luxury-purple` para el icono, la pestaña activa y un `blur-3xl` de fondo; y el tirador de redimensionar del panel es `hover:bg-electric-cyan/10`. El resaltado de sintaxis es `atom-one-dark` (azules y rojos de VS Code), ajeno a la paleta. | `CodeBlock.tsx`, `MarkdownViewer.tsx:23,34`, `ArtifactPanel.tsx:34,94,125`, `MainLayout.tsx:184` | `artefacto-codigo-390.png`, `artefacto-mermaid-1440.png` |
| **P2** | **F11 — Inglés y jerga en la superficie del producto.** [VISTO] «ARTIFACT WORKSPACE», «6 OBJETOS DETECTADOS», «DOCUMENT PREVIEW», «ARCHITECTURE PREVIEW», «READ ONLY MODE», «SIZE: 0.4 KB · LINES: 14», «ENGINE: MERMAID_JS · RENDER: SVG_VECTOR · STATUS: DYNAMIC», la insignia «SYSTEM» en la cabecera de la junta, y en Ajustes la pestaña «Board Meeting» y el campo «STAGE». §11 pide un idioma; el pie del visor Mermaid además es voz de la marca anterior. | `ArtifactPanel.tsx`, `MarkdownViewer.tsx`, `CodeBlock.tsx`, `MermaidDiagram.tsx`, `SettingsPage.tsx` | `acta-390.png`, `artefacto-codigo-390.png`, `artefacto-mermaid-1440.png`, `settings-390.png` |
| **P2** | **F12 — El diagrama Mermaid sale ilegible.** [VISTO] renderiza bien (grafo real con rombo de decisión y siete cajas), pero dentro del panel estrecho los nodos miden ~50px y el texto es ilegible; no hay zoom ni ajuste al ancho. Los nodos salen en gris/blanco, no en la paleta de marca. | `MermaidDiagram.tsx`, `ArtifactPanel.tsx` | `artefacto-mermaid-1440.png` |
| **P2** | **F13 — El carril de pestañas de artefactos se come el móvil.** A 390px mantiene 64px fijos con solo iconos, dejando la hoja en 261px. En una pantalla donde el acta es el producto, un octavo del ancho es un índice de iconos indistinguibles. | `ArtifactPanel.tsx:60` | `acta-390.png`, `artefacto-codigo-390.png` |
| **P3** | **F14 — Emoji como avatar de agente, y etiqueta truncada en la placa.** [VISTO] la placa del Abogado del Diablo pinta `⚔️` a todo color y la de la junta `🏛️`; §10 pide glifo de línea, no emoji (la cabecera del chat sí lo hace bien, con `Landmark`). Y en la celda de 48px la etiqueta de estado se corta a «HABLA…» en vez de «hablando». | `useChatStore.ts:151,211` · `BoardWarRoom.tsx:113` | `mesa-banda-390.png` |
| **P3** | **F15 — Radios fuera de escala en Ajustes.** Las pestañas (`Perfil`, `Conexiones`, `Board Meeting`) son píldoras completamente redondeadas; §6 fija 2/4/8/12px. La fila de pestañas además se corta a 390px sin señal de que haya más. | `SettingsPage.tsx` | `settings-390.png` |
| **P3** | **F16 — Artefactos duplicados al cargar la sesión.** Tres artefactos aparecen como seis pestañas: `loadSession` hace `artifacts: [...state.artifacts, ...sessionArtifacts]` sin deduplicar ni guardia de petición en vuelo, y con el doble montaje de `StrictMode` entran dos veces. **Es dev-only por StrictMode**, pero el mismo hueco lo abre un doble clic en el historial. Lo marco P3 por eso. | `useChatStore.ts:567` | `acta-1440.png` (6 pestañas) |

**Resumen: 3 P0 · 4 P1 · 6 P2 · 3 P3 = 16 fallos.**

---

## 6. Errores de consola

**En la sesión de debate con datos, a 390 y a 1440, literal y completo:**

```
warning: VITE_API_URL is undefined, using fallback: http://localhost:8000/api/v1
error:   Failed to load resource: the server responded with a status of 403 (Forbidden)
error:   Failed to load resource: the server responded with a status of 403 (Forbidden)
```

Eso es todo. Los dos 403 son el sondeo de `/admin/users` del `Sidebar` (dos veces por el doble montaje de `StrictMode`), y son **la causa del P0 del paywall** — no son ruido: en producción, con un usuario no admin, salen igual. El *warning* de `VITE_API_URL` sale porque arranqué el servidor sin esa variable a propósito, para que la app usara su propio valor por defecto.

**Cero `pageerror`. Cero excepciones de React. Ningún `TypeError`.** Los dos `TypeError` que el informe anterior atribuía a sus stubs no reaparecen con fixtures buenos: eran, como decía, instrumentación.

**Ruido de mi entorno, no de la app** (lo dejo para que nadie lo persiga): en una de las pasadas a `/admin` en móvil la red de WSL se cayó a mitad y el navegador escupió ~180 × `net::ERR_NETWORK_CHANGED` y un `SPHERE no ha podido arrancar: TypeError: Failed to fetch dynamically imported module: /src/App.tsx`. La misma ruta a 1440 cargó sin un solo error. Es el túnel de red, no el código. Lo bueno: **la pantalla de arranque fallido (`StartupError`) hace su trabajo** — dice «SPHERE no ha podido arrancar / La aplicación no se ha podido inicializar. Suele ser una variable de entorno que falta…» en vez de dejar la página en blanco, que era el P1 del informe anterior.

---

## 7. Qué sigue sin verse, y por qué

- **§8.9 El Latido.** `ToolExecutionCard` solo se monta desde marcadores que emite el stream SSE. Sin backend no supe sembrarlo. Es el único de los doce del que no puedo decir si está o no.
- **El streaming de verdad**: tokens llegando, «X está escribiendo», el cursor, el `aria-live` de resumen, la intervención en caliente. Todo eso vive en `chatService.streamChat` y necesita un SSE real. Lo he visto en estado terminado, no en vuelo.
- **El acta cerrada como estado**: llegué a un acta con `is_conclusion`, pero no existe un estado «acta sellada» que disparar, porque el sello no está implementado.
- **`prefers-reduced-motion`** (§7.6): no evaluado.
- **Tema claro**: no evaluado.
- **Rendimiento y curvas de §7**: las capturas son estáticas. He contado bucles infinitos (F8) pero no he medido `long tasks` ni FPS.
- **Safari iOS de verdad**: todo es Chromium emulando. `env(safe-area-inset-*)`, `h-dvh` y el swipe no se juzgan así.
- **`/billing` con datos** (F7) y **`/admin` con un usuario admin**: mi stub devuelve 403 a propósito, que es el caso del 99% de usuarios; el panel de admin real no se ha visto.
- **`/agents/:id` y `/profile`**: pintan (934 y 545 caracteres de texto, cero scroll horizontal) y están capturados en `agente-390/1440.png` y `perfil-390/1440.png`, pero no los he auditado en detalle: se me acabó el margen antes que las pantallas.

---

## 8. Lo que está bien — no lo toquéis

1. **El acta.** Es el mejor trabajo de esta rama. Literata renderizada de verdad, hoja de papel con bisel, cuatro tamaños de encabezado, cita con barra oxblood, viñetas y enlaces en latón, tabla con versalitas y cifras tabulares, código en JetBrains Mono. El re-mapeo de contexto de variables de `.acta-sheet` es la decisión técnica que lo hace posible y que evita repintar elemento a elemento. **El muro gris está resuelto.**
2. **El grano del paño y la lámpara (§8.5).** Verificados otra vez en vivo, exactos al contrato. Sigue siendo el efecto más distintivo y el más barato.
3. **La banda de la junta, cuando se monta.** `mesa-forzada-1440.png`: cinco placas con el color propio de cada director (los hex de §2.8 **sí** están migrados en el store), glifo de voto y porcentaje, check verde de turno cerrado, barra de fases con «OBJECIÓN» en latón y las despachadas en `ink-300`, el recuento «La junta votó 2 a favor · 1 en contra · 1 condicional» y el coste en créditos. Está bien pensada. El problema no es ella, es que F2 no la deja aparecer.
4. **La tarjeta del acta en el transcript.** Filete de latón, glifo de pluma, «DOCUMENT · 2.8 KB» y un botón «Ver acta»: se distingue de las tarjetas de código sin decirlo con palabras. Es el mejor detalle pequeño del rediseño.
5. **El transcript se lee.** Burbujas de paño con filete de 1px y radios cortos (`4px 8px 8px`), listas numeradas con marcador de latón, itálicas y negritas del markdown correctas, hora al pie. La burbuja de usuario **se lee bien**: `ink-100` sobre lavado teal al 12%.
6. **Cero scroll horizontal a nivel de documento**, en las dos anchuras y en las siete rutas visitadas. [MEDIDO] `scrollWidth === clientWidth` siempre.
7. **`/settings` a 390px es sólido.** Tarjetas de paño, filetes, etiquetas en versalitas micro, campos con relleno de paño y foco de latón, todo apilado sin desbordes.
8. **`StartupError`.** Cuando el arranque falla de verdad, ahora hay una pantalla que lo dice en vez de una página en blanco. El P1 del informe anterior está cerrado.
9. **Cero excepciones de JavaScript** en todo el recorrido con datos reales.

---

## 9. Nota de método

- Servidor: `./node_modules/.bin/vite --port 3000 --strictPort` con `VITE_FIREBASE_*` ficticias solo en el entorno del shell. **Ningún build.** El servidor quedó detenido al terminar.
- Las superficies autenticadas y los datos se alcanzaron interceptando respuestas HTTP en el navegador (módulo de auth, módulo del store, API de `localhost:8000`). **Ningún fichero del repositorio fue modificado**; `git status` sigue limpio salvo `VISUAL_CHECK.md` (del informe anterior) y este documento.
- Los guiones de siembra están en el scratchpad de la sesión, no en el repositorio.
