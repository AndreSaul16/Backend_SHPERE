# AUDIT_FINAL_V3 — FASE 8: verificación y cierre del rediseño visual v3

**Fecha:** 2026-08-08 · **Rama:** `redesign/visual-identity-v3` · **Auditor:** agente final, sin participación en las fases 0-7.
**Método:** todo hallazgo de este informe proviene de ejecutar un comando, de leer el fichero citado o de medir en el DOM vivo (Chromium contra el dev server, arnés con auth stub y backend simulado, temas conmutados por `data-theme`, ratios calculados sobre los colores computados del CSSOM — no deducidos de los tokens). Donde algo no se pudo medir en este entorno, se dice con esas palabras.

---

## 1. Veredicto

**APTO CON RESERVAS.**

Los cuatro criterios de salida están en verde, las 13 rutas pasan axe sin violaciones críticas ni serias, la matriz responsive no tiene un solo píxel de scroll horizontal y las nueve cargas heredadas de fases anteriores están medidas — y siete de ellas, arregladas y verificadas en esta fase. Las reservas son dos, y ninguna la puede levantar este entorno: **el perfil de rendimiento contra el móvil de referencia (8.4) y el QA E2E de Board V2 (8.6) no se han ejecutado** — necesitan un backend vivo, una sesión Firebase real y un dispositivo físico de la clase Redmi Note/Galaxy A que aquí no existen. Lo que no abrí, no lo verifiqué: esas dos tareas deben correr antes del *go* definitivo, y abajo está escrito exactamente qué falta para cada una.

---

## 2. Criterios de salida — ejecutados al cierre, tras los 9 commits de esta fase

| Comprobación | Resultado |
|---|---|
| `./node_modules/.bin/tsc -b --noEmit` | **exit 0** |
| `./node_modules/.bin/vitest run` | **101 ficheros, 827 tests, todo verde** |
| `node scripts/check-dead-classes.mjs` | **0 muertas** (183 ficheros, 1020 clases vivas, 0 avisos) |
| `npx eslint src` | **exit 0, 0 errores** |

Greps del contrato (§13.1 de DESIGN): hex en `.tsx` = **8** (los logos OAuth de `AuthShell.tsx`, techo permitido) · `text-[8-11px]` = 0 · radios fuera del sistema = 0 · `fonts.googleapis` = 0 · `tailwind.config.js` no existe · claves de token numéricas = 0 · `eslint-disable` = 5, ninguno de `no-explicit-any` · `backdrop-blur` en `.tsx` = 2, los dos velos e4 legítimos (modal y cajón móvil; documentado ahora en §13.1). Fuentes en `public/fonts/`: 100.700 + 119.080 + 121.864 + 23.040 B — cada una dentro de su presupuesto de §3.1 y los tres críticos suman exactamente los 341.644 B declarados como techo.

---

## 3. Las nueve tareas, una a una

### 8.1 axe-core en las 13 rutas — EJECUTADA (en navegador, no como suite)
axe-core 4.x inyectado en Chromium sobre las 13 rutas (`/login`, `/register`, `/verify-email`, `/reset-password`, `/share/:token`, `/`, `/chat/:id` con junta sembrada, `/profile`, `/chat/settings`, `/agents/:id`, `/settings/:section`, `/billing`, `/admin`), tema oscuro, 1440px. **Primera pasada: 5 violaciones critical/serious en 3 rutas** — botón de ajustes de conversación sin nombre (critical), chip «✗ EN CONTRA» a 4.01:1 (serious), enlace de volver sin nombre en Perfil y Facturación (serious ×2), distintivo POPULAR a 2.77:1 (serious). **Las cinco arregladas** (commits `3d91c0f`, `06529da`) **y re-medidas: 0 critical/serious en las 13 rutas.**
*Matiz honesto:* la tarea pedía axe como devDependency de test; no existe tal suite — la pasada fue en vivo, que es más fiel pero no queda en CI. Añadir la suite es deuda menor (axe-core ya está en `node_modules` como transitiva).

