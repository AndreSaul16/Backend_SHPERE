# AUDIT_PLAN_V3 — Auditoría adversarial de PLAN_REFACTOR_FRONTEND_V3, DESIGN.md y PRODUCT.md

**Fecha:** 2026-07-29 · **Auditor:** agente independiente (sin participación en la redacción de los documentos)
**Método:** todo hallazgo técnico de este informe proviene de leer el fichero citado o de ejecutar un comando; donde no se pudo comprobar algo, se dice explícitamente. Los experimentos de compilación se hicieron fuera del repo (scratchpad), con el `@tailwindcss/postcss` 4.3.3 del propio proyecto.

> Se dan por buenos y NO se re-verifican aquí los P0 ya confirmados por el orquestador: D01 (config muerto + `@theme` sin tokens de texto), D02 (`prose-*` sin plugin), D03 (Rules of Hooks en `ChatSettingsPage`), D04 (Knowledge Base sin `Authorization`), D05 (`dompurify` no declarado). También se dan por buenos los 3 defectos de CI verificados por el orquestador (workflow que nunca corre por `branches: [main]` vs rama real `master`; `tsc --noEmit` no-op sin `-b`; `npm test` no fiable) — aquí sólo se incorporan sus consecuencias.

---

## 1. Veredicto

**APTO PARA IMPLEMENTAR** — tras la segunda pasada de esta auditoría, que **ya aplicó las 9 correcciones obligatorias (B1-B9) directamente en `DESIGN.md` y `PLAN_REFACTOR_FRONTEND_V3.md`** por instrucción del propietario, además de la inversión a **móvil primero** (la mayoría del tráfico será móvil) y la coautoría del sistema de motion. Traza completa de qué se editó: Anexo B. Verificación: el bloque §13 final se re-extrajo del documento editado y se **re-compiló limpio** contra el Tailwind 4.3.3 del proyecto (todas las escalas nuevas emiten; `dark:` funciona con el default oscuro; `.acta-sheet` re-declara su contexto), y `brass-800` (el token nuevo para enlaces del acta) mide **5.38:1** sobre `paper-50`.

Lo que queda y NO puede resolver un documento — el implementador debe saberlo antes de empezar:

1. **Operativa de despliegue**: ejecutar la tarea 0.0 (CI: trigger a `master`, `tsc -b`, vitest directo) y confirmar la rama larga `redesign/` — Railway despliega cada push a `master`.
2. **Activos externos**: descargar y subsetear las 4 fuentes (0.3, con verificación de ejes `wdth`/`opsz`), generar la textura (0.5) y las variantes horneadas del sello (2.2). Las instrucciones ya están en el plan; el trabajo es del ejecutor.
3. **OG por sesión** (2.4) tiene una pata de backend inevitable (los crawlers no ejecutan JS): decidir si se hace el endpoint o se acepta OG genérica en el primer corte.
4. **El corte mínimo correcto es 12-14 días** (fases 0-2 + identidad de la 3 + 4.1/4.2), no 7-9: ya está corregido en el plan.

Estado original del dictamen (primera pasada): APTO CON CORRECCIONES OBLIGATORIAS, con estos 9 bloqueantes — se conservan documentados porque explican los cambios aplicados:

1. **B1 — Sin `data-theme="dark"` inicial, la Fase 0 pinta la app en tema claro.** El `:root` del contrato §13 ES el tema claro; nada en las fases 0-5 pone el atributo `data-theme` (el conmutador llega en 6.11). Añadir `<html data-theme="dark">` a la tarea 0.4.
2. **B2 — El contrato de tokens no expone utilidades que DESIGN exige por nombre** (`ink-*`, `oxblood-*`, `baize-700/600`, `graphite-*`, `aniline-*`, `paper-200..400`, `ease-mech`): los §9.x de DESIGN son inimplementables sin inventar tokens, cosa que el propio §9 prohíbe.
3. **B3 — La Fase 0.1 borra `.glass-panel/.glass-card/.glass-input/.aurora-blob` (15 usos de `glass-*` en 5 ficheros + 6 blobs en 3 páginas) sin tarea que los sustituya hasta las fases 3-6**: ventana de semanas con paneles sin fondo ni borde.
4. **B4 — No hay red de seguridad de CI y el plan no lo sabe**: el riesgo R14 (deploys bloqueados por checks) es un riesgo fantasma — el workflow no llega a ejecutarse nunca. Arreglar CI (rama, `tsc -b`, comando de test) debe ser tarea de Fase 0.
5. **B5 — Contraste dentro del propio sistema**: la placa de asiento (§9.10, texto `brass-300` sobre relleno `brass-600`) falla AA — el documento cita el ratio contra `baize-950`, que no es el fondo real del texto. (Ratio exacto medido en §5.)
6. **B6 — El criterio de aceptación de 0.1 es infalsable tal cual**: en v4 las utilidades sólo se emiten si algo las usa; justo después de 0.1 (antes del codemod 0.6) `.text-content` no estará en el CSS compilado. Reordenar el criterio a «tras 0.6» o compilar contra sonda.
7. **B7 — El codemod 0.6 no mapea `bg-text-secondary`** (AgentDetailPage.tsx:726) — el detector de 0.8 fallará su propio criterio de aceptación.
8. **B8 — Las 4 fuentes y la textura son activos sin ruta de obtención**: la tarea 0.3 no dice de dónde bajarlas ni que el subseteo exige `fonttools`+`brotli` instalados; 0.5 no dice cómo se genera el WebP del grano. Un agente ejecutor se detiene ahí.
9. **B9 — El acta es ilegible en tema oscuro con el CSS del contrato tal cual** (medido compilando el bloque §13): `.acta-sheet` re-colorea por elemento pero `.doc-prose` consume variables de tema — dentro de la hoja de papel, el blockquote queda a **1.13:1**, `th`/`h5` a **1.78:1**, las viñetas a **2.10:1** y los enlaces a **4.17:1**. Corrección exacta (re-declarar el contexto de variables en `.acta-sheet`) en §5.3.

**Los 9 están aplicados** (B1/B2/B5/B9 y las 7 filas de contraste en `DESIGN.md`; B3/B4/B6/B7/B8 en el plan — tareas 0.0, 0.1, 0.3-0.6, 2.2, 2.4, 3.1, R1, R14, checklist). La tabla de §2 se conserva como registro del hallazgo y de la corrección exacta que se aplicó.

---

## 2. Bloqueantes

> **Estado: TODOS APLICADOS por esta auditoría en la segunda pasada** (en `DESIGN.md` los B1/B2/B5/B9; en `PLAN_REFACTOR_FRONTEND_V3.md` los B3/B4/B6/B7/B8). La columna «Corrección exacta» describe lo que efectivamente se editó. Se re-compiló el contrato final para verificar B1/B2/B9 (ver §1 y §4).