### 8.2 Recorrido de teclado de los 8 flujos — EJECUTADA POR MUESTREO, no exhaustiva
Con teclado real (CDP): 22 paradas de Tab en `/chat` — **las 22 con anillo de latón de 2px, 0 accionables sin anillo**; el selector de agentes abre como `role="dialog"` + `aria-modal` + etiquetado, **foco dentro, atrapado durante 25 tabs, `Escape` cierra y el foco vuelve al disparador**; el tirador del panel de artefactos es `role="separator"` con `tabIndex=0` y **←/→ mueven `aria-valuenow` (480→512)**; el Canto expone 5 botones de fase tabulables. Los 8 flujos completos de §5, de punta a punta y sin ratón, **no se recorrieron uno a uno**: lo verificado es la maquinaria que esos flujos comparten. Queda como pasada manual de 1-2 horas antes del go.

### 8.3 Contraste en los dos temas — EJECUTADA, y era la carga más pesada
Barrido programático de todos los nodos de texto visibles sobre su fondo efectivo real (con alphas compuestos), en `/chat` con junta sembrada, ambos temas. **Estado inicial medido: 3 fallos en oscuro, 19 en claro + toda la identidad de agente.** Estado final tras los arreglos: **1 único par por debajo de AA en cada tema, y es el botón de enviar deshabilitado** (`ink-500` sobre `baize-700` = 3.04:1 oscuro; 4.43:1 claro) — exento por §9.1 y WCAG (control inactivo), con la cifra ya documentada en el propio DESIGN. Detalle en §4.

### 8.4 Perfil de rendimiento contra el móvil de referencia — **NO EJECUTADA**
No la ejecuté y nada de ella debe darse por cumplida. Exige: (a) un debate real de 4 agentes en streaming — no hay backend vivo ni sesión Firebase en este entorno; (b) 300 turnos reales; (c) emulación CPU 6× con traza de Performance, y (d) **una pasada en hardware físico de la clase Redmi Note/Galaxy A (§7.7), que ningún entorno virtual sustituye**. Lo único medido aquí, en reposo con junta sembrada: **1 solo bucle de animación corriendo** (el punto de 4px de «está hablando», el único presupuestado para esa superficie), **0 gradientes lineales/cónicos** pintados y 0 animaciones huérfanas — el presupuesto de §7.4 se cumple en reposo. Todo lo demás (fps en streaming, p95 de scroll, capas compuestas, TBT de la landing) está **sin medir**.

### 8.5 Matriz responsive — EJECUTADA
7 anchuras (320/375/390/768/1024/1440/1920) × 13 rutas = 91 celdas: **0 px de scroll horizontal del body en las 91**. En 390×844 con junta de 5 sembrada: **las 5 placas del Palco visibles a la vez** (56.8px cada una, sin scroll oculto de asientos) y **el Canto presente como `nav[aria-label="Orden del día"]` con 5 segmentos accionables**. La celda de diseño cumple lo que §0 promete.

### 8.6 QA E2E de Board V2 — **NO EJECUTADA**
Exige backend vivo (está en `Backend_SHPERE`, que leí pero no toqué), sesión Firebase real, y verificar: latencia total <100s, ausencia de evento SSE duplicado, votos visibles, acta descargable y cobro 5 → refund 2 contra `/me`. Nada de eso se puede simular honestamente con un backend stubbed — un stub verificaría mi propio stub. Sigue siendo la única tarea del plan de Board V2 que **nunca se ha ejecutado**, y es reserva de este dictamen.

### 8.7 Detector de diseño de la skill — EJECUTADA
`detect.mjs --json src` → **7 hallazgos, ninguno nuevo ni accionable**: 3 «side-tab» que son exactamente el filete de identidad que DESIGN §9.3/§9.11 prescribe (el detector genérico choca con la firma del sistema); 1 «bounce-easing» que es `--ease-impact`, el único uso documentado en §7.1; 2 «broken-image» que son falsos positivos sobre `AvatarImage` (el componente que existe precisamente para el `onError`) y un comentario de CSS; y 1 `animate-bounce` en la Sidebar que **viene de `master`** (verificado con `git log -S`: anterior al rediseño). Este último es el indicador «Debatiendo» — 3 puntos en bucle mientras hay streaming: honesto pero son 3 bucles donde el presupuesto shell móvil da 1; anotado como deuda menor.

### 8.8 Contrato de dirección en `dist/index.html` — VERIFICADA EN FUENTE; el build queda para CI
**Compilar está prohibido en este entorno por decisión del propietario, y no compilé.** Lo verificado: la clave `b620ecfd` está en `frontend/index.html` (línea 85), dentro del comentario del contrato de dirección, **primer hijo de `<body>`** como manda §0, y `dist/` no existe en el árbol. La verificación real — `grep b620ecfd dist/index.html` tras `vite build` — es un paso de CI de una línea; conviene saber que Vite conserva los comentarios HTML de `index.html` por defecto, pero *afirmarlo sobre este build sin ejecutarlo sería inventar*: que lo confirme el pipeline.

### 8.9 DESIGN.md se documenta desde el artefacto — EJECUTADA (commits `5516e69`, `db5c77f`)
Diff mecánico de tokens en las dos direcciones. Dirección DESIGN→css: **0 ausentes** (ya antes de esta fase). Dirección css→DESIGN: faltaban **los 8 tokens de layout de §4.2** en el bloque §13 (existían en `index.css` desde la corrección R7), **`--surface-code` y `--content-gutter`** (fase 7, sin documentar en ninguna parte) y **los 7 alias del SHIM**. Todo añadido: los layout y los dos nuevos, al bloque; el SHIM, como §13.0 — deuda declarada con sus números (~210 usos vivos), porque documentar no es legitimar para siempre. Además §2.7 recoge la recalibración de los semánticos claros (medida, ver §4) y §13.1 el segundo velo e4. Diff final: **0 y 0**.

---

## 4. Hallazgos, por gravedad — cada uno con su medida y su dictamen

### Graves — habrían bloqueado la salida; arreglados y re-medidos en esta fase

**H1 · La identidad de agente era ilegible en tema claro** *(la carga anunciada, confirmada con creces)*. `AGENT_HEX` viajaba como hex fijo a `style=`: en claro, los nombres de los cinco directores sobre el papel medían **2.24-2.57:1**, las iniciales de placa **2.01-2.31:1**, los filetes de identidad **2.2-2.6:1** (borde, requisito 3:1) y el chip «· CONCLUSIÓN» **2.31:1**. Los tokens `--agent-*` del bloque claro existían y nadie los consumía. **Arreglo** (`55bda2c`, `4727416`): la identidad viaja como `var(--agent-…, hex)` y el navegador la re-resuelve al conmutar el tema; los alphas pasan a `color-mix()`; el color de sesión elegido por el usuario y los agentes a medida conservan su hex (regla verificada por test); y donde el color caía sobre su propio tinte al 12% (iniciales, chip, avatar SB — que aún con token quedaban en ~3.6-3.8), la tinta pasa al sistema y la identidad queda en filete y tinte, que es literalmente la regla de §9.10. **Re-medido: 0 elementos con AGENT_HEX crudo en el DOM, en los dos temas.**

**H2 · El latón como texto sobre papel** — `--accent` (brass-700) usado como color de TEXTO en claro: «Nuevo Chat» **3.28:1**, etiqueta viva del Canto **3.96:1**, recuento de la junta **3.67:1**, saldo de créditos **3.75:1**; y el Canto usaba además `text-ink-500` crudo, que no conmuta con el tema (**3.63:1** en claro). §2.6 ya avisaba: como texto sobre papel sólo vale brass-800. **Arreglo** (`7fb5da4`): `text-brass-800 dark:text-accent` en los cuatro sitios (oscuro intacto), tokens crudos a semánticos. De propina, el botón «Nuevo Chat» resultó ser un resto entero del sistema viejo vivo vía SHIM — glow de sombra cian, círculo macizo con `scale(1.1)` al hover que §7.5 prohíbe — y pasa a la variante secundaria de §9.1.

**H3 · Los semánticos claros no aguantaban fuera de `paper-100`** — estaban calibrados solo contra el fondo de página: sobre `paper-200` (e1, la sidebar) el saldo medía **4.32:1** y sobre su propio tinte de chip el CONDICIONAL **4.11:1**. **Arreglo** (`5516e69`): lightness −0.03 uniforme (success 0.50, warning 0.52, danger 0.535, info 0.505); verificado por cálculo que los cuatro quedan ≥4.5:1 sobre `paper-100`, `paper-200` y su tinte de chip sobre `paper-50`. La rama oscura no se tocó. DESIGN §2.7 actualizado con valores y ratios nuevos.

**H4 · El chip del voto en contra fallaba AA en oscuro** — «✗ EN CONTRA» (`text-dissent` sobre su relleno del 12% en e2) = **4.02:1**, confirmado por axe y por el barrido. Es la señal que §P2 declara la más valiosa de la pantalla, por debajo del umbral. **Arreglo** (`06529da`): el texto pasa a `--danger` (mismo tono oxblood, 5.2:1 medido sobre el tinte, pasa en los dos temas) — el mismo patrón que las auditorías de fase 1/2 ya aplicaron dos veces al botón destructivo y al error de campo. Filete y relleno siguen en dissent.