| ID | Problema | Dónde | Por qué rompe | Corrección exacta |
|---|---|---|---|---|
| B1 | El tema por defecto del contrato es el CLARO (`:root` = papel) y nada pone `data-theme="dark"` hasta la tarea 6.11 | DESIGN §13 (bloque `:root` claro, `[data-theme="dark"]` oscuro) + PLAN 0.4 (no menciona el atributo) | Tras la Fase 0, `body` pasa a `paper-100` (casi blanco) mientras los 88 hex oscuros hardcodeados de los componentes siguen vivos hasta 7.6 → texto claro sobre paneles oscuros sobre página clara. Semanas de app rota en producción (Railway despliega cada push) | Añadir a 0.4: `<html lang="es" data-theme="dark">`. Documentar que 6.11 lo hace conmutables |
| B2 | DESIGN nombra como color de componente tokens que el `@theme` de §13 NO expone como utilidad: `ink-100/200/300/400/500`, `oxblood-400/500/600`, `baize-700/600`, `graphite-600..900`, `aniline-*`, `paper-200/300/400`, `ease-mech` | DESIGN §3.3, §9.1 (disabled: `baize-700` + `ink-500`), §9.2 (error: `oxblood-500`/`oxblood-400`), §9.10, §9.11, §9.12 (skeleton `baize-850` sí existe), §7.1 (`--ease-mech`) vs §13 | Un implementador que escriba `text-ink-400` o `border-oxblood-500` genera exactamente la misma clase muerta que el plan viene a eliminar; y §9 prohíbe «inventar» estados/tokens en el sitio de uso | O exponer las escalas completas en `@theme inline`, o reescribir §9 en términos de los semánticos expuestos (`content-*`, `dissent`, `certify`…) añadiendo los alias que faltan (p. ej. no existe alias para `ink-400` ni para `baize-700`). Añadir `--ease-mech: linear` al `@theme` |
| B3 | 0.1 sustituye `index.css` íntegro y elimina `.glass-panel/.glass-card/.glass-input/.hover-lift/.active-scale/.aurora-blob` sin tarea de transición | PLAN 0.1 vs código real: 15 usos `glass-*` en 5 `.tsx`, 14 usos `hover-lift/active-scale`, 6 `aurora-blob` en `ProfilePage.tsx:85,89`, `AgentDetailPage.tsx:405,409`, `ChatSettingsPage.tsx:211,215` | Paneles, tarjetas e inputs de media app pierden fondo/borde/estados el día 1; los blobs quedan como divs muertos. Las fases que los repintan (3, 5.x, 6) llegan semanas después | Añadir a 0.1 un shim temporal (redefinir `.glass-*` sobre los tokens nuevos, marcado `/* TODO retirar en fase 6 */`) o adelantar un mini-codemod `glass-* → clases de token` en 0.6. Añadir los 6 blobs de las 3 páginas al alcance de 3.1 |
| B4 | El plan no incluye reparar el CI, y su riesgo R14 está mal diagnosticado: el workflow **nunca corre** (dispara sobre `main`; la rama es `master`), el typecheck es no-op y `npm test` no es fiable | PLAN §8 R14 y Fase 0 (no hay tarea de CI); `.github/workflows/ci.yml` (verificado por el orquestador) | 24-31 días-persona tocando 295 usos de color y todos los componentes irán a producción sin ningún gate automático; y las tareas 0.8, 4.12 y 8.x añaden jobs a un workflow que no se ejecuta | Nueva tarea 0.0: `branches: [master]` (o `branches: ['**']`), `tsc -b --noEmit`, sustituir `npm test` por `./node_modules/.bin/vitest run` (o fijar `packageManager`), y verificar una ejecución real en GitHub antes del primer push de la fase 0 |
| B5 | La placa de asiento falla AA: texto `brass-300` (#F0D39F) sobre relleno `brass-600` (#BC913A) = **2.05:1** medido, con texto de 12px. El documento anuncia «13.45:1» citando el ratio contra `baize-950`, que no es el fondo del texto | DESIGN §9.10 y §3.3 («Placa de asiento… `brass-300` sobre `brass-600`») | El componente más visible del efecto de firma nº1 (La Mesa) nace ilegible e incumple la regla no negociable §12.1 del propio documento | Texto de la placa en `baize-950` sobre `brass-600` (7.14:1, medido) o placa en relleno oscuro con texto `brass-300`. Recalcular también el estado `idle` (opacidad 0.55 sobre ese par lo hunde más) |
| B6 | Criterio de aceptación de 0.1 infalsable: pide que el CSS compilado contenga `.text-content`/`.bg-surface-1` **antes** de que ningún fichero las use (el codemod es 0.6) | PLAN Fase 0.1 vs DESIGN §13.1 (que lo advierte: «una MISS significa que nadie la usa todavía») | El implementador ejecuta 0.1, el criterio falla, y no sabe si el contrato está mal o si es el orden | Reescribir la aceptación de 0.1: «compilar contra el fichero sonda de §13.1» o mover la comprobación al cierre de 0.6 |
| B7 | El codemod 0.6 no incluye `bg-text-secondary` en el mapa | PLAN 0.6 vs `AgentDetailPage.tsx:726` (verificado) | La aceptación de 0.6 («el detector reporta 0 clases muertas») falla por una clase que el propio plan inventarió en §2.1 | Añadir `bg-text-secondary → bg-content-muted` (o el semántico que corresponda) al mapa |
| B8 | Activos sin ruta de obtención: 4 WOFF2 variables subseteadas (0.3), textura WebP ≤3 KB (0.5), favicon «propio» (0.4) antes de que el logo exista (3.9) | PLAN 0.3, 0.4, 0.5, 3.9; `frontend/public/` hoy sólo contiene `grid.svg` y `vite.svg` (verificado) | Un agente ejecutor no puede completar la Fase 0 sin: URLs de descarga (Google Fonts → TTF variable), `pip install fonttools brotli` para `pyftsubset`, un método concreto para generar el grano, y una decisión sobre qué favicon poner antes del logo | Añadir a 0.3 las fuentes exactas (Literata/Archivo/JetBrains desde google/fonts en GitHub), el comando completo de subseteo y la dependencia de entorno; a 0.5 un método (p. ej. ruido generado con `sharp`/canvas + blend); a 0.4 «favicon provisional monocromo, se sustituye en 3.9» |
| B9 | `.acta-sheet` no re-mapea las variables de tema que `.doc-prose` consume → acta ilegible en tema oscuro: blockquote **1.13:1**, `th`/`h5-h6` **1.78:1**, viñetas **2.10:1**, enlaces **4.17:1**, semánticos oscuros sobre papel **2.27:1** (todos medidos) | DESIGN §13, reglas `.doc-prose blockquote{color:var(--content)}`, `li::marker{color:var(--accent)}`, `th{color:var(--content-muted)}`, `.acta-sheet .doc-prose a{color:var(--brass-700)}` | La superficie estrella del producto (el acta sobre papel) nace rota exactamente en el tema que la app usa hoy | Sustituir los overrides por elemento de `.acta-sheet` por la re-declaración de contexto de variables de §5.3 de este informe; enlaces del acta a ≥4.5:1 (graphite-700 subrayado, o un latón más oscuro que brass-700) |

---

## 3. Correcciones recomendadas (importantes, no bloqueantes)

| ID | Problema | Dónde | Por qué importa | Corrección |
|---|---|---|---|---|
| R1 | El contrato no endurece la paleta por defecto: `text-gray-700`, `rounded-2xl`, `backdrop-blur-3xl` siguen compilando (verificado compilando la sonda) | DESIGN §13 | Toda la disciplina anti-regresión descansa en greps de CI; Tailwind seguirá generando exactamente las clases que el sistema prohíbe | Añadir al `@theme`: `--color-*: initial` (re-declarando después las escalas propias), `--radius-*: initial` antes de los radios del sistema. Deja los greps como segunda línea |
| R2 | `--spacing: 4px` (px, no rem) rompe el escalado con el tamaño de fuente del navegador | DESIGN §13 | Un usuario con fuente base 20px verá la tipografía crecer (rem) y el espaciado no (px): densidades rotas justo para quien más lo necesita. El default de v4 es `0.25rem` | `--spacing: 0.25rem` (idéntico a 4px a 16px base) y `--radius-*` pueden quedarse en px |
| R3 | PLAN dice «El acta y las conversaciones compartidas…» con recuentos exactos pero PRODUCT/PLAN dicen «30 ficheros de test» y R1 «26 de los 30»; el recuento real es **28** | PRODUCT §Capabilities, PLAN §8 R1 | Números que no cuadran minan la confianza en el resto (que sí cuadra); y R1 promete actualizar «los 30» | Corregir a 28 (verificado: `find … -name '*.test.*'` = 28) |
| R4 | «PaywallModal… sin botón de cerrar» es impreciso: tiene botón «Cancelar» que llama `closePaywall` (verificado :19-24) | PLAN §2.2 y D23 | Falso positivo pequeño que puede hacer perder tiempo buscando un bug inexistente; lo que falta es cierre con `aria-label`, `Escape` y velo clicable | Reformular D23: «sin cierre accesible (X con aria-label, Escape, velo)» |
| R5 | La narrativa de D01 dice que los tokens «viven» en `tailwind.config.js`; en realidad el config define claves con guión bajo (`text_primary`, `agent_cto`) que **nunca** habrían generado `text-text-primary` ni en v3 | PLAN §1 y D01 vs `tailwind.config.js:24-31` (verificado) | No cambia la acción (borrar el fichero) pero sí la explicación que quedará en el commit de R2: las clases usadas no existieron jamás en ninguna fuente | Ajustar el texto del commit/ARCHITECTURE.md |
| R6 | El sello usa `--certify` que en tema oscuro es `aniline-400`, pero el sello aterriza SIEMPRE sobre papel (`paper-50`): `aniline-400` sobre `paper-50` = **2.83:1** (medido), bajo el 3:1 de UI | DESIGN §8.3 (dice `aniline-500`) vs §13 (`--certify: var(--aniline-400)` en oscuro) | Si el implementador usa el token semántico (lo esperable), el sello queda débil sobre la hoja en tema oscuro | El sello debe fijar `aniline-500`/`aniline-600` explícitos (o un `--certify-on-paper`), no `--certify` |
| R7 | Tareas de fase 5/6 citan tokens de layout de §4.2 (`--rail-order`, `--gutter-sidebar`, `--panel-artifact-*`, `--measure-form`) que el bloque §13 no define | DESIGN §4.2 vs §13; PLAN 3.5 | El implementador debe inventar dónde viven (¿:root?, ¿@theme?) — ambigüedad evitable | Añadirlos a `:root` en §13 |
| R8 | `npm i dompurify @types/dompurify` instala un stub obsoleto: dompurify ≥3.x publica sus propios tipos | PLAN 0.9 | `@types/dompurify` está deprecado; instalarlo puede pisar los tipos buenos | `npm i dompurify` a secas (la 3.4.12 ya está en el árbol vía mermaid, verificado) |
| R9 | 3.1 borra `AuroraBackground.tsx` pero los 6 `aurora-blob` locales de 3 páginas no están en ninguna tarea (quedan como divs muertos con clase inexistente) | PLAN 3.1 vs ProfilePage/AgentDetailPage/ChatSettingsPage (verificado) | Código muerto y la aceptación «0 elementos animados en el fondo» es engañosa si sólo se mide en `/` | Ampliar 3.1 a esos 3 ficheros |
| R10 | El plan no gestiona el «estado Frankenstein»: 0.6 recolorea ~300 usos de texto + cambia la fuente del body (Inter→Archivo) + el fondo, mientras los 88 hex por componente no se tocan hasta 7.6 | PLAN fases 0-7 (orden) | La app pasará semanas mezclando dos sistemas visuales EN PRODUCCIÓN (Railway despliega cada push, R14 mal diagnosticado) | O rama larga `redesign/` con previews (y merge por fases), o adelantar 7.6 parcial (los hex de superficies) a la fase 0/1. Decirlo explícitamente en §8 |
| R11 | **La premisa de R1 del plan es falsa en la dirección contraria**: dice que «26 de los 30 test files consultan clases»; medido: son 28 ficheros, sólo 2 mencionan `className`/`toHaveClass` siquiera, y **0 asertan clases de token de Tailwind** (`grep -rEl 'text-\|bg-\|border-\|rounded\|opacity-' tests --include='*.test.*'` = 0) | PLAN §8 R1 vs `frontend/tests/` (verificado) | Buena noticia (el codemod 0.6 apenas toca tests), pero el riesgo real está en otro sitio: los tests que consultan TEXTO y estructura de componentes que el plan reescribe o elimina (`ErrorOverlay.test.tsx` — sustituido por toasts sin tarea de borrar su test —, `PaywallModal.test.tsx`, `Sidebar.test.tsx`, `CreditsIndicator.test.tsx`, `SettingsPage.test.tsx`, `OnboardingChecklist` en 5.12) | Sustituir la mitigación de R1 por un mapa tarea→tests afectados (por comportamiento, no por clases); añadir «borrar/adaptar su test» a 1.12 (ErrorOverlay) y 5.12 (OnboardingChecklist) |
| R12 | Fase 1.15 convierte 155 `text-[8..11px]` al «suelo 12px» pero el cromo de DESIGN §3.2 es 12-14px: subir 107 usos de 10px→12px cambia densidades de listas/tablas en toda la app sin pasada visual asociada | PLAN 1.15 (fase 1, antes del restyle de fase 3/6) | Riesgo de desbordes/wraps en sidebar, chips y tablas antes de que la fase responsive (6.15) llegue | Anotar en 1.15 una revisión visual rápida de las 5 superficies más densas |
| R13 | `@types/dompurify`, `--breakpoint-*` idénticos al default, `autoprefixer` redundante: limpiezas menores | PLAN 0.9, DESIGN §13, postcss.config.js | Ruido; los `--breakpoint-*` re-declarados son inertes (v4 ya trae esos valores) | Quitar los `--breakpoint-*` del bloque (o dejarlos con comentario «= default, documental») |

---

## 4. Verificación del contrato de tokens (compilado, no opinado)

**Qué se hizo:** el bloque §13 de DESIGN.md se copió byte a byte a un directorio fuera del repo y se compiló con el `@tailwindcss/postcss` **4.3.3** del propio proyecto (la versión instalada coincide con la que DESIGN declara; `package.json` dice `^4.1.18` pero el lock resuelve 4.3.3 — verificado en `node_modules`). Se compiló contra una sonda que usa: (a) las utilidades que el contrato promete, (b) las que DESIGN nombra en prosa sin exponer, (c) las prohibidas.

**Resultado global: el bloque §13 compila limpio (0 warnings) y las utilidades del contrato generan exactamente los valores declarados.** 29.441 bytes con mi sonda (la cifra de 109.975 del documento corresponde a su sonda, más amplia; ambas son tamaños sanos). La afirmación central del aviso técnico de §7.2 es **correcta y quedó reproducida**; su enumeración de namespaces tiene dos errores sin consecuencia.

### 4.1 Utilidades del contrato — todas emiten el valor declarado

| Utilidad | Emitido (literal del CSS compilado) | Veredicto |
|---|---|---|
| `.text-content` / `-strong/-muted/-quiet` | `color: var(--content)` etc. | ✓ |
| `.bg-surface-0..3/-inset/-doc` | `background-color: var(--surface-*)` | ✓ |
| `.border-stroke-hairline/edge/control/highlight` | `border-color: var(--stroke-*)` | ✓ |
| `.bg-accent`, `.bg-accent-fill`, `.text-accent-on-fill`, `.text-dissent`, `.text-certify`, semánticos, `.text-agent-*` (×6) | var correspondiente | ✓ |
| `.text-micro` | `font-size:0.75rem; line-height:var(--tw-leading,1.35); letter-spacing:var(--tw-tracking,0.07em)` | ✓ (con line-height Y tracking) |
| `.text-base` / `.text-4xl` | `1rem/1.55` · `2.4883rem/1.08/-0.025em` | ✓ |
| `.rounded-xs/sm/md/lg` | `2px / 4px / 8px / 12px` | ✓ |
| `.shadow-e2/e3/e4` | `--tw-shadow: var(--shadow-e3)` + pila estándar | ✓ (conmuta por tema) |
| `.ease-settle/travel/exit/impact` | `transition-timing-function: cubic-bezier(...)` | ✓ |
| `duration-(--duration-pop)` | `transition-duration: var(--duration-pop)` | ✓ — la sintaxis alternativa que propone §7.2 funciona |
| `.max-w-measure` | `max-width: 68ch` (desde `--container-measure`) | ✓ |
| `.p-4` / `.px-3` | `padding: calc(4px * 4)` | ✓ pero en **px** (ver 4.4) |
| variantes `sm:`…`2xl:` y `dark:` | `.dark\:bg-surface-0:where([data-theme=dark], [data-theme=dark] *)` | ✓ — el `@custom-variant` funciona |
| `.doc-prose` (h1-h6, listas, tabla, blockquote, code) y `.acta-sheet` (clip-path del bisel) | emitidos en `@layer components` | ✓ |
| 4 `@font-face`, `prefers-reduced-motion`, `:focus-visible` global | presentes | ✓ |
| `--ease-mech` + `--animate-pulse-ring/sweep/indeterminate` *(añadidos por esta auditoría, Anexo B)* | `.ease-mech`, `.animate-*` + sus `@keyframes` emitidos | ✓ |

### 4.2 Namespaces: la afirmación central es cierta; la enumeración tiene 2 errores

Compilado un `@theme` de prueba con claves deliberadamente inválidas contra el `tailwindcss` **4.3.3** instalado:

- **`--duration-brand: 500ms` en `@theme` no genera NADA** (ni utilidad ni variable). El aviso de §7.2 es correcto: `--duration-*` no es namespace. ✓
- **`--duration-1: 90ms` + clase `duration-1` → `transition-duration: 1ms`** — la trampa del valor desnudo descrita en §7.2 es literalmente cierta: el tema se ignora en silencio y gana el numérico en ms. ✓ Reproducida.
- **Errores en la lista «exactamente 20»:** `--tab-size-*` y `--zoom-*` **no existen** en 4.3.3 (probados: `tab-github` y `zoom-test` no generan nada; el string tampoco aparece en `dist/lib.js`). Y la lista omite namespaces reales: `--opacity-*`, `--inset-*`. Sin consecuencia práctica (el contrato no los usa), pero la frase «exactamente 20» es falsa y no debe citarse como referencia.
- Confirmados funcionando para uso futuro: `--tracking-*`, `--leading-*`, `--font-weight-*` (→ `font-plate`), `--aspect-*`, `--perspective-*`, `--blur-*`, `--inset-shadow-*`, `--drop-shadow-*`, `--container-*` (genera `max-w-*` **y** `w-*`).

### 4.3 Lo que DESIGN nombra y el contrato NO genera (confirmado compilando — es el B2)

`text-ink-100/…/-500`, `bg-baize-700/600`, `text-graphite-600..900`, `border-oxblood-500`, `text-oxblood-400`, `bg-aniline-500`, `bg-paper-200/300/400`: **ninguna emite CSS** (MISS en la sonda). Todas aparecen como color de componente en §3.3/§9.x. `ease-mech` estaba en el mismo caso y esta auditoría ya lo añadió al `@theme`.

### 4.4 Hallazgos de arquitectura del bloque

1. **La paleta y radios por defecto siguen vivos**: `.text-gray-700`, `.rounded-2xl` (`--radius-2xl:1rem`), `.rounded-3xl`, `.backdrop-blur-3xl` compilan con normalidad. Toda la disciplina del sistema descansa en greps de un CI que hoy no corre (B4). Endurecer con `--color-*: initial` / `--radius-*: initial` antes de declarar las escalas propias (R1 de §3).
2. **Autorreferencia emitida pero inofensiva… hoy**: `@theme inline` emite en `@layer theme` `:root{ --shadow-e2: var(--shadow-e2); }` (mismo nombre). No hay ciclo porque las declaraciones sin capa del autor (los `:root`/`[data-theme=dark]` crudos) ganan a la capa `theme` en la cascada — pero es una mina: si alguien «limpia» los valores crudos o los mueve a una `@layer`, toda la app pierde sombras/colores sin aviso del compilador. Recomendado: nombrar distinto la clave de tema y la variable cruda (p. ej. `--shadow-e2: var(--elev-2)`), o dejar comentario de advertencia.
3. **`--spacing: 4px`** genera espaciado en píxeles (`calc(4px * 4)`): no escala con la preferencia de tamaño de fuente del navegador, a diferencia del default `0.25rem` (R2 de §3).
4. Las utilidades sólo se emiten al usarse (verificada la advertencia de §13.1): el criterio de aceptación de la tarea 0.1 del plan es infalsable tal como está redactado (B6).

---

## 5. Tabla de contraste recalculada

**Método:** conversión OKLCH→sRGB (matrices de Ottosson) + luminancia relativa y ratio WCAG 2.x, en Node sin dependencias, sobre los 52 colores del contrato y los 74 pares relevantes. Primero se validó la conversión: **los 52 hex declarados en DESIGN coinciden con mi conversión con Δ=0 en los tres canales** (la única desviación fue un OKLCH que yo estimé para `graphite-500`, cuyo hex declarado sí da el 3.84 que afirma el doc).

### 5.1 Pares que DESIGN afirma — 59 de 66 exactos al decimal

Todas estas familias se reprodujeron **exactamente** (claim = medido, ±0.01): `ink-50..500` vs `baize-950` y vs `baize-900` (18.63…4.91 / 17.41…4.59) · `brass-300..700` vs ambos paños (13.45…4.51 / 12.57…4.21) · botón primario `baize-950` sobre `brass-500` = **8.96 AAA** · `oxblood` vs `baize-950` (5.33 AA / 3.66 UI / 2.61 falla-documentada) · `aniline` vs `baize-950` (6.28/4.52/3.21) · `graphite-900..600` vs `paper-100` y `paper-200` (14.80…5.06) · `graphite-500` = 3.84 (excluido, correcto) · `brass-400` vs `paper-100` = **1.61** (la asimetría del latón: cierta) · `brass-700` vs `paper-100` = 3.96 (anillo de foco claro ✓ 1.4.11) · semánticos oscuros vs `baize-900` (7.76/7.17/6.84/7.52) y claros vs `paper-100` (4.56/4.57/4.60/4.55) · los 6 agentes oscuros vs `baize-950` (7.33-8.41) y vs `baize-800` (5.65-6.47, doc dice 5.69-6.52: −0.05 por redondeo) · los 6 agentes claros vs `paper-100` (4.51-4.58) · `--stroke-control` compuesto: **#676E68 y 3.47:1 exactos** (oscuro), **#898C86 y 3.13:1 exactos** (claro) · relleno de identidad Nexus 12%: **#0B2C24, 1.21:1 y 12.80:1 exactos**.

### 5.2 Las 7 filas que NO cuadran (verdictos sin cambio, pero las cifras son otras)

| Par | DESIGN afirma | Medido | Veredicto real | Diagnóstico |
|---|---|---|---|---|
| `oxblood-400` / `paper-100` | 2.61 | **3.35** | sigue < 4.5 texto; ≥ 3 UI | Las 4 filas oxblood-sobre-papel están calculadas contra otro fondo (los valores no corresponden a `paper-100`) |
| `oxblood-500` / `paper-100` | 3.71 | **4.87** | pasa incluso como texto AA | ídem |
| `oxblood-600` / `paper-100` | 5.29 | **6.83** | AA holgado | ídem |
| `oxblood-700` / `paper-100` | 7.86 | **9.80** | AAA | ídem |
| `aniline-400` / `paper-100` | 2.99 | **2.84** | falla 3:1 UI (el doc ya lo trata como fallo) | Las 3 filas aniline coinciden exactamente con mi medición **contra `paper-50`**: columna mal etiquetada |
| `aniline-500` / `paper-100` | 4.16 | **3.95** | ≥ 3 UI ✓, **< 4.5 texto** | ídem (contra `paper-50` da exactamente 4.16) |
| `paper-50` sobre `graphite-900` (botón primario claro) | 14.80 | **15.59** | AAA | Reutilizó la cifra de `graphite-900`/`paper-100`; el par real es mejor |

### 5.3 Pares que DESIGN no comprueba — aquí están los fallos reales (medidos)

| Par (contexto real de componente) | Medido | Requisito | Veredicto |
|---|---|---|---|
| **`brass-300` sobre `brass-600`** — nombre del director en la placa (§9.10, §3.3), 12px | **2.00** | 4.5 | **FALLA AA de largo.** El doc anuncia «13.45:1» citando el par contra `baize-950`, que no es el fondo del texto. Alternativa medida: texto `baize-950` sobre `brass-600` = **6.71** ✓ |
| **`ink-100` sobre `paper-50`** — blockquote del acta en tema oscuro (`.doc-prose blockquote` fija `color: var(--content)` y `.acta-sheet` no lo re-mapea) | **1.13** | 4.5 | **ILEGIBLE. Bug del bloque §13**: tinta clara sobre papel |
| **`ink-300` sobre `paper-50`** — `th` y `h5/h6` del acta en oscuro (`--content-muted` se fuga igual) | **1.78** | 4.5 | **FALLA** |
| **`brass-500` sobre `paper-50`** — viñetas del acta en oscuro (`li::marker` usa `var(--accent)`) | **2.10** | 3 (UI) | **FALLA: viñetas casi invisibles** |
| **`brass-700` sobre `paper-50`** — enlaces del acta (`.acta-sheet .doc-prose a`) | **4.17** | 4.5 (texto) | **FALLA AA** — brass-700 se validó como anillo de foco (3:1), no como texto de enlace |
| `ink-500` sobre `baize-850` — «suelo» `content-quiet` sobre tarjeta/burbuja e2 | **4.21** | 4.5 | **FALLA**: el suelo sólo aguanta sobre e0/e1; sobre e2 y e3 (3.78) cae |
| `aniline-400` sobre `paper-50` — el sello con `--certify` (tema oscuro) sobre la hoja | **2.99** | 3 (UI) | **FALLA por un pelo** — el sello debe fijar `aniline-500` (4.16 ✓)/`600`, no el token semántico (R6 de §3) |
| `oxblood-500` sobre `baize-850` — filete de disenso sobre burbuja e2 | 3.14 | 3 | ✓ pasa |
| `oxblood-400` sobre `baize-850` — texto de disenso sobre e2 | 4.57 | 4.5 | ✓ pasa (justo) |
| `oxblood-400` sobre `paper-50` — borde blockquote en acta oscura | 3.53 | 3 | ✓ pasa |
| `brass-500` sobre `baize-850` — cursor del rail sobre e2 | 7.67 | 3 | ✓ |
| `graphite-800` sobre `paper-50` — cuerpo del acta | 12.16 | 7 (AAA objetivo) | ✓ AAA |
| `ink-500` sobre `baize-700` — texto de botón disabled §9.1 | 3.04 | exento | informativo: el doc anota «4.59:1», que es el par contra `baize-900`, no contra su relleno real |
| `success` oscuro sobre `paper-50` — cualquier semántico oscuro dentro del acta | 2.27 | 3/4.5 | **FALLA** — generaliza el problema: la hoja de papel necesita re-mapear TODOS los tokens semánticos, no sólo el color de texto |

**Raíz común y corrección exacta (esto es el bloqueante B9):** `.acta-sheet` re-colorea por elemento (`h1-h4`, `strong`, `a`, color base) pero `.doc-prose` consume **variables** (`--content`, `--content-muted`, `--content-strong`, `--accent`, `--dissent`, `--surface-inset`, `--stroke-*`) que dentro de la hoja siguen valiendo su valor de tema oscuro. La corrección robusta no es añadir overrides por elemento sino **re-declarar el contexto en la hoja**:

```css
.acta-sheet{
  /* papel = contexto claro SIEMPRE, en los dos temas */
  --content: var(--graphite-800); --content-strong: var(--graphite-900);
  --content-muted: var(--graphite-700); --content-quiet: var(--graphite-600);
  --accent: var(--brass-700); --accent-hover: var(--brass-600);
  --dissent: var(--oxblood-600); --dissent-strong: var(--oxblood-700);
  --certify: var(--aniline-600);
  --surface-inset: var(--paper-300);
  --stroke-hairline: color-mix(in oklab, var(--graphite-900) 12%, transparent);
  --stroke-edge: color-mix(in oklab, var(--graphite-900) 16%, transparent);
  --stroke-control: color-mix(in oklab, var(--graphite-900) 50%, transparent);
  --success: oklch(0.53 0.14 150); --warning: oklch(0.55 0.19 75);
  --danger: oklch(0.565 0.19 25);  --info: oklch(0.535 0.12 232);
}
```
…y entonces los overrides por elemento de §13 sobran (salvo el enlace, que además debe subir de `brass-700` a `graphite-700` subrayado, u oscurecer el latón: `brass-700` como texto no llega a AA sobre papel — 4.17). Con este bloque, blockquote/código/tablas/viñetas/sello quedan correctos en ambos temas sin tocar `.doc-prose`.

---

## 6. Juicio sobre la dirección visual

**Veredicto: SE MANTIENE, con cuatro ajustes concretos (6.2-6.5) y una inversión figura-fondo para marketing (§10).** No es disfraz temático: la metáfora está atada al mecanismo real del producto (fases → orden del día; votos → agujas; conclusión → acta sellada), que es lo que separa una dirección de un skin. Y el documento renuncia a los dos clichés disponibles (neón-glass que es la app de hoy, y crema-serif-terracota que sería el opuesto de plantilla).

### 6.1 La apuesta del paño verde — se sostiene, y el riesgo real es el contrario al temido

Medido, no estimado: `baize-950` es `oklch(0.155 0.018 158)` → `#060F09`. **Croma 0.018-0.028 en toda la escala**: esto no es fieltro de casino; es un casi-negro con un sesgo verde que en un panel sRGB corriente (el monitor de oficina de una pyme, brillo medio) se percibe como «tema oscuro cálido», no como «tapete». La lectura club-de-caballeros/casino la dispararía la *combinación* paño saturado + latón abundante + cuero + serif ornamental — y el sistema corta tres de las cuatro: el latón está restringido a «único elemento macizo por pantalla», no hay cuero ni madera (la única textura es un grano al 4%), y la serif es una cara de libro utilitaria, no una display romántica.

El riesgo real es el inverso: **que el verde no se perciba** y el sistema colapse a «otro tema oscuro». En ese caso la identidad la cargan el acta sobre papel, el latón y la tipografía — que la aguantan. Conclusión: la apuesta es más conservadora de lo que aparenta; es reversible en la práctica (subir/bajar `C` de la escala `baize` es una edición de 6 líneas en `:root`) y no envejece como envejece el glassmorphism, porque se apoya en materiales y jerarquía, no en un efecto de moda.

**Fatiga en lectura larga:** el documento ya contiene su propia mitigación — la superficie de lectura larga (el acta) va sobre `paper-50` con `graphite-800` (11.5:1, texto oscuro sobre claro) **en los dos temas**. El transcript sí queda en tinta-sobre-paño (16.6:1); contraste alto sobre fondo casi negro produce halación en usuarios con astigmatismo en sesiones largas. Es aceptable porque los turnos van sobre `baize-850` (e2), no sobre el fondo e0, y porque la lectura de horas es del acta, no del stream. Ajuste barato si aparece la queja: bajar el cuerpo del transcript de `ink-100` a `ink-200` (13.8:1, sigue AAA).

### 6.2 «El Sello» con `feTurbulence` — viable, pero la respuesta correcta es pre-renderizar desde el día 1

El presupuesto declarado (filtro en 96×96, 400 ms, una vez, con salidas por `prefers-reduced-motion` y `hardwareConcurrency`) es honesto y probablemente cumple: aunque el coste real fuera 5× el estimado, serían unos pocos frames perdidos una vez por debate. **Pero el propio diseño confiesa que el estado final es una máscara estática pre-renderizada** — entonces el filtro en runtime no compra nada: la sangría de tinta es textura *estática*; lo que se anima es el aterrizaje (scale/opacity/rotate), no la turbulencia. Recomendación: generar el sangrado offline (el mismo `feTurbulence` como herramienta de generación, 3-4 variantes horneadas en SVG/PNG elegidas por hash de sesión para conservar la sensación de tampón único) y animar sólo transformaciones del activo horneado. Se elimina el filtro en runtime, las dos capas de máscara, el swap a los 400 ms y el riesgo R7 entero, con cero pérdida visible. Safari agradece especialmente no combinar `mask-image` + `filter: url()` animado — es la combinación con más historial de bugs de composición.

### 6.3 Literata en el transcript — se mantiene, con dos avisos

Literata se diseñó para lectura larga en pantalla (se encargó para Google Play Books); a 16px/1.55 con la altura de x que tiene, la velocidad de lectura no es una preocupación real, y el cursor de bloque de 2×18px le da al streaming una gramática de máquina de escribir que hace intencional la serif. Los avisos: (1) en monitores 1× DPR — mayoría en pymes — una serif regular a 16px pierde finura; con la variable, subir el eje `wght` a ~430-450 en `1dppx` es una corrección de una línea de CSS que conviene dejar escrita; (2) valorar que **los turnos del usuario** vayan en Archivo: lo que dicta el usuario es una instrucción, no parte de las actas, y la distinción tipográfica cuenta la historia del producto mejor que el color solo. No es obligatorio; es la versión más nítida de la propia tesis P1.

### 6.4 La Mesa con `preserve-3d` — el único efecto que NO sobrevive a una implementación mediocre; aplanar por defecto

El problema no es el rendimiento (4-6 capas compuestas es barato); es que **texto de 12px en versalitas sobre un plano con `rotate3d` se rasteriza fuera de eje** y el antialiasing lo empasta — en Windows/ClearType especialmente. Las placas llevan exactamente eso (§9.10: Archivo `wdth 78%`, 12px, versalitas). Un arco 3D con nombres borrosos lee como maqueta, y es la primera pantalla del producto. La ventana de calidad de este efecto es estrecha: sólo funciona si sale perfecto y se prueba en dispositivos reales, y el plan lo programa dentro de una fase de 3-4 días junto a otras nueve tareas.

Recomendación: **construir por defecto la variante que el propio DESIGN ya especifica como colapso bajo `lg`** (fila/arco 2D de placas con la lámpara móvil y `scale(1.03)`+sombra al hablar) para todos los tamaños, y dejar el arco `preserve-3d` como mejora opcional detrás de una pasada de QA en dispositivo real. Se conserva el 100% de la información (asientos, identidad, agujas, quién habla) y se elimina el modo de fallo «se ve barato». Esto además resuelve R13 (6+ agentes custom) sin geometría variable.

### 6.5 Alcance: el corte de 7-9 días es correcto como *suelo*, pero no entrega la identidad

De acuerdo con que 0+1+2 arregla «la app se ve rota» (tokens vivos, acta legible, suelo a11y). Pero ninguno de los efectos que hacen memorable la dirección (grano, mesa, sello, rail) está en ese corte: tras 9 días la app estará *corregida*, no *rediseñada* — y «la prueba del recuerdo» del propio plan (checklist final) fallaría. El corte que entrega ~80% del impacto con ~45% del esfuerzo es: **fases 0+1+2 completas + 3.1 (grano, quitar auroras), 3.7 (medida 68ch y turnos), 3.9/3.10 (logo, emojis, copy) + la Mesa en su variante 2D + el sello horneado (2.2 simplificada) ≈ 12-14 días.** Aplazables sin dañar la identidad: Mesa 3D, fase 4 completa salvo 4.1/4.2 (lazy de rutas y mermaid, que son 1 día y quitan ~1.6 MB), fase 5 entera, tema claro (ver §8.2). Todo ello **detrás de arreglar el CI y decidir estrategia de rama** (B4, R10 de §3): sin eso, cualquier corte va a producción sin red.

---

## 7. Riesgos de implementación no contemplados por el plan

1. **No existe red de seguridad, y el plan cree que sí.** El riesgo R14 del plan («Railway puede bloquear el deploy esperando checks») es un riesgo fantasma: el workflow de CI **no se ejecuta nunca** (dispara sobre `main` y la única rama es `master`), su typecheck es un no-op (`npx tsc --noEmit` sobre un tsconfig solution-style comprueba cero ficheros — hace falta `tsc -b --noEmit`) y `npm test` no es fiable en esta máquina (corepack lo redirige a pnpm). Consecuencia doble: (a) 24-31 días-persona de cambios masivos irán a producción sin gate automático; (b) las tareas 0.8, 4.12, 8.x del plan añaden jobs a un workflow muerto. **Y el propio checklist final del plan repite el bug**: la línea de cierre pide `npx tsc --noEmit limpio`, que pasa siempre. Arreglar CI es tarea de Fase 0 (ver B4) y el checklist debe decir `tsc -b --noEmit`.
2. **No hay estrategia de rama/deploy para un rediseño de un mes.** Railway despliega cada push; el plan secuencia fases que dejan estados intermedios visualmente incoherentes (B1, B3, R10 de §3) y no dice en ningún sitio si se trabaja en rama larga, con preview deploys, o directo a `master`. Sin esa decisión, la Fase 0 ya cambia producción.
3. **«OG por sesión» (tarea 2.4) es imposible tal como está planteado.** La app es una SPA pura: los crawlers de OG/Twitter no ejecutan JS, así que `<title>` y metadatos por sesión compartida puestos desde React **no existen para el validador** que la propia aceptación de 2.4 exige. Hace falta trabajo de backend (FastAPI sirviendo el HTML de `/share/:token` con las metas pre-rendidas, o un middleware para user-agents de crawler). El plan lo presenta como tarea de frontend de la fase 2.
4. **El pipeline de fuentes tiene prerequisitos no declarados y un riesgo de pérdida de ejes.** 0.3/R11 asumen `pyftsubset` disponible (es Python: `fonttools` + `brotli`) y no fijan la fuente de descarga. Peor: un subseteo agresivo puede **tirar el eje `opsz` de Literata y el `wdth` de Archivo** — y el sistema depende del `wdth` (placas condensadas §9.10) y, para display de marketing, del `opsz` (§10.1 de este informe). El comando de R11 no lista `--flavor` de ejes; añadir verificación: `fonttools varLib` o `fc-query` confirmando ejes tras subsetear, como criterio de aceptación de 0.3.
5. **El inventario de tests que rompen no existe.** R1 dice «actualizar los tests en el mismo commit» sobre «26 de los 30 ficheros» (son 28); ni el plan ni DESIGN listan qué tests consultan qué clases. Sin ese inventario, la tarea 0.6 es de tamaño desconocido. Generarlo es un grep de 5 minutos y debería ser sub-tarea de 0.8.
6. **La virtualización artesanal (4.9) está subestimada.** «Ventana propia con IntersectionObserver, sin dependencias» tiene que convivir con: scroll anclado al fondo durante streaming, mensajes anclados (pins), saltos a un turno desde el comparador (Q2), y alturas variables con markdown. Es el clásico proyecto de una semana disfrazado de tarea; si 300 turnos es el objetivo, `content-visibility: auto` + `contain-intrinsic-size` da el 80% por el 5% del coste y sin JS.
7. **Persistencia sin dueño en dos QoL.** Q6 (casillas de próximos pasos) y Q11/Q13 dicen «estado persistido» sin decir dónde: `localStorage` diverge entre dispositivos y no viaja con el acta compartida/exportada. Decidir backend vs local **antes** de implementarlas — el acta es el artefacto compartible del producto.
8. **Falta la QoL más obvia del producto: enterarse de que una junta programada terminó.** `ScheduledBoardsSection` crea debates que corren solos y ninguna de las 14 QoL ni ninguna fase añade notificación (in-app, email o badge) de resultado. Un usuario programa una junta semanal y tiene que acordarse de entrar a mirar. Alto impacto, y encaja con la gramática del producto (el registro §8.7 puede portarla).
9. **Sin hoja de estilos de impresión.** Para un producto cuyo entregable es «un documento de facto legal» (palabras del propio plan, Q14), no hay `@media print` en DESIGN ni tarea: imprimir el acta hoy imprime el tema oscuro. Son ~20 líneas sobre `.acta-sheet` (fondo blanco, tinta grafito, sin sombras) y cierra el círculo del posicionamiento.
10. **Dos estimaciones de QoL optimistas.** Q4 (paleta de comandos «~120 líneas»): el patrón combobox accesible (aria-activedescendant, foco, scroll de resultados) triplica eso — sigue siendo M, pero no «sin esfuerzo». Q12 (diff de regeneración): exige cambiar el modelo del store que hoy **trunca** los mensajes al regenerar (`useChatStore.ts:562-576`, verificado) — toca el camino del streaming y sus tests: es M/L, no M.
11. **El estado «claro por defecto» del contrato interactúa mal con `prefers-color-scheme`.** El bloque `@media (prefers-color-scheme: dark){ :root:not([data-theme]){ color-scheme: dark } }` cambia sólo `color-scheme` (controles nativos, scrollbars) sin cambiar los tokens → un usuario con sistema oscuro y sin `data-theme` vería página clara con scrollbars/inputs oscuros. Se resuelve con B1 (fijar `data-theme="dark"`) hasta que exista el conmutador.

---

## 8. Recomendación sobre las 3 decisiones abiertas

### 8.1 `.doc-prose` propia vs instalar `@tailwindcss/typography` → **capa propia. Ratificada, con 4 reglas más.**

La alternativa no es «plugin gratis vs 90 líneas»: el plugin habría que configurarlo contra su gramática (`prose-invert` no sirve para «papel en ambos temas», la serif, la medida 68ch, los h2 con filete, los marcadores de latón — todo serían overrides), y añade una dependencia a la superficie más crítica del producto. La capa propia es más corta que la configuración equivalente del plugin. **Pero** el riesgo R4 (huecos GFM) es real y la mitigación debe ser código, no sólo fixture: `remark-gfm` (instalado, verificado en `package.json`) emite `del` (tachado), `input[type=checkbox]` (task lists — que además Q6 convierte en feature), `sup`+`a` (footnotes) y `table` con alineaciones. Añadir a `.doc-prose`: `del`, `li:has(> input[type=checkbox])` con `list-style:none` y alineación del checkbox, `sup/sub` con `font-size:0.75em; line-height:0`, y `kbd`. Con eso, el fixture de R4 pasa de red de seguridad a formalidad.

### 8.2 Tema claro: ¿construir (6.11) o retirar la opción muerta? → **Retirar la opción ahora; aplazar la construcción; conservar la arquitectura.**

Lo barato ya está hecho: la paleta clara está diseñada y calculada (es trabajo real que no caduca), y el patrón `:root`+`@theme inline` es theme-ready sin coste extra. Lo caro no es el 1,5 días de 6.11: es que **duplica la superficie de QA para siempre** (la pasada 8.3 de contraste, la 6.15 responsive, cada componente nuevo en dos temas) en un producto que hoy no tiene ni un usuario pidiéndolo (la opción del select está muerta — D61 — y nadie ha reportado su no-funcionamiento). Decisión recomendada: (a) quitar «Claro» del select de `ProfileSettings.tsx:237` en la Fase 1 (5 minutos, cierra D61); (b) fijar `data-theme="dark"` (B1); (c) construir el claro cuando el trabajo de marketing sobre campo de papel (§10.2) lo ejercite de verdad — será mejor tema claro por haber vivido primero como landing. **Si se aplaza, el contrato debería invertirse: `:root` = oscuro y `[data-theme="light"]` = claro**, para que el fallo por defecto (atributo ausente) sea siempre el tema que existe.

### 8.3 Retirar el copy de ciencia ficción → **Sí, sin matices, en la Fase 3.10 tal como está.**

Verificado en código: «Canal Encriptado de Extremo a Extremo» (`ChatPanel.tsx:355`), «Powered by SPHERE Neuro-Link v2.0» (`ChatPanel.tsx:620-621`), «OBJETOS DETECTADOS» (`ArtifactPanel.tsx:43`). Tres razones: (1) describe capacidades que no existen («encriptado de extremo a extremo» es además una afirmación de seguridad falsa — un canal SSE sobre TLS no es E2EE — y eso es riesgo legal, no sólo de tono); (2) es incompatible con la dirección de sala capitular — no puede haber un secretario de actas que diga «Neuro-Link»; (3) PRODUCT.md ya lo marca como herencia sin decisión detrás. Los nombres propios (Oberon, Nexus, Ledger, Vortex, Némesis) **se quedan**: son compromiso de marca declarado y funcionan dentro de la metáfora. Único cuidado: la cadena «Canal Encriptado…» aparece como estado condicional del placeholder — al retirarla, sustituirla por información real («Conversación privada»), no por nada.

---

## 9. Lo que el plan hace bien (no tocar)

- **La medición es real y es exacta.** Se re-contaron de forma independiente: 105 `text-text-primary`, 193 `text-text-secondary` (plan: 192), 3 `text-text-muted`, 5 `text-agent-*` (en los dos ficheros citados), 2 `bg-surface-elevated|bg-text-secondary` (ficheros y líneas exactos), 155 `text-[8..11px]` con el desglose 107/25/19/4 **exacto**, 88 hex / 34 distintos y 30 `rgba()` / 23 distintos **exactos**, 0 `htmlFor` / 41 `<label>` / 32 `outline-none` / 0 `focus-visible` / 0 `aria-live` / 14 `aria-label` / 2 `role=` / 31 `title=` / 1 `onKeyDown` / 1 `useReducedMotion` — todos exactos.
- **Las citas fichero:línea son fiables.** Muestreo de ~30 citas: `ChatSettingsPage.tsx:100/152/155`, `Sidebar.tsx:161-165/233-241/53-60`, `MessageBubble.tsx:238/436/443/507`, `useChatStore.ts:448/562-576/651-660`, `MainLayout.tsx:118`, `BoardWarRoom.tsx:7-12/106/111`, `ChatPanel.tsx:281/355/558-566/620`, `ErrorOverlay.tsx:11/19`, `RequireAuth.tsx:13-15`, `AgentCreationWizard.tsx:98-99/295`, `errorHandler.ts:165`, `api.ts:645` (+ métodos de documentos en :369/:401/:409 que hacen viable la corrección de D04), `ArtifactCard.tsx:78-87`, `VerifyEmailPage.tsx:35-41`, `CreditsIndicator.tsx:21/56/66`, `DataGrid.tsx:13/16`, `ScheduledBoardsSection.tsx:13/29`, `AgentDetailPage.tsx:359/389/418` (con comillas dobles), `vite.config.ts:8-13`, `AgentSelectorModal.tsx:62`, `OnboardingChecklist.tsx:25`, `ProfileSettings.tsx:237`, `RegisterPage.tsx:93`, `ArtifactPanel.tsx:43`, `MarkdownViewer.tsx:29` — **todas correctas**. Sólo se encontró la imprecisión de PaywallModal (R4) y una fila corrupta de tabla (§2.2, línea 113: «MarkdownViewer → DebateTemplates.tsx»).
- **El diagnóstico causal de D01/D02 es correcto y está bien priorizado**; la corrección de supuestos (los `scrollbar-*` y `bg-surface-highlight` sí funcionan) evita falsos arreglos.
- **La detección del namespace `--duration-*` es correcta** (confirmado compilando, §4) — el error habría sido silencioso y el documento lo caza y explica la alternativa correcta (`duration-(--duration-pop)`).
- **El patrón `:root` crudo + `@theme inline` referenciando variables es el correcto en v4 para temas conmutables** — un `@theme` normal congelaría los valores, como el propio documento explica.
- **Las tareas nombran ficheros y criterios verificables por comando** en su gran mayoría; el checklist final (§9 del plan) es ejecutable por un tercero.
- **La disciplina de propiedades compuestas y la prohibición de animar el texto en streaming** son la decisión de rendimiento más valiosa del documento: atacan la causa real del coste GPU actual (verificados los 3 blobs + blur(100px) + backdrop-blur(120px) + conic-gradient infinito en `ArtifactCard`). *(El techo global de 2 bucles fue sustituido por presupuesto por superficie — ver Anexo B — pero la disciplina de base era correcta y se conserva.)*
- **El inventario de features fantasma (§4.4-4.5)** es correcto donde se muestreó: `billing/portal` sin una sola referencia en `frontend/src`, `ARCHITECTURE.md` describiendo axios/features/widgets inexistentes, `is_public` siempre `false`.

---

## 10. Aptitud como identidad de marca (no solo de producto)

**Veredicto: DESIGN.md v3.0 es un sistema de producto excelente y una identidad de marca incompleta.** Puede heredarse a marketing/landing, pero le faltan cinco especificaciones y una decisión de figura-fondo. Nada de esto exige cambiar la dirección; exige extenderla.

### 10.1 Lo que falta especificar para que sea marca

1. **Escala display (48-96px).** La escala §3.2 muere en `--text-4xl` (39.8px). Para una landing hacen falta 2-3 pasos más, y no es sólo multiplicar: **Literata es variable con eje `opsz`** — a 72-96px debe cargarse/usarse el extremo display del eje óptico (trazos más finos, mayor contraste) o la serif que a 16px es robusta se verá tosca a 80px. Especificar: `--text-display` (~3.583rem), `--text-hero` (~5.16rem, ratio 1.2 continuado), con `font-optical-sizing: auto` (el subseteo de 0.3 debe **conservar el eje `opsz`**, que el comando de R11 con `pyftsubset` puede estar tirando — añadir `--layout-features` no basta; verificar ejes con `fonttools varLib`). Alternativa igual de válida: display en **Archivo `wdth` 62-72 extra-condensada en versalitas** (voz de cartel de sala/placa grande), reservando Literata display para citas. Elegir una y escribirla.
2. **Logotipo y wordmark.** §10 ya apunta el concepto correcto — «anillo de sello con un arco de mesa dentro» — pero sin especificación: construcción geométrica, zona de respeto, mínimos (16px favicon / 24px UI / 48px social), monocromo latón sobre paño y grafito sobre papel. **El sello §8.3 no compite con el logo si el logo ES el sello en reposo**: marca estática = anillo de sello; momento de producto = ese mismo anillo aterrizando sobre el acta. Un solo símbolo, dos estados. Escribirlo así evita que alguien encargue un logo abstracto que conviva mal con el efecto central del producto.
3. **Imágenes sociales (OG/Twitter).** No hay especificación de la tarjeta que se ve al compartir — y `SharedSessionPage` es literalmente el canal de adquisición. Especificar una plantilla OG de 1200×630: hoja de papel con el título de la junta en Literata, el recuento de votos (3-1, con la barra de disenso si lo hay), el sello y el wordmark; fondo paño. Generable en build o vía endpoint (satori/resvg). El plan 2.4 pide «OG por sesión» sin decir qué se pinta: esto es lo que se pinta.
4. **Favicon.** Derivado del anillo de sello a 16/32px (monocromo, sin texto circular — a 16px el texto es ruido). Provisional en 0.4, definitivo en 3.9.
5. **Sistema de plantilla de email** (verificación, recibos de compra de créditos): hoy salen con lo que dé Firebase/Stripe. Mínimo: cabecera con wordmark, tipografía del sistema con fallbacks web-safe, un token de latón. Sin esto la primera impresión post-registro rompe la marca.

### 10.2 Figura-fondo en marketing: invertir

En la app el paño es el campo (la sala en penumbra) y el papel es la figura (el acta). **En una landing de scroll largo, esa relación se invierte:** el campo debe ser papel (`paper-100`) con la tinta `graphite` — lectura larga de marketing sobre casi-negro fatiga y lee funeraria — y el paño pasa a ser **las «salas»**: secciones-vitrina oscuras donde vive el producto (screenshots reales, la sesión de muestra §8.6 de DESIGN). El latón mantiene su regla en ambos campos: un macizo por viewport (el CTA). Esto además resuelve tono para pyme: papel = registro, gestoría, documento firmado — accesible; el paño queda como el interior del producto, no como la fachada. **Regla heredable:** marketing = papel como campo, paño como escaparate; producto = paño como campo, papel como entregable. Es la misma pareja de materiales contando la misma historia desde el otro lado.

### 10.3 «Sistema vivo» — resuelto por eventos reales, no por ambiente

De acuerdo con el enfoque del propietario, con una precisión: el movimiento ambiental decorativo no sólo es más caro; **es menos creíble** — la app de hoy ya tiene fondo perpetuamente animado y transmite salvapantallas, no vida. La vida se demuestra con consecuencias: cada evento real de n8n/SSE produce un asiento visible en el registro. Esta auditoría lo ha convertido en sistema editando DESIGN.md (ver Anexo B): **§8.7 Registro de Actuaciones** (telégrafo de eventos reales de herramienta), **§8.8 La Pluma del Acta** (el libro que se escribe con los chunks reales), **§8.9 El Latido de la Actuación** (un anillo por arranque real + barra indeterminada honesta), **§8.11 La Deliberación** (filamentos por rol dirigidos por tokens en el debate paralelo), **§8.12 Cifras que Asientan** (odómetro de contaduría). El caso difícil — landing sin eventos aún — se resuelve con **§8.6 La Sesión de Muestra**: réplica de una junta real pregrabada (los mismos eventos SSE serializados, termina, no es bucle decorativo) + telemetría agregada sólo si es verdadera. Ningún efecto de §8 original queda redundante; el único sacrificable si el presupuesto de una superficie se tensa es el arco 3D de la Mesa (§6.4 de este informe), cuya variante 2D ya está especificada como colapso.

### 10.4 Pyme vs sala capitular: gana la lectura A, con tres salvaguardas

**La metáfora se queda porque es la promesa literal del producto para una pyme**: «tu empresa de 12 personas tiene el consejo que no podía permitirse». Un consejo de administración no es el mundo que excluye a la pyme — es exactamente lo que SPHERE le vende por 5 créditos. Y la lectura club/casino la disparan los materiales saturados, no la metáfora: con croma 0.018-0.028 el paño es penumbra, no tapete (§6.1). Salvaguardas para que no derive a suntuario:
1. **Copy anti-lujo (añadir a §11):** prohibidas las palabras «premium», «exclusivo», «élite», «lujo». La promesa es **acceso**, no exclusividad: «el consejo que no podías permitirte» y no «una experiencia exclusiva». El secretario habla de trabajo, no de privilegio.
2. **Latón con disciplina ya escrita** (un macizo por pantalla) + **cero texturas de cuero/madera** (ya implícito: la única textura es el grano al 4%). Mantenerlo como regla dura en revisión.
3. **La fotografía/casos que se añadan en marketing muestran talleres, agencias, clínicas, tiendas** — no torres de oficinas. (Hoy no hay imágenes; cuando las haya, esta línea decide el tono más que cualquier token.)

**PRODUCT.md está alineado** (verificado): «Fundadores, directivos y operadores de **pymes** y startups… sin un comité real detrás» — pyme nombrada primero, y las 6 plantillas de debate son escenarios de pyme. No hay bloqueante de contenido; sólo conviene vigilar dos deslices menores hacia «inversor/consejo real» (PLAN Q1) que asumen startup levantando capital: válido como caso, no como retrato único.

---

## Anexo A — Discrepancias menores de datos (no accionables, se listan por honradez)

- `index.css` actual: 97 líneas (plan: 96); utilidades custom actuales: 7 (`glass-panel`, `glass-card`, `glass-input`, `aurora-container`, `aurora-blob`, `hover-lift`, `active-scale`), no 4.
- LOC: 14.190 en `.ts/.tsx` + 97 de CSS ≈ 14.287 (plan: 14.286) — cuadra si se cuenta el CSS.
- `text-text-secondary`: 193 medidos vs 192 del plan (una ocurrencia de diferencia, irrelevante).
- «302 declaraciones de color muertas» = 193+105+3+2 = 303 con mi recuento; la cifra de portada excluye los 5 `text-agent-*` que sí están en la tabla §2.1. Coherente pero fácil de malinterpretar.
- PLAN dice «`ChatSettingsPage.tsx:100` early return»: el `return` multilínea empieza en :99-100 — correcto a efectos prácticos.
- La nota de la tarea 0.8 afirma que el detector «ya existía como scratch sin commitear (`frontend/__tw_probe.mjs`, `__tw_diff.mjs`, `__tw_out.css`)»: **esos ficheros no existen** ni en `frontend/` ni en la raíz (verificado). La tarea no depende de ellos, pero quien vaya a «formalizarlos» no los encontrará.
- PRODUCT dice «30 ficheros de test» y PLAN R1 «26 de los 30»: son **28** (y la premisa de R1 es falsa — ver R11 de §3).
- Verificados además, y correctos: `openspec` sin un solo `- [ ]` (0 en los 4 changes) · `billing.py:56` = `@router.post("/portal")` · `auth.py:96` = `@router.get("/me/usage")` · las filas falsas de `FUNCIONALIDADES.md` (:219 portal «hecho», :238 `ToolConfirmationModal` con ✅ y el fichero no existe) · `00-START-HERE.md` diciendo «Greenfield» · `ARCHITECTURE.md` describiendo `shared/ui`, `features/`, `widgets/` e interceptores de Axios inexistentes · `PLAN_IMPLEMENTACION_BOARD_V2.md:135-136` (E2E y smoke nunca ejecutados) · `~/.claude/skills/impeccable/scripts/detect.mjs` existe (la tarea 8.7 es ejecutable) · «13 rutas» exactas en `App.tsx`.

---

## Anexo B — Ediciones aplicadas por esta auditoría a DESIGN.md (traza de autoría)

Por instrucción del propietario del producto («animaciones, muchas»), esta auditoría pasó de auditar a **coescribir el sistema de motion**. Lo editado (el resto de DESIGN.md permanece del agente de diseño original):

1. **§7.4 reescrita entera** — el techo global de «2 bucles simultáneos en toda la pantalla» se sustituye por un **presupuesto por superficie** (8 superficies con número de bucles, densidad y justificación: landing 6 · auth 3 · shell 2 · transcript en streaming 1+pulso · transcript en reposo 3 · acta 2 · settings 1 · SharedSessionPage 4). Se conservan como no negociables: texto en streaming jamás animado token a token, nada de `height/width/top/left`, sólo propiedades compuestas, nada de partículas/nodos. Se añade la «regla de honestidad del motion»: un bucle sólo si representa un proceso real o vive en marketing.
2. **§7.5 ampliada** de 9 a 25 micro-interacciones — cubre ahora todos los componentes canónicos de §9 (modal, toast, tabs, tooltip, acordeón, switch, select, cajón, filas de lista, cifras, skeleton, copiar, vacío, error/reintento).
3. **§7.7 nueva** — tabla de presupuesto de rendimiento verificable por superficie: capas compuestas máximas, bucles máximos, ms de main-thread por frame, cómo se mide en DevTools (CPU 4×) y el criterio de aprobado. Regla: lo que no llega a 60 fps **degrada, no se elimina**.
4. **§8 ampliada de 5 a 12 efectos de firma** (8.6-8.12, cada uno con implementación, coste, degradación móvil y `prefers-reduced-motion`): **8.6 La Sesión de Muestra** (landing: réplica de una junta real desde eventos SSE grabados — resuelve «vida sin mentir» en el primer viewport; termina, no es bucle) · **8.7 El Registro de Actuaciones** (telégrafo de eventos reales de n8n con `role="log"`) · **8.8 La Pluma del Acta** (trazo que avanza con cada chunk real del artefacto) · **8.9 El Latido de la Actuación** (un anillo por `onToolStart` + barra indeterminada honesta) · **8.10 El Cambio de Sala** (View Transitions de React Router 7, `@starting-style`, con `@supports`) · **8.11 La Deliberación** (filamentos por rol dirigidos por tokens en el debate paralelo, throttled) · **8.12 Las Cifras que Asientan** (odómetro de contaduría en saldo/votos/confianza).
5. **§13 `@theme` ampliado y COMPILADO** (verificado contra el `@tailwindcss/postcss` 4.3.3 del proyecto, ver §4.1): `--ease-mech: linear` (estaba en §7.1 y faltaba en el tema — parte del B2) y `--animate-pulse-ring` / `--animate-sweep` / `--animate-indeterminate` con sus `@keyframes`. Las duraciones **siguen fuera** de `@theme` (la restricción de namespaces se respetó y se re-verificó compilando: §4.2).

**Segunda pasada (móvil primero + aplicación de bloqueantes), también editada por esta auditoría:**

6. **Inversión a móvil primero en DESIGN.md** (requisito del propietario: la mayoría del tráfico será móvil): §0 con doble FIRST VIEWPORT (390×844 como caso de diseño, escritorio como expansión) · §4.3 reescrito desde 0 hacia arriba (el caso base a 390px contiene la experiencia completa; cada breakpoint AÑADE — prohibido «colapsa a») · §4.2 `--measure-doc` = `min(68ch, 100% − 32px)` (68ch es techo, no suelo) · **§8.1 La Mesa reescrita: el Palco** (banda con todos los asientos + asiento en foco con swipe; la Sala 2D en `lg+`; el 3D relegado a opcional tras QA en dispositivo) · **§8.4 El Rail reescrito: el Canto** (uñero de 3px ligado al scroll con `animation-timeline: scroll()`, salto por toque; el gutter de 56px con Hansard es la expansión `lg+`) · §8.2/8.3/8.5 con párrafo «Móvil (verificado contra 390px)» · **§8.3 el Sello: sangría pre-renderizada normativa, `feTurbulence` en runtime prohibido** · §8.5 lámpara a `body::before{position:fixed}` (iOS ignora `background-attachment: fixed`) · §8.6/8.7 re-escritos con el móvil como caso base (la réplica del hero cabe entera en 390×844; el registro es una línea con odómetro y sheet) · §7.4 presupuesto de bucles **móvil ref / escritorio** por superficie · §7.7 re-indexado al **dispositivo de referencia** (Android gama media ~200 €, CPU 6× + pasada en hardware real; muelles JS acotados; la landing sigue maximalista porque su técnica es de compositor) · **§3.4 nueva: escala display fluida** (`--text-display` ~40px y `--text-hero` ~52px en 390px, con `clamp()`, compiladas) · **§12.15-12.17 nuevas**: separación táctil ≥8px, zona del pulgar + `env(safe-area-inset-*)`, híbridos con `any-pointer`/`any-hover`.
7. **Aplicación de los 9 bloqueantes**: B1 (default oscuro en `:root`, claro opt-in `[data-theme="light"]`, `@custom-variant dark` reescrito, `color-scheme` coherente) · B2 (escalas completas `ink/baize/brass+800/oxblood/aniline/graphite/paper` expuestas en `@theme`) · B5 (placa: `baize-950` grabado sobre `brass-600`, 6.71:1, corregido en §9.10 y §3.3) · B9 (`.acta-sheet` re-declara el contexto de variables; nuevo `--brass-800` #836323 para enlaces, 5.38:1 medido) · 7 filas de contraste corregidas en §2.4/§2.5/§2.6 + matiz del suelo `ink-500` en §2.2 + cifra real del disabled en §9.1 · B3/B6/B7/B8/B4 aplicados en el PLAN (tareas 0.0-0.6 reescritas, 2.2, 2.4, 3.1-3.4 móvil primero, R1 y R14 rediagnosticados, checklist con `tsc -b`, camino mínimo 12-14 días, matriz responsive con 390px como celda de diseño, perfil 8.4 contra el móvil de referencia).

**Pendiente de decisión humana (no de documento):** endurecimiento opcional de la paleta por defecto (R1 de §3, recomendado no bloqueante), estrategia de rama (0.0 la fija, alguien debe crearla), y la pata backend de OG por sesión.