**H5 · La pista de primera vez tapaba tres placas de la Sala** *(la carga de 1280px, confirmada — y no era sólo 1280)*. `lg:absolute lg:z-20` la dejaba caer sobre CEO, CTO y CFO cubriendo el **57-84% del área de cada placa, a 1280 y también a 1440**, y `document.elementFromPoint` confirmó que **el click en esas placas se lo quedaba la nota**: en la primera sesión —justo cuando la pista aparece— tres asientos no se podían abrir. Contradice §8.1 («todos los asientos visibles a la vez»). **Arreglo** (`1256cff`): la sección pasa a `flex-wrap` y la pista a su propia fila bajo la mesa. **Re-medido: 0 solapes a 1280 y a 1440.**

**H6 · El DataGrid era un fósil del sistema viejo con dos defectos propios** — (a) en claro pintaba las celdas numéricas a **2.98:1** (acento vía SHIM al 80% sobre papel: ni AA ni 3:1); (b) su detector de cifra hacía `replace` de todo lo no numérico *antes* de comprobar, así que `Number('') = 0` convertía **cada celda de texto en «cifra»**: toda la tabla salía en mono, alineada a la derecha y en acento — el hallazgo «celdas en latón sobre papel» era en realidad *todas* las celdas. Más «Data Analysis View» en inglés (§11), exportar solo con `title` y `rounded-xl`. **Arreglo** (`9528c3e`); re-medido: cifras a 16.59/12.16:1, texto a 10.57/8.67:1 (oscuro/claro).

### Medios — dictaminados, no bloqueantes

**H7 · `ChatPanel.tsx`, 1320 líneas (era 628 en `master`) — NO bloquea la salida; es la primera deuda de la siguiente fase.** Lo leí entero por estructura: es un componente-dios (cabecera, war-room, transcript, compositor, atajos, pins, ratings, export, welcome, subida de ficheros), pero **no está roto**: selectores atómicos correctos, efectos con dependencias razonadas y comentadas, cubierto por tests (`ChatPanel.test.tsx`, `TranscriptIdentidad`, `CosteYSaldoEnElBoton`…), y ninguna de sus costuras sangra hacia fuera. Partirlo *ahora*, con la superficie visual recién estabilizada y sin tarea en el plan, sería exactamente el tipo de cirugía de última hora que una fase de cierre no debe hacer (la lección de R10 del plan aplica entera). Dictamen: **deuda para después**, con corte natural en tres piezas (cabecera+war-room / transcript / compositor) y el mismo protocolo que se usó con el store: un trozo por commit, tests verdes entre cada uno.

**H8 · La regresión vigilada de `loadSession` es en realidad una mejora bien guardada.** El efecto ahora depende de `[urlSessionId, currentSessionId, loadSession]` con guarda `urlSessionId !== currentSessionId`: tras cargar, la igualdad corta el ciclo; si el store se resetea con la misma URL, la desigualdad reaparece y recarga (antes: pantalla en blanco). No hay bucle posible mientras `loadSession` fije `currentSessionId = sessionId`, que es lo que hace. El comentario del código explica exactamente esto. Verificado además de rebote: todas las sondas de esta fase entran por URL y cargan sesión. Sin acción; un test explícito de «reset + misma URL» sería bienvenido.

**H9 · Los cinco `fetch()` fuera de `req()` son exactamente los que ARCHITECTURE §5 declara.** Verificado por grep: `useBillingStore.ts`, `BillingPage.tsx`, `useAgentDetail.ts`, `useAgentTemplates.ts` y el propio `api.ts` — ni uno más ni uno menos. Esas llamadas se saltan el manejador global (un 402 ahí no abre el paywall). Deuda conocida, declarada donde debe, fuera del alcance de esta fase. Sin acción.

**H10 · El SHIM del sistema viejo sobrevivió a la fase 6** — «se retiran en la fase 6, cuando ya no queden usos» y quedan **~210 usos** (`electric-cyan` ×80, `surface-highlight` ×77, `midnight` ×26, `luxury-purple` ×25). Visualmente inocuo (los alias resuelven a tokens nuevos), pero es vocabulario muerto que permite escribir el sistema viejo sin aviso — y el botón «Nuevo Chat» (H2) demuestra que debajo de un alias puede esconderse un diseño entero sin migrar. Documentado como §13.0 de DESIGN con sus números. Deuda: codemod alias→token + borrar el bloque.

### Menores
- El indicador «Debatiendo» de la sidebar: 3 `animate-bounce` en bucle durante streaming (presupuesto shell móvil: 1). Heredado de `master`, honesto, minúsculo. Deuda menor.
- `ActaPresentation.tsx:151`: un `outline-none` en el contenedor de presentación a pantalla completa; el foco interior conserva anillos. Revisar si el contenedor mismo necesita sustituto.
- El botón de enviar deshabilitado («5 · 157») queda en 3.04:1/4.43:1 — exento por §9.1 y documentado allí con la cifra real; se lista para que nadie lo redescubra.
- Errores 403 en consola durante las sondas: llamadas de Firebase con claves demo del arnés — artefacto del entorno de prueba, no de la app.

### Limitaciones ya declaradas en el código — verificadas como declaradas, no redescubiertas
`useUnsavedGuard` no bloquea Atrás (`<BrowserRouter>` en `main.tsx:40`); las versiones de un turno regenerado no se persisten; D28 no viaja entre dispositivos (el backend acepta tres campos); D59 no sobrevive a la recarga de un pin en vivo; D69 numera los días como `cron` sin poder contrastarlo. Todas están escritas en el sitio correcto del código.

---

## 5. Lo que este entorno no puede medir — y qué haría falta

| Qué | Por qué no aquí | Qué hace falta |
|---|---|---|
| 8.4 rendimiento móvil | Sin backend vivo (streaming real), sin hardware físico de referencia | Backend arriba + sesión Firebase real + Chrome DevTools CPU 6× para la traza, y una pasada en un Redmi Note/Galaxy A físico (§7.7 lo exige por escrito) |
| 8.6 E2E Board V2 | Ídem: cobro y refund reales contra `/me`, SSE real | El guion ya existe (`PLAN_IMPLEMENTACION_BOARD_V2.md` FASE 7); es sentarse una hora con el stack completo |
| 8.8 sobre `dist/` | Compilar está prohibido aquí | Un paso de CI: `vite build && grep b620ecfd dist/index.html` |
| 8.2 exhaustivo | Los 8 flujos completos son una pasada manual | 1-2 h con teclado; la maquinaria común ya está verificada |
| Presupuestos de bundle (checklist §9 del plan) | Requieren build | El mismo job de CI de 8.8 puede medir entry gzip y CSS gzip |

---

## 6. Vivo para después del despliegue (por orden de valor)

1. **Ejecutar 8.4 y 8.6 de verdad** — son las dos reservas de este dictamen.
2. **Partir `ChatPanel`** (H7) en tres, con el protocolo del store.
3. **Retirar el SHIM** (H10): codemod de ~210 usos + borrar los 7 alias; el día que salga, `git grep electric-cyan` debe dar 0.
4. **Suite axe en CI** (8.1 como test, no como pasada) + el grep de 8.8 y presupuestos de bundle en el mismo job.
5. Los cinco `fetch()` fuera de `req()` (H9), el `animate-bounce` de la sidebar, el test explícito de «reset + misma URL», y las limitaciones D28/D59/D69 si el backend crece para ellas.

---

## 7. Commits de esta fase (uno por asunto, sobre 135 previos de la rama)

```
3d91c0f fix(a11y): nombre accesible en tres controles de icono y contraste del distintivo POPULAR
55bda2c fix(tema-claro): la identidad de agente lee los tokens --agent-* y sigue al tema
7fb5da4 fix(tema-claro): el latón deja de usarse como texto sobre papel
5516e69 fix(tema-claro): los semánticos claros bajan a AA sobre e1 y sobre sus tintes de chip
06529da fix(votechip): el texto del voto en contra pasa a --danger y cumple AA
9528c3e fix(datagrid): las celdas dejan el acento del shim y las cifras se detectan de verdad
1256cff fix(mesa): la pista de primera vez deja de tapar tres placas en la Sala
4727416 fix(tema-claro): la tinta sobre tintes de identidad es del sistema, no del color
db5c77f docs(design): DESIGN.md se documenta desde el artefacto construido (tarea 8.9)
```

Tras el último commit se re-ejecutaron los cuatro criterios de salida (tabla de §2) y las sondas de contraste, solape y axe: los números de este informe son los del árbol final, no los de mitad de faena. **Nada se ha subido: el push no está autorizado y no es del auditor.**
