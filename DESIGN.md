# DESIGN.md — SPHERE

**Contrato de identidad visual auditable.** v3.0 · 2026-07-29
Stack verificado: React 19.2.8 · TypeScript 5.9.3 · Vite 7.3.6 · **Tailwind CSS 4.3.3** (`@tailwindcss/postcss`) · Framer Motion 12.42.2 · Zustand 5.0.14 · React Router 7.18.1 · lucide-react.

Este documento no describe gustos. Cada valor de aquí es verificable: un auditor puede abrir la app, medir y decir «cumple» o «no cumple». Los ratios de contraste están **calculados**, no estimados (WCAG 2.x, sRGB, fórmula de luminancia relativa). Donde digo 7.85:1, es 7.85:1.

---

## 0. Contrato de dirección

> Este bloque se copia **verbatim** como comentario HTML en `frontend/index.html`, primer hijo de `<body>`, para que sobreviva al build de producción y pueda auditarse con `grep` sobre `dist/`.

```
THESIS — SPHERE es una junta que deja constancia. La interfaz es la sala y el
libro de actas, no un chat con avatares. Rechaza el arreglo que su categoría
siempre envía: fondo casi negro, un acento neón, glass y degradado violeta→cian.

OWN-WORLD — Sala capitular: paño verde (baize) como campo que ocupa el 60%+ de
la superficie, latón como único metal estructural y acción primaria, oxblood
para el disenso y el riesgo, violeta anilina sólo para el sello de certificación,
papel cálido para todo documento. Latón y paño, no vidrio y luz. Radios cortos
(2/4/8/12px), filetes de 1px en toda superficie elevada, cero blur decorativo.

STORY — El usuario entiende que su pregunta se somete a un procedimiento; cree
la recomendación porque ve quién votó qué y con cuánta confianza; y se va con un
acta sellada y unos próximos pasos que puede ejecutar.

FIRST VIEWPORT (MÓVIL, caso mayoritario y de diseño, 390×844) — El Palco arriba:
todos los asientos visibles a la vez como placas de latón con su aguja, el que
habla alzado bajo la lámpara; el Canto del orden del día como uñero de 3px en el
borde izquierdo, con el cursor de latón ligado al scroll; transcript a ancho
completo con nombres sobre el turno; la entrada anclada abajo en la zona del
pulgar, con la acción primaria (enviar / convocar y su coste) en latón macizo,
único elemento macizo de la pantalla.

FIRST VIEWPORT (ESCRITORIO, expansión) — La mesa a la izquierda del transcript,
no encima: el Canto ensanchado a rail de 56px en la canal izquierda; transcript
en columna de 68ch de medida sobre paño; asientos de la junta desplegados en la
Sala a la derecha, cada uno con placa de latón y aguja de confianza. La acción
primaria vive abajo a la derecha del campo de entrada.

FORM — Sala capitular (candidato 5 de la lista ordenada por resonancia).
Staging: geometría de anillo con asiento por rumbo, tomada del sweep-and-decay
SIN su gating por barrido. Seed key: b620ecfd.

FINISH — unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict, and DESIGN.md
```

**Cómo se eligió, y qué se rechazó.** La lista propia, ordenada por resonancia, fue: 1) el libro de actas certificado, 2) la papeleta y el escrutinio, 3) el orden del día parlamentario y la campana de división, 4) el laudo arbitral con su voto disidente, 5) **la sala capitular**, 6) el registrador de gráfico de banda multipluma, 7) la esfera armilar (lectura literal del nombre, único candidato gastado en ella). El dado asignó el 5. De los seis challengers repartidos, sólo uno superó la prueba de fusión: el **puente de vúmetros** (`signals-instruments-vu-meter-bridge`) — una fila de agujas balísticas idénticas leída de un barrido, con rojo sólo pasado el cero. Ganó en claridad de producto (la confianza 0-100 *es* una lectura de instrumento) pero perdió en identificación de audiencia (un fundador vive en salas de juntas, no en estudios de grabación). No gana los dos ejes, así que no se lleva la construcción — pero **su gramática de instrumento se incorpora**: la aguja de confianza (§8.2) es suya, no mía. Se declara aquí para que la auditoría no la lea como adorno.

Rechazados explícitamente y prohibidos en revisión: casi-negro + neón + glow (es *exactamente* la app de hoy); crema + serif de alto contraste + terracota (el opuesto predecible); glassmorphism; degradado morado→azul; esferas y órbitas 3D.

---

## 1. Principios de diseño

Seis. Cada uno con su regla accionable y su anti-patrón prohibido. En revisión de PR se citan por número.

### P1 — El documento manda sobre el chat
El entregable de SPHERE es el acta. La tipografía de lectura larga, la medida de línea y la jerarquía de encabezados son de primera clase; el cromo de interfaz es secundario y se mide en 12-13px, no la prosa.
**Regla:** todo markdown generado por un agente se renderiza con la capa `.doc-prose` (§13), que define h1-h6, listas, tablas, enlaces, `hr`, `blockquote`, `strong` y `code`. Ningún markdown sin capa tipográfica.
**Anti-patrón prohibido:** encabezados que heredan `font-size: inherit` del Preflight de Tailwind. Hoy el acta entera se renderiza así — un muro gris indiferenciado. Es el defecto visual nº1 de la app y su reincidencia es motivo de rechazo automático.

### P2 — El desacuerdo es la señal
La interfaz existe para hacer visible el conflicto entre directores. Un voto en contra debe encontrarse antes que un voto a favor.
**Regla:** el disenso usa `--color-dissent` (oxblood) y nunca comparte tratamiento con los votos a favor. La aguja de confianza (§8.2) cruza a oxblood pasado el 70%, en cualquier dirección de voto: certeza alta en contra es la información más valiosa de la pantalla.
**Anti-patrón prohibido:** representar los votos como cuatro chips idénticos en fila donde sólo cambia el glifo. Es lo que hay hoy (`MessageBubble.tsx:494-505`) y aplana precisamente lo que hace único al producto.

### P3 — Materia antes que luz
La profundidad se construye con filete, canto y sombra proyectada, no con blur ni transparencia. Los pasos de relleno del paño son de 1.07-1.11:1 (§2.7, medido) — imperceptibles por sí solos.
**Regla:** **toda** superficie elevada lleva un filete de 1px. Sin excepción. Un `backdrop-filter` sólo se permite en el velo de un modal y como máximo a `blur(3px)`.
**Anti-patrón prohibido:** `backdrop-blur-3xl`, `backdrop-blur-[120px]`, `bg-white/5` como toda la definición de una tarjeta. Hoy `AuroraBackground.tsx:75` compone un `backdrop-blur-[120px]` a pantalla completa de forma permanente; eso desaparece.

### P4 — El coste se declara antes de gastarse
Créditos y acciones destructivas se anuncian delante, no detrás.
**Regla:** todo control que consuma créditos muestra su coste en el propio control, en cifras tabulares. Toda acción destructiva pasa por `<ConfirmDialog>` con el nombre del objeto escrito en el cuerpo.
**Anti-patrón prohibido:** coste explicado sólo en `title=`. Un tooltip nativo no existe en táctil ni para lectores de pantalla. Hoy hay 31 `title=` frente a 14 `aria-label`.

### P5 — Nada se comunica sólo por color, ni sólo por hover
Cada estado necesita un segundo canal: forma, glifo, peso, posición o texto.
**Regla:** las acciones de una fila viven en `opacity-0 group-hover:opacity-100 **focus-within:opacity-100**` **y** son visibles de forma permanente cuando `(hover: none)`. Toda pestaña activa lleva `aria-current` o `aria-selected` además del color.
**Anti-patrón prohibido:** `opacity-0 group-hover:opacity-100` sin las dos salvedades. Hoy aparece en 4 sitios y deja copiar, anclar, valorar, regenerar y borrar **inalcanzables en móvil y por teclado**.

### P6 — Los radios son cortos y el ritmo es uno
La sala capitular es carpintería: cantos vivos y biselados mínimos. Un solo ritmo de espaciado en toda la app, con más aire encima de un encabezado que debajo.
**Regla:** los radios permitidos son 2, 4, 8 y 12px, más `9999px` reservado a punto de estado y avatar. El espaciado sale de la escala de 4px de §4.
**Anti-patrón prohibido:** `rounded-2xl`, `rounded-[24px]`, `rounded-[32px]`, `rounded-[36px]` — hoy conviven cinco radios grandes distintos y hacen que la app parezca blanda. Blando lee como barato.

---

## 2. Paleta

Cada color se declara en OKLCH (fuente de verdad) y en hex sRGB (equivalente calculado). Los ratios están calculados contra los fondos reales que le corresponden.

Los dos temas se diseñan por separado. **El claro no es el oscuro invertido:** cambia la metáfora (paño bajo lámpara ⇄ papel sobre mesa), cambia el metal utilizable (el latón claro no contrasta sobre papel, ver §2.6) y cambia la lógica de sombra (una sombra oscura sobre papel lee como suciedad, así que en claro la elevación la carga el filete).

### 2.1 Escala de paño — `baize` (fondo del tema oscuro)

Hue 158, croma bajo y constante: es un tejido en penumbra, no un verde de marca.

| Token | OKLCH | Hex | Uso |
|---|---|---|---|
| `baize-950` | `oklch(0.155 0.018 158)` | `#060F09` | Fondo de página (e0) |
| `baize-900` | `oklch(0.196 0.021 158)` | `#0D1811` | Panel asentado (e1): sidebar, cabeceras |
| `baize-850` | `oklch(0.232 0.023 158)` | `#142119` | Tarjeta elevada (e2), burbuja de agente |
| `baize-800` | `oklch(0.268 0.025 158)` | `#1C2A21` | Flotante (e3): menú, popover, modal |
| `baize-700` | `oklch(0.330 0.027 158)` | `#2A3A30` | Relleno de control inactivo, pista de slider |
| `baize-600` | `oklch(0.400 0.028 158)` | `#3B4C42` | Separador fuerte, borde de control en reposo |

### 2.2 Escala de tinta — `ink` (texto sobre paño)

Hue 95, croma casi nulo: blanco cálido de tinta, no blanco de pantalla.

| Token | OKLCH | Hex | vs `baize-950` | vs `baize-900` | Uso |
|---|---|---|---|---|---|
| `ink-50` | `oklch(0.985 0.004 95)` | `#FBFAF7` | **18.63:1** AAA | **17.41:1** AAA | Cifra de un dato, título de pantalla |
| `ink-100` | `oklch(0.945 0.006 95)` | `#EEEDE8` | **16.59:1** AAA | **15.50:1** AAA | **Texto de cuerpo por defecto** |
| `ink-200` | `oklch(0.885 0.008 95)` | `#DBD9D3` | **13.78:1** AAA | **12.87:1** AAA | Texto secundario de lectura |
| `ink-300` | `oklch(0.805 0.010 95)` | `#C1BFB8` | **10.57:1** AAA | **9.87:1** AAA | Etiqueta, metadato |
| `ink-400` | `oklch(0.700 0.012 95)` | `#A19E96` | **7.27:1** AAA | **6.79:1** AA | Texto silenciado |
| `ink-500` | `oklch(0.600 0.012 95)` | `#828078` | **4.91:1** AA | **4.59:1** AA | **Suelo absoluto.** Nada más silencioso existe |

> **Regla no negociable:** `ink-500` es el color de texto más apagado que la app puede usar, **y sólo sobre e0/e1** — sobre superficies elevadas cae bajo AA (medido: 4.21:1 sobre `baize-850`, 3.78:1 sobre `baize-800`); sobre e2+ el suelo es `ink-400` *(matiz añadido por la auditoría v3)*. Cualquier texto por debajo de 4.5:1 se rechaza. Hoy la app usa `text-gray-700` (≈2.0:1), `text-gray-600` (≈2.7:1), `opacity-30` y `text-red-400/60` para información real. Todo eso muere aquí.

### 2.3 Latón — `brass` (metal estructural y acción primaria)

Hue 82. Es el único metal. Marca lo que se puede accionar y lo que estructura.

| Token | OKLCH | Hex | vs `baize-950` | vs `baize-900` | Uso |
|---|---|---|---|---|---|
| `brass-300` | `oklch(0.880 0.075 82)` | `#F0D39F` | **13.45:1** AAA | **12.57:1** AAA | Texto sobre relleno de latón activo |
| `brass-400` | `oklch(0.820 0.100 82)` | `#E5BE77` | **11.08:1** AAA | **10.35:1** AAA | **Anillo de foco (tema oscuro)**, hover de metal |
| `brass-500` | `oklch(0.760 0.120 82)` | `#D7A94F` | **8.96:1** AAA | **8.37:1** AAA | **Relleno del botón primario**, cursor del rail |
| `brass-600` | `oklch(0.680 0.115 82)` | `#BC913A` | **6.71:1** AA | **6.27:1** AA | Latón en reposo, placa de asiento |
| `brass-700` | `oklch(0.580 0.100 82)` | `#98742B` | **4.51:1** AA | **4.21:1** AA | **Anillo de foco (tema claro)**, filete de latón |

**Botón primario:** relleno `brass-500 #D7A94F` con texto `baize-950 #060F09` = **8.96:1**. Es el único elemento macizo de la pantalla y por eso no necesita sombra ni degradado.

### 2.4 Oxblood — `dissent` (disenso, riesgo, destructivo)

Hue 25. Cuero de carpeta y tinta roja de margen.

| Token | OKLCH | Hex | vs `baize-950` | vs `paper-100` | Uso |
|---|---|---|---|---|---|
| `oxblood-400` | `oklch(0.640 0.170 25)` | `#E15955` | **5.33:1** AA | 3.35:1 UI | Texto de disenso / error (oscuro) |
| `oxblood-500` | `oklch(0.550 0.180 25)` | `#C53637` | 3.66:1 UI | **4.87:1** AA | Trazo y relleno destructivo |
| `oxblood-600` | `oklch(0.470 0.160 25)` | `#A12628` | 2.61:1 | **6.83:1** AA | Texto de disenso / error (claro) |
| `oxblood-700` | `oklch(0.380 0.130 25)` | `#79191B` | 1.82:1 | **9.80:1** AAA | Texto de disenso enfático (claro) |

> *(Columna `vs paper-100` recalculada por la auditoría v3: las cuatro cifras originales — 2.61/3.71/5.29/7.86 — no correspondían a `paper-100`; los verdictos no cambian, mejoran.)*

### 2.5 Anilina — `certify` (sólo el sello)

Hue 300. La tinta violeta de anilina del tampón del registrador. **Único uso permitido:** el sello de certificación del acta (§8.3) y el estado «certificado». No es un color de acento general — si aparece en un botón cualquiera, el sello deja de significar algo.

| Token | OKLCH | Hex | vs `baize-950` | vs `paper-100` |
|---|---|---|---|---|
| `aniline-400` | `oklch(0.680 0.180 300)` | `#AB79F5` | **6.28:1** AA | 2.84:1 (falla UI) |
| `aniline-500` | `oklch(0.600 0.200 300)` | `#955BE3` | **4.52:1** AA | 3.95:1 UI |
| `aniline-600` | `oklch(0.520 0.190 300)` | `#7C44C3` | 3.21:1 UI | **5.56:1** AA |

> *(Columna `vs paper-100` recalculada por la auditoría v3: las cifras originales — 2.99/4.16/5.85 — estaban calculadas contra `paper-50` y etiquetadas como `paper-100`. El sello (§8.3) usa `aniline-500` explícito sobre la hoja `paper-50` = 4.16:1 ✓; nunca `var(--certify)` del tema oscuro, que es `aniline-400` = 2.99:1 sobre la hoja.)*

### 2.6 Papel — `paper` (tema claro y superficie del acta en ambos temas)

Hue 88. Papel de libro, cálido, no blanco de oficina.

| Token | OKLCH | Hex | Uso |
|---|---|---|---|
| `paper-50` | `oklch(0.988 0.006 88)` | `#FDFBF7` | Hoja del acta (e2 en claro) |
| `paper-100` | `oklch(0.971 0.010 88)` | `#F8F5EE` | Fondo de página (tema claro) |
| `paper-200` | `oklch(0.945 0.014 88)` | `#F1ECE3` | Panel asentado (claro) |
| `paper-300` | `oklch(0.900 0.016 88)` | `#E2DED2` | Relleno de control inactivo (claro) |
| `paper-400` | `oklch(0.820 0.018 88)` | `#C9C4B7` | Separador (claro) |

Texto sobre papel — escala `graphite`, hue 158 con croma mínimo (la tinta recoge el verde del paño):

| Token | OKLCH | Hex | vs `paper-100` | vs `paper-200` | Uso |
|---|---|---|---|---|---|
| `graphite-900` | `oklch(0.245 0.016 158)` | `#1A231E` | **14.80:1** AAA | **13.70:1** AAA | Titulares |
| `graphite-800` | `oklch(0.320 0.018 158)` | `#2B362F` | **11.54:1** AAA | **10.68:1** AAA | **Cuerpo (claro)** |
| `graphite-700` | `oklch(0.405 0.018 158)` | `#414C45` | **8.23:1** AAA | **7.61:1** AAA | Secundario |
| `graphite-600` | `oklch(0.500 0.016 158)` | `#5C6660` | **5.47:1** AA | **5.06:1** AA | **Suelo (claro).** Nada más apagado |

> **`graphite-500` (`#757E79`, 3.84:1) queda fuera del sistema.** Se documenta para que nadie lo reintroduzca: no llega a AA para texto.

**Latón en tema claro — la asimetría deliberada.** `brass-400` sobre `paper-100` da **1.61:1**: invisible. Por eso el anillo de foco del tema claro es **`brass-700` (3.96:1 sobre `paper-100`, cumple el 3:1 de WCAG 1.4.11)** y el botón primario en claro invierte a **relleno `graphite-900` con texto `paper-50` (15.59:1, recalculado)** con un filete de `brass-600`. El latón en claro es filete, nunca campo — y **como texto sobre papel sólo vale `brass-800`** (`oklch(0.520 0.090 82)`, añadido por la auditoría v3: `brass-700` como texto da 4.17:1 sobre `paper-50` y no llega a AA; es el latón de los enlaces del acta). Esto es lo que significa «el claro no es el oscuro invertido».

### 2.7 Semánticos

Nivel único por tema, en `L=0.72` (oscuro) y `L≈0.55` (claro), para que todos los estados tengan el mismo peso óptico entre sí.

| Rol | Oscuro OKLCH | Hex | vs `baize-900` | Claro OKLCH | Hex | vs `paper-100` |
|---|---|---|---|---|---|---|
| `success` | `oklch(0.72 0.15 150)` | `#53BE70` | **7.76:1** AAA | `oklch(0.50 0.14 150)` | `#007834` | **5.16:1** AA |
| `warning` | `oklch(0.72 0.15 75)` | `#DA950B` | **7.17:1** AAA | `oklch(0.52 0.19 75)` | `#A54F00` | **5.19:1** AA |
| `danger` | `oklch(0.72 0.16 25)` | `#F97770` | **6.84:1** AA | `oklch(0.535 0.19 25)` | `#C3292E` | **5.25:1** AA |
| `info` | `oklch(0.72 0.13 232)` | `#37B2E8` | **7.52:1** AAA | `oklch(0.505 0.12 232)` | `#006F9D` | **5.13:1** AA |

> *(Rama clara recalibrada por la auditoría de la FASE 8, medido en DOM vivo: los valores originales — L 0.53-0.565, «≈4.55:1» — estaban calculados SÓLO contra `paper-100`, pero los semánticos viven también sobre `paper-200` (sidebar/cabeceras e1: el saldo de créditos medía 4.32:1) y sobre su propio tinte al 12% en los chips de §9.9 (el chip CONDICIONAL medía 4.11:1). La L baja un paso uniforme (−0.03) para que los cuatro midan ≥ 4.5:1 sobre `paper-100`, `paper-200` **y** su tinte de chip sobre `paper-50`, conservando el mismo peso óptico entre sí. La rama oscura no cambia.)*

### 2.8 Identidades de agente

Se **preserva la familia de tono** de cada director (es compromiso de marca, ya establecido en el producto) y se **unifica lightness y croma** para que los cinco lean como un solo sistema y todos pasen AA sobre las cuatro superficies de paño.

Oscuro: `L=0.72, C=0.135`. Claro: lightness ajustada individualmente al mínimo que clava 4.5:1 sobre `paper-100`.

| Director | Hue | Hex hoy | **Oscuro** | vs `baize-950` | vs `baize-800` | **Claro** | vs `paper-100` |
|---|---|---|---|---|---|---|---|
| Oberon (CEO) | 300 | `#8A63D2` | **`#B290EC`** | **7.50:1** | **5.81:1** | `oklch(0.565 0.19 300)` `#8952D3` | **4.58:1** |
| Nexus (CTO) | 185 | `#00C1B3` | **`#00BFB0`** | **8.42:1** | **6.52:1** | `oklch(0.515 0.13 185)` `#007E71` | **4.57:1** |
| Ledger (CFO) | 265 | `#6B8AFD` | **`#7BA2F9`** | **7.77:1** | **6.02:1** | `oklch(0.555 0.19 265)` `#3A68E0` | **4.55:1** |
| Vortex (CMO) | 345 | `#E34A95` | **`#DF80B8`** | **7.34:1** | **5.69:1** | `oklch(0.57 0.19 345)` `#BF3A90` | **4.57:1** |
| Némesis (DEVIL) | 18 | `#FF4D6D` | **`#ED7F84`** | **7.39:1** | **5.72:1** | `oklch(0.57 0.19 18)` `#CF354B` | **4.52:1** |
| Usuario | 232 | — | **`#2EB2EA`** | **8.04:1** | **6.23:1** | `oklch(0.535 0.13 232)` `#0078AB` | **4.51:1** |

Nexus pasa de `#00C1B3` a `#00BFB0`: prácticamente idéntico. Los demás se aclaran dentro de su tono. La identidad se reconoce; el contraste se arregla.

**Relleno de identidad.** Un agente puede teñir un fondo a **12% de alpha sobre `baize-900`** — p.ej. Nexus da `#0B2C24` (1.21:1 vs el fondo: perceptible, no ruidoso) y `ink-100` sobre él sigue en **12.80:1**. Por encima del 12% el transcript se convierte en un arcoíris.

### 2.9 Filetes y trazos

Derivado de la medición de §2.1: los saltos de relleno del paño son de 1.07-1.11:1, así que el filete no es decoración, es **la única señal fiable de borde**.

| Token | Valor | Ratio | Uso |
|---|---|---|---|
| `--stroke-hairline` | `color-mix(in oklab, var(--color-ink-50) 14%, transparent)` | 1.49:1 vs `baize-900` | Agrupar, dividir. **Nunca como único borde de un control** |
| `--stroke-edge` | `color-mix(in oklab, var(--color-ink-50) 24%, transparent)` | 2.11:1 | Canto de tarjeta elevada, cabecera de tabla |
| `--stroke-control` | `color-mix(in oklab, var(--color-ink-50) 38%, transparent)` → `#676E68` | **3.47:1** ✓ 1.4.11 | **Borde de todo control interactivo** (input, select, checkbox) |
| `--stroke-highlight` | `color-mix(in oklab, var(--color-ink-50) 6%, transparent)` | — | Filete interior superior de 1px: el canto del paño bajo la lámpara |

Tema claro: `--stroke-control` = `color-mix(in oklab, var(--color-graphite-900) 50%, transparent)` → `#898C86`, **3.13:1** sobre `paper-100` ✓.

---

## 3. Tipografía

Tres familias. Cada una hace un trabajo que ninguna otra hace, y una se carga en diferido.

| Familia | Papel | Por qué esta y no otra |
|---|---|---|
| **Literata** (variable, 200-900 + itálica) | Cuerpo del acta, transcript del debate, prosa larga | Se encargó para lectura en pantalla: altura de x grande, contraste bajo, serifas robustas que sobreviven a 16px — donde Playfair, Cormorant o Crimson se deshacen. Y tiene **itálica real**, que es lo que marca el voto disidente en un laudo. Es una cara de libro, y el acta es un documento para leer, no un titular. |
| **Archivo** (variable, wght 100-900 + **wdth 62-125**) | Todo el cromo: placas de asiento, etiquetas, tablas, botones, navegación, cifras | Es la única de la lista con **eje de anchura**: la placa de latón necesita condensada y la tabla necesita normal, y salen del mismo fichero. Grotesca de trabajo, cifras tabulares, sin la personalidad de titular que aquí estorbaría. |
| **JetBrains Mono** (variable) | **Sólo** artefactos de código y diagramas | Ya está en el proyecto y es la herramienta correcta para código. **Se carga en diferido**, junto al visor de código. |

**Prohibidas por defecto, y por qué no se recurre a ellas:** Inter (es lo que hay hoy, sin decisión detrás), Roboto, DM Sans, Plus Jakarta, Outfit, Space Grotesk, IBM Plex, Instrument Sans, Fraunces, Playfair Display, Cormorant, Lora, Crimson, Newsreader, Syne. Ninguna aporta el eje de anchura ni la legibilidad a 16px que este producto necesita.

### 3.1 Carga — sin FOUT, sin cadena de peticiones

Hoy: `@import url('https://fonts.googleapis.com/...')` **dentro de `index.css`** (`index.css:3`). Es la peor estrategia posible — CSS bloqueante que dispara otra petición de CSS que dispara las de los ficheros de fuente, sin `preconnect`, sin `preload`, y bajando siete pesos estáticos con todos los rangos unicode.

**Sustitución obligatoria:**

1. Auto-hospedar en `frontend/public/fonts/` como **WOFF2 variable**, subseteado a `latin` + `latin-ext` (español: `á é í ó ú ñ ü ¿ ¡ «»`). Cuatro ficheros: `literata-var.woff2`, `literata-var-italic.woff2`, `archivo-var.woff2`, `jetbrains-mono-var.woff2`. Presupuesto, **medido sobre los ficheros que hay en `public/fonts/`, no estimado**: `archivo-var` ≤ **101.000 B** (98 KB), `literata-var` ≤ **120.000 B** (116 KB), `literata-var-italic` ≤ **123.000 B** (119 KB), `jetbrains-mono-var` ≤ **24.000 B** (23 KB). Los tres críticos —Archivo y las dos Literata, porque JetBrains Mono va en diferido— suman **341.644 B (334 KB)**, y ese es el techo.

   *(corregido por la auditoría v3 — el presupuesto anterior decía «≤ 45 KB por fichero; los tres críticos ≤ 135 KB» y **no es alcanzable** para una variable de dos ejes con cobertura `latin` + `latin-ext`. La evidencia está medida y documentada en la cabecera de `frontend/scripts/subset-fonts.sh`: Google Fonts, sirviendo sus **propias** slices optimizadas de estas mismas dos caras, pesa **más** — Literata `latin` 110.080 B + `latin-ext` 89.668 B = 199.748 B frente a los 119.080 B de un solo fichero aquí; Archivo 90.104 + 86.240 = 176.344 B frente a 100.700 B. La causa es la tabla `gvar`: 155 KB de deltas sólo en Literata, porque **dos ejes generan 7-8 regiones de tuplas** en las esquinas del espacio de diseño. Se midió el suelo real quitando cosas —sin `latin-ext` y sin kerning, Literata baja a 84 KB y Archivo a 73 KB— y sigue siendo el doble del presupuesto viejo, pagado con tofu en nombres europeos dentro del acta y con el kerning del cuerpo de texto. **El propietario aceptó explícitamente estos tamaños**; las tres palancas para bajarlos, por orden de coste creciente para la identidad, están listadas en el mismo fichero de script)*.
2. En `index.html`, dentro de `<head>`, **antes** de la hoja de estilos:
   ```html
   <link rel="preload" href="/fonts/archivo-var.woff2"  as="font" type="font/woff2" crossorigin>
   <link rel="preload" href="/fonts/literata-var.woff2" as="font" type="font/woff2" crossorigin>
   ```
3. `@font-face` con `font-display: swap`, `font-weight: 100 900`, `font-style: normal`, y `size-adjust` para que la métrica de reserva coincida y no haya salto de layout:
   ```css
   @font-face{font-family:Archivo;src:url(/fonts/archivo-var.woff2)format("woff2-variations");
     font-weight:100 900;font-stretch:62% 125%;font-display:swap;size-adjust:100%;
     unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215}
   ```
4. `JetBrains Mono` **no** se precarga: su `@font-face` se declara pero sólo se referencia desde `.doc-prose code` y el visor de código, ambos en un chunk diferido.
5. Prohibido cualquier `@import url(https://...)` en CSS. Verificable: `grep -r "fonts.googleapis" frontend/src frontend/index.html` debe devolver 0.

### 3.2 Escala

Ratio **1.20**, base 16px. Valores calculados, no redondeados a ojo.

| Token | rem | px | line-height | tracking | Uso |
|---|---|---|---|---|---|
| `--text-micro` | `0.75rem` | **12** | 1.35 | `0.07em` | **Suelo absoluto.** Sólo etiquetas en versalitas: placas de asiento, cabeceras de tabla, unidades |
| `--text-xs` | `0.8333rem` | 13.33 | 1.45 | `0.005em` | Metadatos, marcas de tiempo, texto de ayuda |
| `--text-sm` | `0.875rem` | 14 | 1.5 | `0` | Cromo de interfaz: botones, entradas de menú, celdas |
| `--text-base` | `1rem` | 16 | **1.55** | `0` | **Cuerpo. Transcript y acta.** |
| `--text-lg` | `1.2rem` | 19.2 | 1.45 | `-0.005em` | Entradilla, resumen ejecutivo del acta |
| `--text-xl` | `1.44rem` | 23.04 | 1.3 | `-0.01em` | h3 del acta, título de tarjeta |
| `--text-2xl` | `1.728rem` | 27.65 | 1.22 | `-0.015em` | h2 del acta, título de pantalla |
| `--text-3xl` | `2.0736rem` | 33.18 | 1.15 | `-0.02em` | h1 del acta, cifra grande |
| `--text-4xl` | `2.4883rem` | 39.81 | 1.08 | `-0.025em` | Cifra heroica (saldo, recuento) |

> **12px es el suelo y hay que ganárselo.** Hoy la app usa `text-[10px]` **107 veces**, `text-[11px]` 25, `text-[9px]` 19 y `text-[8px]` 4 — **155 usos de tipografía por debajo del suelo**, incluida información real como el recuento de votos y el saldo de créditos. Toda esa deuda se convierte en `--text-micro` (12px, versalitas, tracking `0.07em`) o sube a `--text-xs`. Auditoría mecánica: `grep -rE 'text-\[(8|9|10|11)px\]' frontend/src` debe devolver 0.

### 3.3 Asignación

| Superficie | Familia | Tamaño | Peso | Color (oscuro / claro) |
|---|---|---|---|---|
| Cuerpo del acta y del transcript | Literata | `base` | 400 | `ink-100` / `graphite-800` |
| h1/h2/h3 del acta | Literata | `3xl`/`2xl`/`xl` | 600 | `ink-50` / `graphite-900` |
| Voto disidente, cita del devil | Literata **itálica** | `base` | 400 | `oxblood-400` / `oxblood-600` |
| Placa de asiento (nombre del director) | Archivo `wdth 78%` | `micro` | 600, versalitas | `baize-950` grabado sobre `brass-600` (6.71:1) — B5 |
| Etiqueta de fase, unidades, cabecera de tabla | Archivo | `micro` | 600, versalitas | `ink-400` / `graphite-700` |
| Botón, menú, pestaña | Archivo | `sm` | 550 | según variante |
| Cifra (saldo, confianza, recuento) | Archivo `tnum` | `2xl`–`4xl` | 600 | `ink-50` / `graphite-900` |
| Código, mermaid | JetBrains Mono | `xs` | 400 | `ink-200` / `graphite-800` |

**Cifras tabulares obligatorias.** Todo número que cambie en su sitio (confianza, saldo, contador, recuento) lleva `font-variant-numeric: tabular-nums`. Sin esto la aguja de confianza «baila» al pasar de 9% a 10%.

### 3.4 Escala display (marketing y momentos heroicos) — fluida, diseñada a 390px

*(Sección añadida por la auditoría v3.)* La escala de §3.2 muere en `--text-4xl` (39.8px): suficiente para el producto, corta para una landing. Los pasos display son **fluidos con `clamp()`** — el valor pequeño es el de diseño (390px), no un mínimo de emergencia:

| Token | Valor | En 390px | Tope (≥ ~1100px) | line-height / tracking | Uso |
|---|---|---|---|---|---|
| `--text-display` | `clamp(2.4883rem, 1.867rem + 2.56vw, 3.5831rem)` | **~40px** | 57.3px | 1.12 / `-0.025em` | Titular de sección de landing, cifra heroica de marketing |
| `--text-hero` | `clamp(3.2rem, 2.2rem + 4.2vw, 5.16rem)` | **~52px** | 82.5px | 1.05 / `-0.03em` | El claim del hero. **Máximo 3 líneas en 390px**: si no cabe, se acorta el claim, no la letra |

Reglas: (1) el hero se redacta para 390px primero — un claim que necesita 96px para impresionar no es un claim, es un póster; (2) en display, **Literata usa su eje óptico** (`font-optical-sizing: auto` — el subseteo de fuentes DEBE conservar `opsz` además de `wght`, verificable con `fonttools`) o, como voz alternativa de cartel de sala, **Archivo `wdth` 62-72 en versalitas**; se elige UNA por superficie, nunca mezcladas en el mismo viewport; (3) los pasos display no entran en el producto (el máximo del producto es `--text-4xl`): son tokens de marketing.

---

## 4. Espaciado y layout

### 4.1 Escala

Base **4px**. Valores permitidos: `0, 1(4), 2(8), 3(12), 4(16), 5(20), 6(24), 8(32), 10(40), 12(48), 16(64), 20(80), 24(96)`. Prohibidos los valores arbitrarios de espaciado (`p-[13px]`, `mt-[7px]`): si hace falta uno, la escala está mal y se corrige la escala.

**Ritmo vertical:** el espacio **encima** de un encabezado es siempre ≥ 1.5× el de **debajo**. Un h2 en el acta lleva `margin-top: 32px; margin-bottom: 12px`. Esto es lo que separa un documento de un volcado de texto.

### 4.2 Medida y contenedores

| Token | Valor | Uso |
|---|---|---|
| `--measure-doc` | `min(60ch, 100% - 32px)` | **Medida del acta y del transcript.** 60ch (**72,5 caracteres medidos**, ver la nota de abajo) es el TECHO, no el suelo: en 390px la medida real es el ancho disponible y eso es correcto — nunca forzar la medida con scroll horizontal |
| `--measure-form` | `44rem` | Formularios de una columna |
| `--container-app` | `100%` | El shell ocupa el viewport; la medida la impone el contenido |
| `--rail-order` | `56px` | Canal izquierda del rail del orden del día (§8.4) |
| `--gutter-sidebar` | `288px` | Sidebar (era 320px: 32px de más que se los come el transcript) |
| `--panel-artifact-min` | `380px` | Mínimo del panel de artefactos |
| `--panel-artifact-default` | `480px` | Por defecto |
| `--panel-artifact-max` | `760px` | Máximo |

Hoy el transcript usa `max-w-4xl` (896px) sin unidad `ch`: a 16px eso son ~112 caracteres por línea, casi el doble del óptimo de lectura. La medida es una decisión de legibilidad, no de gusto.

> **68ch → 60ch — corregido por la fase 4 (rendimiento), y MEDIDO.**
>
> El valor original era `68ch` con la anotación «(~72 caracteres)». El paréntesis decía la intención correcta y el número la implementaba mal **para esta cara**: `ch` es el ancho del glifo «0», y en una tipografía proporcional el carácter medio de prosa es bastante más estrecho que el cero.
>
> **Cómo se midió** (no se estimó): Chromium headless contra el servidor de desarrollo, `.doc-prose` con la hoja de estilos real de la aplicación, diez párrafos de prosa española de acta —no *lorem ipsum*—, `await document.fonts.ready`, y recuento carácter a carácter con un `Range`, agrupando por la fila en que cae cada uno. Se descarta la última línea de cada párrafo, que siempre es parcial. Muestra: 19-20 líneas completas por medida.
>
> | `--container-measure` | Ancho de caja | Caracteres/línea (media) | Rango |
> |---|---|---|---|
> | `68ch` (original) | 630,0px | **82,1** | 77-90 |
> | `62ch` | 574,4px | 73,9 | 64-82 |
> | `61ch` | 565,1px | 72,9 | 64-79 |
> | **`60ch`** (vigente) | 555,8px | **72,5** | 64-79 |
> | `59ch` | 546,6px | 70,5 | 64-75 |
> | `58ch` | 537,3px | 69,0 | 63-75 |
>
> En Literata Regular a 16px, **1ch = 9,264px**. `68ch` quedaba a 82 caracteres, siete por encima del techo de la ventana 65-75 que exige el criterio de aceptación de la tarea 3.7. `60ch` es el valor entero que cae más cerca de los ~72 que el contrato pedía desde el principio.
>
> El número vive en `--measure-doc` y en `--container-measure`, que son el mismo valor: `.doc-prose` consume el segundo, y separarlos daría dos medidas distintas para la misma hoja.
>
> **Lo que NO se ha tocado, a propósito:** la línea del contrato de dirección de §0 sigue diciendo «columna de 68ch». Ese bloque está copiado *verbatim* en `frontend/index.html` para que sobreviva al build y se pueda auditar con `grep` sobre `dist/` (§8.8, clave `b620ecfd`); es un artefacto congelado y no una tabla de tokens. Queda anotada la discrepancia aquí en vez de arreglarla en silencio en dos sitios.

### 4.3 Breakpoints — móvil es el caso base, el escritorio es la expansión

> **Nota de revisión (auditoría v3, requisito del propietario):** la mayoría del tráfico será móvil. Esta tabla estaba escrita de escritorio hacia abajo («colapsa a», «se degrada a») y los dos efectos que definen la marca sólo existían a partir de 1024px. Se reescribe desde 390px hacia arriba: **la versión de 390px es la experiencia completa**; cada breakpoint *añade*, no repara. Ningún efecto de firma puede tener su única versión buena por encima de `lg`.

**Caso base (0-639px, diseñado a 390×844).** La experiencia entera, sin degradados:
- **El Palco** (§8.1): la Mesa en formato vertical — banda adherida bajo la cabecera con TODOS los asientos visibles a la vez (placas de 48-56px con su aguja); tocar una placa abre el **asiento en foco** a casi todo el ancho, navegable con swipe. La junta completa siempre a la vista; la intimidad de un director cada vez.
- **El Canto** (§8.4): el rail del orden del día como uñero de libro en el borde izquierdo — 3px de filamento con el cursor de latón ligado al scroll. El scroll ES el eje del debate.
- Transcript a **ancho completo** con medida `min(60ch, 100% − 32px)` (§4.2: 60ch son 72,5 caracteres medidos, no 68); nombres de director sobre el turno (no hay margen lateral que usar).
- Sidebar en cajón (e4, velo, `Escape`/swipe-back). Panel de artefactos como **hoja a pantalla completa** que sube desde abajo (sheet) — el acta se lee como documento, no como panel.
- Entrada de chat anclada abajo con `env(safe-area-inset-bottom)`; la acción primaria (enviar/convocar, con su coste) vive en la **zona del pulgar** (§12.15).
- El Sello, la Aguja y el Grano: idénticos (§8.2/8.3/8.5 escalan sin variante).

| Breakpoint | min-width | Qué se AÑADE (nunca «qué se arregla») |
|---|---|---|
| `sm` | 40rem (640px) | Rejillas de 2 columnas; toasts pasan de ancho completo abajo a esquina inferior derecha; padding 16→24px |
| `md` | 48rem (768px) | Formularios en 2 columnas; barra de guardado adherida; tablas dejan de apilarse en tarjetas |
| `lg` | 64rem (1024px) | Sidebar fija; el Canto se ensancha al gutter de 56px con números y nombres al margen (Hansard); el Palco se despliega a **la Sala**: todas las placas simultáneas en arco 2D con la lámpara móvil |
| `xl` | 80rem (1280px) | El panel de artefactos deja de ser sheet y pasa a columna en línea redimensionable (380/480/760) |
| `2xl` | 96rem (1536px) | Medida sube a `65ch` (~77 caracteres medidos; era `74ch`, que con la corrección de §4.2 serían 89 y se sale de la ventana de lectura); los márgenes crecen, no la medida |

**Contenedores de altura:** `h-dvh`, nunca `h-screen` ni `min-h-screen` (hoy `RequireAuth.tsx:13` usa `min-h-screen` y deja el hueco clásico de Safari móvil). Las barras fijas (entrada, toasts, sheet) respetan `env(safe-area-inset-*)`.

### 4.4 Densidad

Dos densidades, conmutadas por `data-density` en el elemento raíz, guardadas en `localStorage`.

| | `comfortable` (por defecto) | `compact` |
|---|---|---|
| Alto de fila | 44px | 34px |
| Padding de control | `10px 14px` | `6px 10px` |
| Interlineado del transcript | 1.55 | 1.45 |
| Salto entre turnos | 32px | 20px |

Se implementa con dos custom properties (`--row-h`, `--pad-y`) y **nada más**: la densidad no cambia tamaños de letra por debajo del suelo de 12px ni reduce las áreas táctiles por debajo de 44×44 en punteros gruesos (`@media (pointer: coarse)` fuerza `comfortable`).

---

## 5. Elevación y profundidad

Cinco niveles. El principio P3 los gobierna: **materia, no luz.** Cada nivel se define por relleno + filete + filete interior + sombra proyectada. La sombra es siempre negra pura con alpha, nunca coloreada.

| Nivel | Relleno (oscuro) | Filete | Sombra | Uso |
|---|---|---|---|---|
| **e0** | `baize-950` | ninguno | ninguna | Fondo de página |
| **e1** | `baize-900` | `1px --stroke-hairline` + `inset 0 1px 0 --stroke-highlight` | ninguna | Sidebar, cabecera, panel asentado |
| **e2** | `baize-850` | `1px --stroke-edge` + `inset 0 1px 0 --stroke-highlight` | `0 8px 24px -8px rgb(0 0 0 / .50)` | Tarjeta, burbuja de agente, hoja del acta |
| **e3** | `baize-800` | `1px --stroke-edge`, más `0 0 0 1px rgb(0 0 0 / .40)` por fuera | `0 16px 40px -12px rgb(0 0 0 / .60)` | Menú, popover, tooltip, toast |
| **e4** | `baize-800` | `1px --stroke-control` | `0 32px 80px -20px rgb(0 0 0 / .70)` | Modal |

El **doble trazo** de e3 (filete claro por dentro, filete negro por fuera) es lo que hace que un menú se lea como despegado sin recurrir a blur. Es la técnica de la moldura, y cuesta 0.

**Velo de modal:** `background: color-mix(in oklab, var(--color-baize-950) 72%, transparent)` + `backdrop-filter: blur(3px)`. Tres píxeles. Es el **único** `backdrop-filter` autorizado en la app.

**Tema claro:** la sombra oscura sobre papel lee como suciedad, así que la elevación la carga el filete y la sombra se reduce a un tercio.

| Nivel | Relleno (claro) | Filete | Sombra |
|---|---|---|---|
| e0 | `paper-100` | — | — |
| e1 | `paper-200` | `1px color-mix(graphite-900 12%)` | — |
| e2 | `paper-50` | `1px color-mix(graphite-900 16%)` | `0 2px 6px -2px rgb(26 35 30 / .10)` |
| e3 | `paper-50` | `1px color-mix(graphite-900 22%)` | `0 8px 20px -6px rgb(26 35 30 / .14)` |
| e4 | `paper-50` | `1px color-mix(graphite-900 30%)` | `0 20px 48px -12px rgb(26 35 30 / .18)` |

---

## 6. Radios y formas

| Token | Valor | Uso |
|---|---|---|
| `--radius-xs` | `2px` | Chip, badge, celda de tabla, filete de sello |
| `--radius-sm` | `4px` | **Botón, entrada, select, checkbox, placa de asiento** |
| `--radius-md` | `8px` | Tarjeta, burbuja de mensaje, tarjeta de artefacto |
| `--radius-lg` | `12px` | Modal, panel lateral, hoja del acta |
| `--radius-full` | `9999px` | **Sólo** punto de estado y avatar circular |

Prohibido cualquier otro radio. Verificable: `grep -rE 'rounded-\[[0-9]+px\]|rounded-(2xl|3xl)' frontend/src` = 0.

**Formas de firma, no radios:** donde hoy hay una esquina redonda gorda, va un **bisel a 45°** de 6px en la esquina superior izquierda de la hoja del acta, hecho con `clip-path: polygon(...)`. Es el corte de la hoja encuadernada, cuesta cero y es inconfundible.

La **burbuja de mensaje no tiene pico.** El hablante se identifica por la placa de asiento y el filete de identidad de 2px en el borde de inicio (`border-inline-start`), no por un triángulo. Un pico de bocadillo es vocabulario de mensajería instantánea; esto es un acta.

---

## 7. Motion

### 7.1 Curvas

| Token | cubic-bezier | Cuándo |
|---|---|---|
| `--ease-settle` | `cubic-bezier(0.16, 1, 0.30, 1)` | **Por defecto.** Entradas, aperturas, revelados. Sale rápido y se posa |
| `--ease-travel` | `cubic-bezier(0.83, 0, 0.17, 1)` | Algo que recorre una distancia: cursor del rail, cajón, cambio de panel |
| `--ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | Salidas. Se va y no se despide |
| `--ease-impact` | `cubic-bezier(0.34, 1.42, 0.64, 1)` | **Sólo** el aterrizaje del sello (§8.3). Un uso en toda la app |
| `--ease-mech` | `linear` | Movimiento de máquina: barrido, indeterminado |

### 7.2 Duraciones

| Token | Cómo se usa en una clase | ms | Qué |
|---|---|---|---|
| `--duration-tap` | `duration-(--duration-tap)` | **90** | Respuesta a hover/press. Por debajo de 90ms no se percibe como respuesta |
| `--duration-pop` | `duration-(--duration-pop)` | **160** | Elemento pequeño que entra: chip, tooltip, sello |
| `--duration-reveal` | `duration-(--duration-reveal)` | **220** | Divulgación: acordeón, popover, menú |
| `--duration-panel` | `duration-(--duration-panel)` | **320** | Panel: cajón, panel de artefactos, modal |
| `--duration-scene` | `duration-(--duration-scene)` | **560** | Orquestación de escena completa (sólo apertura de sesión) |

Nada supera 560ms. Nada por debajo de 90ms.

> **Aviso técnico, verificado compilando el bloque de §13 con el PostCSS del proyecto.** Tailwind v4 tiene exactamente 20 namespaces de tema (`--color-*`, `--font-*`, `--text-*`, `--font-weight-*`, `--tracking-*`, `--leading-*`, `--tab-size-*`, `--breakpoint-*`, `--container-*`, `--spacing-*`, `--radius-*`, `--shadow-*`, `--inset-shadow-*`, `--drop-shadow-*`, `--blur-*`, `--perspective-*`, `--zoom-*`, `--aspect-*`, `--ease-*`, `--animate-*`) y **`--duration-*` no es uno de ellos**. Meterlas en `@theme` no genera nada, y una clave numérica (`--duration-1`) es peor: `duration-1` compila a `transition-duration: 1ms` porque `duration-<número>` es una utilidad de valor desnudo en milisegundos. Por eso las duraciones viven en `:root` como custom properties normales y se consumen con la sintaxis de variable de v4, `duration-(--duration-pop)`, o directamente en CSS de componente. Los easings **sí** van en `@theme` porque `--ease-*` sí existe.

### 7.3 Muelles (Framer Motion 12)

Las agujas y las placas no interpolan por duración: son objetos con masa.

```ts
export const SPRING_NEEDLE = { type: 'spring', stiffness: 120, damping: 14, mass: 1 } as const;   // sobrepasa una vez y se posa (~700ms)
export const SPRING_PLATE  = { type: 'spring', stiffness: 220, damping: 26, mass: 0.8 } as const; // placa que se alza, sin rebote
export const SPRING_PANEL  = { type: 'spring', stiffness: 180, damping: 30, mass: 1 } as const;   // panel, sin rebote
```

### 7.4 Qué se anima y qué NO — presupuesto por superficie

> **Nota de revisión (auditoría v3):** esta sección fue reescrita por la auditoría. La versión anterior imponía un techo global de 2 bucles simultáneos en toda la app; el brief del producto pide explícitamente motion abundante («animaciones, muchas»). El error no era la cantidad: era que el presupuesto fuese global. Una landing de propósito único con `animation-timeline: scroll()` (que corre fuera del hilo principal) aguanta motion maximalista sin coste; un transcript recibiendo tokens tiene el hilo principal ocupado y no perdona un salto. El presupuesto correcto es **por superficie**.

**Se anima** (siempre `transform`, `opacity`, `filter` y propiedades compuestas):
- Entrada de un turno del debate: `opacity 0→1` + `translateY 6px→0`, `--duration-pop` / `--ease-settle`, **stagger 40ms** entre turnos que llegan juntos.
- La aguja de confianza al fijarse (`SPRING_NEEDLE`).
- La placa de asiento cuando su director toma la palabra (`SPRING_PLATE`, `translateZ 0→6px`).
- El cursor de latón recorriendo el rail del orden del día (`--duration-panel` / `--ease-travel`).
- El sello del acta, una vez (§8.3). El registro de actuaciones (§8.7), la pluma del acta (§8.8) y el latido de actuación (§8.9): **dirigidos por eventos reales**, nunca por un timer.
- Cajón, modal, panel de artefactos, cambio de ruta (§8.10).
- En la landing y superficies públicas: revelados por scroll (§8.6), sin límite de elementos revelados — el límite es de *bucles*, no de entradas.

**Presupuesto por superficie × clase de dispositivo.** «Bucle» = animación con `iteration-count > 3` o indefinida, visible en la pestaña Animations. Las animaciones de entrada/salida y las dirigidas por evento **no consumen** presupuesto de bucle: terminan solas. **El presupuesto vinculante es el de la columna móvil** — el dispositivo de referencia es un Android de gama media (§7.7), no un portátil: con tráfico mayoritario móvil, lo que no cabe en la columna móvil no está en el sistema, está en la columna de extras de escritorio.

| # | Superficie | Bucles móvil ref / escritorio | Densidad de motion | Por qué |
|---|---|---|---|---|
| 1 | Landing / marketing | **4 / 6** | Maximalista en AMBOS: scroll-driven en hero y secciones, réplica de junta real (§8.6), registro vivo. En móvil el maximalismo se sostiene por técnica, no por recorte: sólo compositor (`animation-timeline`, transform/opacity), cero blur animado, capas acotadas | Propósito único, sin datos en juego; `animation-timeline: scroll()/view()` corre fuera del hilo principal. Es el escaparate |
| 2 | Login / registro / verificación | **2 / 3** | Generosa: entradas escalonadas, grano + lámpara, sello de bienvenida | No hay estado que proteger del jank; primera impresión |
| 3 | Shell (sidebar, cabeceras, navegación) | **1 / 2** | Media: transiciones de navegación (§8.10), focus vivos, contadores que asientan (§8.12) | Siempre visible: debe sentirse sólido, no nervioso |
| 4 | **Transcript en streaming** | **1 / 1** (cursor de bloque) + el pulso de 4px de «está hablando» | Mínima. **El texto en streaming JAMÁS se anima token a token.** La entrada del turno sí (una vez); los filamentos de §8.11 son por-evento y van con throttle | El hilo principal está saturado recibiendo tokens — y en el móvil de referencia ese hilo es la mitad de rápido |
| 5 | Transcript en reposo (debate cerrado) | **2 / 3** | Generosa: replay (§8.6/Q7), agujas re-asentándose al hacer scroll (`view()`), reveals | El hilo está libre; es el momento de lucirse |
| 6 | Acta / documento | **1 / 2** | Al servicio de la lectura: sello, pluma (§8.8), progreso de casillas. Nada parpadea junto al texto | La lectura manda (P1) |
| 7 | Settings / admin | **1 / 1** | Baja: feedback de guardado, skeletons, transiciones de sección | Son herramientas; la velocidad percibida es la feature |
| 8 | SharedSessionPage | **3 / 4** | Alta: es la única superficie pública — réplica del debate, agujas, sello, registro | Canal de adquisición móvil-primero; debe venderse sola en un teléfono |

**No se anima, nunca, en ninguna superficie:**
- El texto en streaming, token a token. Los tokens aparecen; no entran con fade.
- Alto (`height`) ni ancho, `top/left/margin`. La divulgación usa `grid-template-rows: 0fr → 1fr`, que sí se puede componer.
- Partículas, redes de nodos, «constelaciones IA»: es el cliché exacto de la categoría.
- Los cuatro bucles heredados siguen prohibidos tal cual: `AuroraBackground` ×3 + `glow-pulse` + el `conic-gradient` de 6s por acta (`ArtifactCard.tsx:78-87`) no vuelven — eran bucles *decorativos*; los bucles de este presupuesto son *semánticos* (§8.6-8.9) o de espera real.

**Regla de honestidad del motion:** un bucle sólo se permite si representa un proceso real en curso (streaming, ejecución de herramienta, réplica de una sesión real) o si vive en una superficie de marketing. Un bucle que decora sin significar nada se rechaza en revisión, por bonito que sea.

### 7.5 Micro-interacciones concretas

| Gesto | Qué pasa exactamente |
|---|---|
| **hover** (botón) | Relleno sube un escalón (`brass-500`→`brass-400`), `--duration-tap`. Sin `translateY`, sin escala. |
| **hover** (fila) | Fondo a `--stroke-hairline`; el filete de identidad de la izquierda pasa de 2px a 3px. Las acciones de la fila aparecen (y ya eran visibles con `focus-within`). |
| **press** | `scale(0.985)` y relleno un escalón más oscuro, `--duration-tap`. `0.985`, no `0.95`: a 0.95 el botón se hunde y parece de juguete. |
| **focus** | `outline: 2px solid var(--focus-ring); outline-offset: 2px`. `--focus-ring` = `brass-400` en oscuro (10.35:1), `brass-700` en claro (3.96:1). Siempre `:focus-visible`. **Nunca** `outline: none` sin sustituto. |
| **drag** (redimensionar panel) | El tirador pasa a `brass-500`, el cursor a `col-resize`, y se **suspenden todas las transiciones** durante el arrastre. |
| **éxito** | El control se convierte en su propia confirmación durante 1800ms: glifo `Check` + etiqueta en pasado («Guardado»), `--duration-pop`. Y un `aria-live="polite"` lo dice. Sin toast para el éxito de una acción local. |
| **error** | El campo toma `--stroke-control` en `oxblood-500` y aparece un mensaje debajo, ligado con `aria-describedby`. **Sin shake**: un temblor comunica «has hecho algo mal» y suele ser mentira. |
| **voto emitido** | La aguja del asiento va a su valor con `SPRING_NEEDLE`; si cruza 70 el arco se tiñe de oxblood. Sin sonido, sin confeti. |
| **acta cerrada** | Sello (§8.3). Una vez. Este es el único momento celebratorio de la app y por eso funciona. |
| **modal** (§9.4) | Velo `opacity` `--duration-reveal`; panel `opacity 0→1` + `scale .98→1` + `translateY 8px→0`, `--duration-panel`/`--ease-settle`. Salida `--duration-pop`/`--ease-exit`. El velo nunca parpadea: entra después del panel en la salida. |
| **toast** (§9.5) | Entra desde el canto inferior con `translateY 12px→0` + `opacity`, `--duration-pop`/`--ease-settle`; al apilarse, los anteriores suben con `SPRING_PANEL` (la pila se reacomoda, no salta). Salida `--ease-exit`. |
| **tabs** (§9.8) | El subrayado de latón **se desliza** entre pestañas (`layoutId` de Framer Motion, `--duration-reveal`/`--ease-travel`). El contenido del panel entra con `opacity` + `translateY 4px→0`, sin desplazar el layout. |
| **tooltip / popover** (§9.6) | Aparece con `opacity 0→1` + `scale .96→1` desde su ancla, `--duration-pop`/`--ease-settle`, tras el delay de 400ms. Desaparece a `--duration-tap` — un tooltip que tarda en irse estorba. |
| **acordeón / disclosure** | `grid-template-rows 0fr→1fr` + `opacity` del contenido, `--duration-reveal`/`--ease-settle`. El galón rota 180° en el mismo tiempo. Nunca `height`. |
| **switch / checkbox** | El pulgar viaja con `--duration-tap`/`--ease-travel`; el check se dibuja con `stroke-dashoffset` en `--duration-pop`. El color solo no basta (P5): la posición y el glifo son el segundo canal. |
| **select** (§9.2) | El menú despliega como popover (ver arriba); la opción elegida hace un único flash de `--stroke-hairline`, `--duration-pop`. |
| **cajón lateral** (§9.13) | Entra con `translateX` y `SPRING_PANEL`; el velo con `opacity`. Al cerrar, `--ease-exit`. El tirador de redimensionar suspende TODAS las transiciones durante el arrastre. |
| **fila que entra en una lista** | `opacity 0→1` + `translateY 4px→0`, stagger 24ms, máximo 8 filas con stagger (las siguientes entran juntas): una lista de 200 filas no es un desfile. |
| **cifra que cambia** (saldo, recuento, confianza) | Rodillo de odómetro (§8.12): el dígito saliente sube, el entrante llega desde abajo, `--duration-pop`/`--ease-settle`, `tnum` para que no baile el ancho. |
| **skeleton** (§9.12) | Barrido de `--stroke-hairline` a 1400ms `--ease-mech`, en bucle **mientras carga** (es un proceso real: consume presupuesto de bucle de su superficie). Con `prefers-reduced-motion`, estático. |
| **copiar** | El glifo `Copy` se convierte en `Check` con `scale .8→1` + `opacity`, `--duration-pop`; vuelve a los 1800ms. Nada se mueve de sitio. |
| **estado vacío** (§9.14) | Entra una sola vez: glifo con `scale .92→1` + `opacity`, luego título y frase con stagger 40ms. Sin bucle: un vacío que parpadea pide perdón. |
| **error de carga / reintento** | El bloque de error entra con `--ease-settle`; al pulsar «Reintentar» el contenido viejo NO desaparece hasta que llega el nuevo (sin flash de vacío). |

### 7.6 `prefers-reduced-motion` — obligatorio

Hoy `useReducedMotion()` se usa en **un** fichero de 47 mientras hay una decena de bucles infinitos. Regla:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
    scroll-behavior: auto !important;
  }
}
```

Y en Framer Motion, `useReducedMotion()` en **todo** componente con `animate` (regla de lint propia). Con movimiento reducido: la aguja **salta** a su valor (no se posa), el sello **aparece** (no aterriza), el cursor del rail **se coloca** (no viaja), y el stagger es 0. La información nunca se pierde: sólo el tiempo.

### 7.7 Presupuesto de rendimiento verificable — medido contra el móvil de referencia

*(Sección añadida por la auditoría v3; re-indexada a dispositivo tras el requisito de tráfico mayoritario móvil.)* Si el producto quiere motion abundante, necesita el instrumento de medida, no una prohibición. **El dispositivo de referencia es un Android de gama media de ~200 € (clase Redmi Note / Galaxy A del 2023-24: 4-8 núcleos lentos, GPU Adreno 6xx/Mali-G5x, pantalla 60-90 Hz)** — emulado como Chrome DevTools con CPU 6× y, antes de cerrar la fase 8, verificado una vez en un dispositivo físico de esa clase. El portátil del desarrollador no aprueba nada.

| Superficie (§7.4) | Capas compuestas móvil / escritorio | Bucles móvil / escritorio | Muelles JS simultáneos (móvil) | Main thread por frame (móvil ref) | Aprobado si (en el móvil de referencia) |
|---|---|---|---|---|---|
| Landing / marketing | 10 / 14 | 4 / 6 | 2 | ≤ 6 ms | 10 s de scroll con pulgar: p95 ≥ 55 fps; 0 frames >16.6 ms atribuibles a estilo/layout; los scroll-driven aparecen como «Animations» sin script |
| Auth | 6 / 8 | 2 / 3 | 1 | ≤ 6 ms | LCP no retrasado por animación (>0.1 s) |
| Shell | 6 / 8 | 1 / 2 | 1 | ≤ 3 ms | En reposo: 0 animaciones corriendo salvo las declaradas |
| Transcript (streaming) | 5 / 6 | 1 / 1 + pulso 4px | 1 | ≤ 3 ms (el resto es de los tokens) | Debate real de 4 agentes: ≥ 55 fps sostenidos; ninguna animación en la traza durante tokens salvo cursor/pulso/filamentos throttled |
| Transcript (reposo) | 8 / 10 | 2 / 3 | 2 | ≤ 6 ms | ≥ 55 fps con 300 turnos y el Canto ligado al scroll |
| Acta / documento | 6 / 8 | 1 / 2 | 1 | ≤ 4 ms | El sello (activo horneado) entra sin frame >16.6 ms; después 0 ms |
| Settings / admin | 5 / 6 | 1 / 1 | 1 | ≤ 3 ms | 0 bucles fuera de skeletons durante carga |
| SharedSessionPage | 8 / 10 | 3 / 4 | 2 | ≤ 6 ms | Lighthouse móvil TBT < 200 ms; réplica ≥ 55 fps |

Reglas de medición y de técnica: (1) toda cifra se toma emulando el dispositivo de referencia (CPU 6×), y la fase 8 incluye una pasada en hardware real de esa clase; (2) «capa compuesta» se cuenta en Rendering → Layer borders; (3) **«muelle JS» = animación conducida por rAF (Framer springs)** — en móvil se prefiere CSS/compositor y los muelles se reservan para la física con significado (aguja, placa, foco del Palco); (4) prohibido en el móvil de referencia: `filter`/`backdrop-filter` animados (el velo de modal de 3px es estático), sombras animadas, y cualquier capa compuesta a tamaño de viewport que no sea el Canto o el velo; (5) un efecto que no llegue a 55 fps **degrada** (versión estática o menos capas), no se elimina; (6) el presupuesto se audita en la tarea 8.4 del plan y en cada PR que añada un bucle. **La landing se mantiene maximalista en el móvil de 200 € porque su maximalismo es de compositor** (scroll-driven CSS + transforms); si una pieza concreta no aprueba la celda, se recorta esa pieza, no el presupuesto.

---

## 8. Efectos de firma

Doce. Ninguno es un degradado, glass, partículas ni nodos flotando. Cada uno tiene su implementación, su coste real, su degradación en móvil y su comportamiento con `prefers-reduced-motion`. Los cinco primeros (8.1-8.5) son del sistema original; los siete siguientes (8.6-8.12) los añadió la auditoría v3 para cubrir landing/scroll, «sistema vivo» dirigido por eventos reales de n8n, y los estados de espera del debate paralelo — bajo el presupuesto por superficie de §7.4.

### 8.1 La Mesa — en móvil es el Palco, y es la versión de referencia
*(Reescrito por la auditoría v3: móvil primero. La versión base se diseña a 390px; el escritorio la expande.)*

**Qué es (base, 0-1023px): el Palco.** En vertical, la junta no es un arco: es un palco. Una **banda adherida** bajo la cabecera muestra **todos los asientos a la vez** — placas de latón de 48-56px con el nombre abreviado y su aguja de confianza en miniatura. Regla dura: *una junta donde no ves a todos no es una junta* — la banda nunca hace scroll horizontal con asientos ocultos; con 4-6 asientos caben en 390px (6×56=336px), y con más (B11, agentes custom) las placas estrechan hasta 44px antes de permitir una segunda fila. Tocar una placa abre el **asiento en foco**: una tarjeta a casi todo el ancho con el nombre completo, la aguja grande con su cifra, el voto y la última intervención citada; **swipe horizontal** pasa al asiento contiguo. Por defecto el foco **sigue a quien habla** (la placa activa se alza 2px y la lámpara se desliza hacia ella en la banda); tocar una placa fija el foco manual y un chip «Seguir la sala» lo devuelve al automático. Esto es algo que el escritorio no tiene: la intimidad de un director cada vez, con la sala entera siempre a la vista.

**Qué se añade en `lg+` (1024px): la Sala.** El palco se despliega: todas las placas simultáneamente como asientos alrededor del paño, en un **arco 2D** (posiciones por rumbo con `translate` + `scale` sutil por profundidad, sin `rotate3d`), la lámpara móvil a tamaño completo y el asiento en foco integrado en el costado. La variante con `preserve-3d; perspective: 900px` queda como **mejora opcional detrás de QA en dispositivo real**: texto de 12px sobre planos rotados se rasteriza fuera de eje y se empasta (ClearType especialmente) — un arco 3D borroso lee como maqueta, y esta pantalla es la primera del producto.

**Implementación.** Banda: `position: sticky`, placas como botones (§9.10) con su aguja (§8.2); el foco es una tarjeta e2 con `SPRING_PLATE` y gesto de arrastre de Framer Motion (`drag="x"`, umbral 40px). La lámpara es **un único** `radial-gradient` cuyo centro se anima con `--duration-panel` / `--ease-travel` hacia la placa activa. En la Sala (`lg+`), asientos con `translate/scale` y la placa que habla alzada con `SPRING_PLATE`.

**Coste.** Una capa compuesta por asiento (4-6) más la lámpara y el foco. Sólo `transform` y `opacity`. En móvil el gesto de swipe usa el arrastre nativo de Framer (sin listeners de scroll).

**Reduced-motion.** El foco cambia por corte (sin deslizamiento), la placa activa no se alza: se marca con el punto y `aria-current="true"`.

### 8.2 La Aguja de Confianza
**Qué es.** Un voto no es un chip: es una medida. Cada asiento lleva un arco graduado de 0 a 100 con una aguja que **sobrepasa y se posa**. Pasado el 70 el arco se tiñe de oxblood — porque la certeza alta, a favor o en contra, es la información que más importa (P2). Es la gramática del vúmetro, incorporada tras la fusión (§0).

**Implementación.** Un `<svg>` de 40×24 por asiento: `<path>` del arco (`stroke-linecap: butt`, `stroke-width: 2`) y `<line>` de la aguja rotada con `SPRING_NEEDLE`. El tramo pasado el 70 es un segundo `<path>` con `stroke-dasharray` y color `oxblood-500`. El valor numérico va al lado en Archivo `tnum`, `--text-micro`.

**Coste.** Una rotación de transform por voto, sólo cuando llega el voto. No hay bucle. Con `prefers-reduced-motion` la aguja salta. El valor va también en `aria-valuenow` sobre un `role="meter"`, así que la medida existe para quien no la ve.

**Móvil (verificado contra 390px).** Escala sin variante: en la banda del Palco la aguja se dibuja a 32×20 y la cifra numérica se muestra sólo en el asiento en foco (§8.1) — en la placa de 48px la aguja ES la lectura rápida y el número exacto está a un toque. `aria-valuenow` se mantiene en ambos tamaños.

### 8.3 El Sello
**Qué es.** Cuando el CEO cierra el acta, un tampón de anilina violeta **aterriza** sobre su cabecera. Es el único momento celebratorio de la app y sucede exactamente una vez por debate. Ahí es donde el debate se convierte en constancia — y es el fotograma con el que este producto se vende.

**Implementación** *(revisada por la auditoría v3: con tráfico mayoritario móvil, `feTurbulence` en runtime pasa de riesgo marginal a coste injustificable — y no compra nada, porque la sangría es textura ESTÁTICA; lo que se anima es el aterrizaje)*. Un `<div>` con `mask-image` de un activo **pre-renderizado**: el anillo de sello (texto circular «SPHERE · JUNTA · <fecha>») con la sangría de tinta **ya horneada** — se generan offline 3-4 variantes de sangrado (con el mismo `feTurbulence`+`feDisplacementMap` como herramienta de generación, exportadas a SVG/WebP de ~2 KB) y se elige por hash del id de sesión, para conservar la sensación de tampón único. Color `aniline-500` (**no** `var(--certify)`: el sello aterriza siempre sobre papel, y `--certify` en tema oscuro es `aniline-400` = 2.99:1 sobre `paper-50`). Aterrizaje: `scale 1.18→1` + `opacity 0→1` en `--duration-pop` con `--ease-impact`, más un asentamiento de `rotate(-1.5deg→0)` en `--duration-tap`. La fecha, que es dinámica, va como `<text>` SVG aparte sobre el anillo horneado. **Prohibido `filter: url(#…)` animado en runtime en cualquier dispositivo.**

**Coste.** Transform + opacity sobre una máscara estática de 96×96: presupuesto de cualquier gama. 0ms tras asentarse. Con `prefers-reduced-motion` el sello aparece ya asentado.

**Móvil (verificado contra 390px).** 96×96 sobre una cabecera de acta a ancho completo: escala sin variante.

### 8.4 El Rail del Orden del Día — en móvil es el Canto, y el scroll es el eje
*(Reescrito por la auditoría v3: móvil primero. La versión anterior degradaba a «stepper horizontal arriba» bajo `lg` — exactamente el genérico que esta sección dice querer evitar.)*

**Qué es (base, 0-1023px): el Canto.** En vertical, el eje del debate ya existe: es el scroll. El orden del día se imprime como el **uñero de un libro de registro** — un filamento de 3px pegado al borde izquierdo del viewport (dentro del safe-area), dividido en **segmentos por fase** proporcionales a los turnos de cada una, con muescas numeradas en las junturas. El **cursor de latón** no viaja con un timer: viaja **con el scroll del lector** — el canto es a la vez el orden del día y la barra de progreso del debate. La fase viva engrosa su segmento; las despachadas se apagan a `ink-500`. **Tocar un segmento salta a esa fase** (scroll suave, o corte con `prefers-reduced-motion`). Mantener pulsado el canto revela una etiqueta flotante con el nombre de la fase («3 · Réplicas») que sigue al dedo — la lectura táctil del índice.

**Qué se añade en `lg+`: el gutter.** El canto se ensancha a la canal de 56px: números siempre visibles, y el nombre del director de cada turno aparece **en el margen**, como en una transcripción de Hansard, no dentro de la burbuja.

**Implementación.** El cursor liga su `translateY` al progreso con `animation-timeline: scroll()` — nativo de CSS, **fuera del hilo principal**, sin listeners; `@supports (animation-timeline: scroll())` y, sin soporte, un `rAF` throttled a 100ms. Los segmentos son un `<ol>` con `flex-grow` proporcional al nº de turnos por fase. El salto por toque usa `scrollIntoView({behavior:'smooth'})`. Los nombres al margen (`lg+`) con `animation-timeline: view()` y visibilidad permanente como fallback.

**Coste.** Cero JS por scroll en navegadores modernos. Un transform. En móvil el canto añade **una** capa compuesta fija de 3×100dvh — trivial.

**Reduced-motion.** El cursor se coloca sin animar; el salto de fase es corte directo. El canto porta `role="navigation"` con enlaces por fase, así que la función existe sin ningún movimiento.

### 8.5 El Grano del Paño
**Qué es.** El fondo no es plano: es tejido bajo una lámpara. Grano de fibra tileado más una única luz cálida arriba a la izquierda que se apaga hacia los bordes.

**Implementación.** Un WebP de **128×128 y ≤3 KB** en `background-image` sobre el elemento raíz, `background-repeat: repeat`, `background-blend-mode: overlay`, `opacity` efectiva 4%. La lámpara (un `radial-gradient` de un solo stop cálido a 12% desde `12% -8%`) va en un **pseudo-elemento `position: fixed`**, no en `background-attachment: fixed` — *(corrección móvil de la auditoría v3: iOS ignora `background-attachment: fixed`, con lo que la lámpara se iría con el scroll; que el grano tileado se desplace con el contenido es imperceptible y aceptable, que la luz de la sala se vaya no)*.

**Móvil (verificado contra 390px).** Idéntico: un tile estático y un fixed de un gradiente. Coste cero en cualquier gama.

**Coste.** Un pintado estático. **Cero.** Y aquí está lo importante: sustituye a tres blobs de 600-700px con `filter: blur(100px)` y `mix-blend-mode: screen` animando transform en bucle infinito, más un `backdrop-blur-[120px]` a pantalla completa (`AuroraBackground.tsx:24-76`, `index.css:80-84`). Es a la vez la decisión **más distintiva** y la **más barata**: libera GPU permanentemente en todos los dispositivos. Cuando el efecto más bonito es también el más rápido, la decisión está bien tomada.

### 8.6 La Sesión de Muestra (landing y primer viewport)
**Qué es.** El caso difícil de «sistema vivo»: en la landing no hay eventos reales que animar todavía, y no se miente. La respuesta es una **réplica de una junta real pregrabada**: en el hero, una mesa en miniatura reproduce una sesión auténtica (turnos entrando, agujas posándose, recuento moviéndose, sello aterrizando) a partir de una **línea de tiempo de eventos grabada de una sesión real** (los mismos eventos SSE del producto, serializados). No es un vídeo ni un bucle decorativo: es el producto ejecutándose sobre datos reales, termina (≈45 s), y al terminar queda el acta sellada con un «Reproducir de nuevo». Debajo, una línea de **telemetría agregada verdadera** si existe («N juntas celebradas · N votos emitidos»): si no hay datos reales, esa línea no se inventa — se omite.
**Implementación.** El mismo `<BoardTable>`/`<ConfidenceNeedle>`/`ActaSeal` del producto alimentados por un `sampleBoard.ts` (la tarea 5.10 del plan ya lo crea) con un reproductor de timeline (`requestAnimationFrame` que despacha eventos por timestamp, velocidad 2×). Los turnos entran con el mismo stagger de 40 ms.
**Coste.** Idéntico al producto en reposo: transforms y opacity por evento despachado; sin bucles salvo el cursor de streaming simulado (1 bucle del presupuesto de landing). Al acabar, 0.
**Móvil ES el caso base** *(revisión v3: la landing tendrá aún más tráfico móvil que el producto)*: se diseña a 390px en vertical — el Palco (§8.1) arriba con 4 placas y sus agujas moviéndose, debajo un transcript de 2-3 turnos entrando, y el acta sellándose al cierre; **la réplica entera visible sin scroll en 390×844**. Arranca sólo cuando el hero es visible (`IntersectionObserver`), se pausa fuera de viewport, y nunca compite con el scroll del pulgar (los eventos se despachan, no se scrollea el mini-transcript automáticamente: los turnos viejos se desvanecen en su sitio). En `lg+` se añade la vista de Sala con el arco y más turnos simultáneos.
**Reduced-motion.** La réplica no se auto-reproduce: se muestra el fotograma final (acta sellada, agujas fijadas) con un botón «Reproducir» que la ejecuta sin easings (los estados saltan).

### 8.7 El Registro de Actuaciones (telégrafo de eventos reales)
**Qué es.** El diferenciador del producto es que los agentes **actúan en el mundo** (n8n: WhatsApp, Notion, GitHub, webhooks). Cada actuación real se asienta en un registro visible: una cinta de una línea en la cabecera del panel de artefactos (y en la landing, alimentada por la sesión de muestra) donde cada evento entra como una entrada de telégrafo — glifo de la herramienta, etiqueta en Archivo `micro` versalitas, hora — que **se desliza desde el canto derecho y se asienta**. Al completarse, gana un check en `success`; si falla, el filete pasa a `oxblood-500`. Las antiguas se comprimen a un contador: «+4 hoy».
**Implementación.** Un `<ol role="log" aria-live="polite">`; cada entrada `translateX(24px)→0` + `opacity`, `--duration-pop`/`--ease-settle`, disparada por `onToolStart`/`onToolResult`/`onToolError` — **nunca por un timer**.
**Móvil ES el caso base** *(revisión v3)*: **una línea** — el último asiento del registro (glifo + etiqueta + hora) con el contador con rodillo (§8.12) al lado: «Acta → Notion · 12:04 · +3». Cada evento nuevo desliza la línea (el saliente sube, el entrante llega — misma mecánica del odómetro). Tocarla abre el registro completo como sheet. Esa línea de una sola altura es MEJOR que la cinta: en 390px una cinta de 3 entradas robaría al transcript exactamente el espacio que el debate necesita. En `lg+` se añade la cinta de 3 entradas visibles en la cabecera del panel de artefactos.
**Coste.** Un transform por evento real. Cero bucles. Cero coste en reposo.
**Reduced-motion.** Las entradas aparecen sin deslizamiento; el `aria-live` ya porta la información.

### 8.8 La Pluma del Acta (el libro se escribe solo)
**Qué es.** Mientras el acta se redacta (chunks de artefacto llegando), su tarjeta y su pestaña muestran que *alguien está escribiendo las actas*: un trazo de pluma — una línea de 24×2px bajo el título — que **avanza con cada chunk recibido** y se reinicia, como una línea manuscrita que llena renglones. Al cerrarse el artefacto, el trazo se completa en una regla llena y entonces cae el sello (§8.3). Encadena causa→efecto: debate → escritura → constancia.
**Implementación.** Un `<span>` con `transform: scaleX(p)` donde `p` avanza en cada `onArtifactChunk` (`--duration-tap`, `--ease-mech`) y se reinicia al llegar a 1. Sin timers: si no llegan chunks, la pluma se detiene — que es la verdad.
**Coste.** Un transform por chunk. Autoterminante. 0 en reposo.
**Móvil.** Idéntico (es una línea de 24px).
**Reduced-motion.** La línea salta de 0 a 1 sin interpolar; el estado «Redactando…» textual ya existe en la tarjeta.

### 8.9 El Latido de la Actuación
**Qué es.** Cuando una herramienta real arranca (`onToolStart`), su tarjeta (`ToolExecutionCard`) emite **un** anillo concéntrico desde el glifo — un latido, no un pulso perpetuo — y mientras la ejecución está en vuelo corre la barra indeterminada de 2px (`--ease-mech`) que ya define §9.2: un bucle honesto, porque hay un proceso real en curso, y consume el presupuesto de bucle de su superficie. Al resolverse: check con `scale .8→1` (éxito) o filete oxblood (error), y el anillo no vuelve.
**Implementación.** El anillo es un `::after` con `border: 1px solid var(--accent)` animado `scale 1→1.8` + `opacity .6→0`, 600 ms, `--ease-settle`, `animation-iteration-count: 1`. La barra indeterminada es la de §9.2 reutilizada.
**Coste.** Un transform+opacity por arranque real; la barra es 1 bucle mientras dura la ejecución y muere con ella.
**Móvil.** Idéntico.
**Reduced-motion.** Sin anillo; la barra queda estática al 50% con `aria-busy="true"` y el estado textual («Ejecutando…») porta la información.

### 8.10 El Cambio de Sala (transiciones de ruta)
**Qué es.** Navegar no parpadea: **la hoja viaja**. Al abrir un acta desde su tarjeta, la tarjeta se convierte en la hoja (morph de posición/escala); al entrar en ajustes, el panel entra como un pliego que se asienta. La app se recorre como un edificio, no como pestañas de navegador.
**Implementación.** View Transitions API: React Router 7 soporta `<Link viewTransition>`; `view-transition-name: acta-sheet` en la tarjeta y en la hoja destino, con `::view-transition-old/new` a `--duration-panel`/`--ease-settle`. `@starting-style` para las entradas de elementos nuevos sin JS. Detección: `@supports (view-transition-name: none)` — sin soporte, corte limpio (que es el comportamiento de hoy, no una regresión).
**Coste.** El navegador compone las instantáneas fuera del hilo principal; coste ≈ un crossfade. Cero JS de animación.
**Móvil.** Idéntico; es donde más se nota la continuidad.
**Reduced-motion.** `::view-transition-group { animation: none }` — corte directo.

### 8.11 La Deliberación (espera del debate paralelo)
**Qué es.** Mientras varios directores redactan a la vez, la mesa muestra **quién está trabajando y cuánto lleva**, sin inventar progreso: bajo cada placa activa corre un **filamento de identidad** — una línea de 2px en el color del director cuyo `scaleX` avanza con los tokens recibidos de ese rol (no con el tiempo) — y el punto de 4px de «está hablando» pulsa (el bucle permitido de la superficie 4). Al emitir su voto, el filamento se retira y la aguja (§8.2) toma el relevo. La fase viva del rail engrosa su raya **una vez** por cambio de fase.
**Implementación.** El filamento reutiliza la mecánica de §8.8 alimentada por `onToken` por rol (ya enrutado por `bubbleByRole`); throttle a 1 actualización/150 ms para no competir con el render de tokens.
**Coste.** Un transform throttled por director activo (máx. 5). El único bucle es el punto de 4px ya presupuestado.
**Móvil.** En la fila de placas colapsada, el filamento es el borde inferior de la placa.
**Reduced-motion.** El filamento avanza a saltos discretos (sin transición); el pulso del punto se sustituye por conmutación de opacidad a 1.

### 8.12 Las Cifras que Asientan (odómetro de contaduría)
**Qué es.** Las cifras que importan (saldo de créditos, recuento de votos, confianza, contador de actuaciones) no cambian por teletransporte: **ruedan** como un contador mecánico de registro — el dígito saliente sube, el entrante llega desde abajo — y el cambio queda subrayado un instante por un filete de latón que se desvanece. El número se siente contabilizado, no repintado. Es la gramática del libro de registro aplicada al dato.
**Implementación.** Cada dígito es un `<span>` en una máscara de `overflow: hidden` con dos hijos apilados; el cambio anima `translateY(-1em)` con `--duration-pop`/`--ease-settle`. `font-variant-numeric: tabular-nums` (ya obligatorio en §3.3) garantiza ancho fijo. El subrayado es un `::after` con `opacity 1→0` a `--duration-reveal`.
**Coste.** Un transform por dígito cambiado, sólo al cambiar. Cero bucles.
**Móvil.** Idéntico.
**Reduced-motion.** El dígito cambia sin rodillo; el subrayado de latón se mantiene (información de «esto acaba de cambiar» sin movimiento).

---

## 9. Componentes canónicos

Anatomía y estados completos. Todo componente que no declare aquí un estado, no lo tiene y no se puede inventar en el sitio de uso.

### 9.1 Botón

Variantes: `primary` · `secondary` · `ghost` · `destructive` · `link`.

Anatomía: `[icono 16px] [etiqueta Archivo sm/550] [afijo]`, `--radius-sm`, alto `var(--row-h)`, padding `0 14px`, `gap: 8px`.

| Estado | primary | secondary | ghost | destructive |
|---|---|---|---|---|
| default | relleno `brass-500`, texto `baize-950` (**8.96:1**) | transparente, filete `--stroke-control`, texto `ink-100` | transparente, texto `ink-300` | transparente, filete `oxblood-500`, texto **`--danger`** (§2.7) |
| hover | relleno `brass-400` | fondo `--stroke-hairline`, filete `brass-600` | fondo `--stroke-hairline`, texto `ink-50` | fondo `oxblood-500` a 12%, texto **`--danger`** |
| active | relleno `brass-600`, `scale(.985)` | + `scale(.985)` | + `scale(.985)` | + `scale(.985)` |
| focus-visible | `outline: 2px --focus-ring; offset: 2px` — idéntico en las cinco variantes | | | |
| disabled | relleno `baize-700`, texto `ink-500` (3.04:1 sobre su relleno — exento de WCAG por deshabilitado; la cifra real es esta, no el 4.59 de la escala, que es contra `baize-900`), `cursor: not-allowed`, **`title` prohibido como única explicación**: el motivo va en texto adyacente o `aria-describedby` | | | |
| loading | ancho **congelado**, etiqueta sustituida por `Loader2` en `animate-spin` + texto en gerundio, `aria-busy="true"`, `disabled` | | | |
| error | no es un estado de botón: el error vive en el formulario | | | |

*(el color del texto de la variante `destructive` está **corregido por la auditoría de la Fase 2**, y es exactamente el mismo defecto que §9.2 ya corrigió para el mensaje de error de campo: la versión anterior prescribía `oxblood-400` (`#E15955`), que sobre las cuatro superficies del tema oscuro mide **5,33:1 en e0 `baize-950` ✓ · 4,98:1 en e1 `baize-900` ✓ · 4,57:1 en e2 `baize-850` ✓ · 4,11:1 en e3 `baize-800` ✗ — por debajo de AA**. Y e3 no es un fondo excéntrico para este botón: es **su fondo canónico**. `<Modal>` es `bg-surface-3` (= e3), §9.4 obliga a que `<ConfirmDialog>` se construya sobre `<Modal>`, y el propio §9.4 manda que las **8 acciones destructivas** de la app pasen por `<ConfirmDialog>` — o sea que el contrato colocaba por escrito el botón destructivo sobre precisamente la superficie donde su texto no cumple AA. `--danger` (`#F97770`) da **5,63:1 sobre e3** y pasa en las cuatro superficies. Segundo motivo, independiente: `--danger` es un **semántico que cambia con el tema**, mientras que `oxblood-400` es un valor fijo de la escala — en el tema claro se queda en 3,52:1 sobre `paper-50` frente a los 4,85:1 de `--danger`. El filete del botón sigue en `oxblood-500`: es borde y no texto, y su requisito es el 3:1 de 1.4.11, no el 4.5:1 de 1.4.3. El velo de hover sigue siendo `oxblood-500` al 12%, que no mueve el contraste del texto de forma apreciable)*.

**Prohibido:** botón deshabilitado a `opacity-40` sin más (≈2.5:1, hoy en `ActaActions.tsx:157`); ancho que salta al entrar en loading; `title` como único motivo de deshabilitación.

### 9.2 Input / Textarea

Anatomía: `<label>` **con `htmlFor`** (`--text-micro`, versalitas, `ink-300`) · campo · texto de ayuda o error (`--text-xs`) ligado con `aria-describedby`.

| Estado | Tratamiento |
|---|---|
| default | relleno `baize-900`, filete `1px --stroke-control` (**3.47:1** ✓ 1.4.11), texto `ink-100`, placeholder `ink-500` (**4.59:1** — el placeholder es texto y cumple AA) |
| hover | filete a `brass-600` |
| focus-visible | filete `brass-400` **más** `outline: 2px --focus-ring; offset: 1px`. Filete y anillo, los dos |
| filled | idéntico a default. Un campo lleno no cambia de aspecto |
| disabled | relleno `baize-850`, filete `--stroke-hairline`, texto `ink-500`, `aria-disabled` |
| readonly | relleno `baize-950`, sin filete lateral, `aria-readonly="true"` y un glifo de candado con `aria-label` |
| error | filete `oxblood-500`, glifo de alerta al final, mensaje debajo en **`--danger`** (§2.7), `aria-invalid="true"` + `aria-describedby` |
| loading | filete a `--stroke-hairline` + barra indeterminada de 2px abajo (`--ease-mech`) |

*(el color del mensaje de error está **corregido por la auditoría de la Fase 1 — B10**, continuación de §5.3 de `AUDIT_PLAN_V3`: la versión anterior prescribía `oxblood-400` (`#E15955`), que sobre las cuatro superficies del tema oscuro mide **5,33:1 en e0 `baize-950` ✓ · 4,98:1 en e1 `baize-900` ✓ · 4,57:1 en e2 `baize-850` ✓ · 4,11:1 en e3 `baize-800` ✗ — por debajo de AA**. §5.3 sólo comprobó el par contra e2, y lo dio por bueno «justo»; el escalón siguiente no se comprobó. Y **e3 es precisamente donde vive la mayoría de los formularios de la app**, porque `<Modal>` es `bg-surface-3` (`Modal.tsx:249`) y §9.4 obliga a que todos los diálogos usen ese primitivo: el contrato mandaba por escrito un color que no cumple AA en su contexto más frecuente. `--danger` (`#F97770`) da **5,63:1 sobre e3** y pasa en las cuatro superficies. Segundo motivo, independiente: `--danger` es un **semántico que cambia con el tema**, mientras que `oxblood-400` es un valor fijo de la escala — en el tema claro se queda en 3,52:1 sobre `paper-50` frente a los 4,85:1 de `--danger`. El filete del campo sigue en `oxblood-500`: es borde y no texto, y su requisito es el 3:1 de 1.4.11, no el 4.5:1 de 1.4.3)*.

**Contrato:** cero controles de formulario sin `id`/`htmlFor`. Hoy hay **69 controles y 0 `htmlFor`** — ni un solo campo de la app está etiquetado programáticamente. Auditoría: número de `htmlFor` ≥ número de `<label>`.

**Select:** `appearance: none` + galón propio de lucide, y `<option>` con `background-color` explícito — hoy los 9 `<select>` de `ProfileSettings.tsx` heredan el desplegable del sistema operativo (a menudo blanco sobre blanco).

**Contraseña:** siempre con conmutador de visibilidad (`aria-pressed`, `aria-label` «Mostrar contraseña»). Hoy no existe en ningún campo, ni en login ni en las claves de API.

### 9.3 Card

`--radius-md`, e2, padding 20px (`compact`: 12px). Anatomía: cabecera (título `xl`/600 + acciones a la derecha) · cuerpo · pie opcional.

Estados: `default` (e2) · `hover` sólo si es accionable (filete a `brass-600`, **sin** `translateY`) · `selected` (filete `brass-500` de 1px + barra de 2px en `border-inline-start`) · `loading` (skeleton §9.12, misma altura) · `empty` (§9.14) · `error` (filete `oxblood-500` + mensaje + acción de reintento).

**Prohibido:** tres tarjetas idénticas en una rejilla de 3 columnas donde sólo cambian icono, título y descripción. Si el contenido es heterogéneo, la composición debe serlo: la rejilla de la mesa, del acta y del panel de artefactos son **distintas** por diseño.

### 9.4 Modal

Un solo primitivo, `<Modal>`, y todos los diálogos lo usan. Hoy hay **cuatro modales hechos a mano** (`AgentSelectorModal`, `AgentCreationWizard`, `BoardActivationModal`, `PaywallModal`) más tres diálogos de confirmación inline, y **ninguno** tiene `role="dialog"`.

Contrato obligatorio: `role="dialog"` · `aria-modal="true"` · `aria-labelledby` apuntando al título · **trampa de foco** · foco inicial en el primer control (no en el cierre) · `Escape` cierra · foco **restaurado** al disparador · scroll del fondo bloqueado · clic en el velo cierra sólo si no es destructivo · botón de cierre con `aria-label`, área táctil ≥ 44×44px.

Anatomía: velo (§5) · panel e4, `--radius-lg`, `max-width` por tamaño (`sm` 420px / `md` 560px / `lg` 760px), `max-height: 85dvh`, cuerpo con scroll propio · cabecera adherida · pie adherido con las acciones alineadas al final.

Movimiento: velo `opacity` `--duration-reveal`; panel `opacity 0→1` + `scale .98→1` + `translateY 8px→0`, `--duration-panel` / `--ease-settle`. Salida a `--duration-pop` / `--ease-exit`.

`<ConfirmDialog>` se construye sobre `<Modal>`: título en pregunta, cuerpo **con el nombre del objeto**, botón destructivo a la derecha, foco inicial en Cancelar. Cubre las **8 acciones destructivas que hoy no tienen confirmación**.

### 9.5 Toast

**No existe hoy.** `errorHandler.ts:165` lo admite por escrito: `// (Si no hay sistema de toast aún, se queda como console.warn.)`. Hay **24 `console.error`** que son fallos invisibles para el usuario.

Anatomía: e3, `--radius-sm`, borde de inicio de 3px en el color semántico, `[glifo] [título sm/550] [detalle xs] [acción] [cerrar]`. Esquina inferior derecha en `sm+`, **ancho completo abajo** por debajo de `sm` (hoy `ErrorOverlay.tsx:19` combina `right-6` con `w-full` y se sale por la izquierda en cualquier viewport por debajo de ~448px).

Estados/reglas: `success` 4s auto · `info` 6s · `warning` 8s · `error` **no se cierra solo** y siempre lleva acción o motivo. Pila máxima de 3; el resto se agrupa en «+N más». `role="status"` para info/success, `role="alert"` para warning/error. Auto-cierre en pausa mientras hay hover o foco dentro. **Siempre** un botón de cierre.

### 9.6 Tooltip

Sólo para **complementar**, nunca para portar información única (P4). Delay de apertura 400ms, cierre 100ms. e3, `--text-xs`, `max-width: 260px`. `role="tooltip"` + `aria-describedby`. Se abre con hover **y con foco**. En `(hover: none)` el tooltip no existe: su contenido pasa a texto visible o a un popover con `aria-expanded`.

Auditoría: ningún `title=` puede ser la única fuente de una etiqueta, un coste, un motivo de deshabilitación o un mensaje de error. Hoy lo es en al menos 12 sitios.

### 9.7 Tabla

Anatomía: `<caption class="sr-only">` obligatorio · `<thead>` adherido con `<th scope="col">` en `--text-micro` versalitas · filas de `var(--row-h)` con **filete inferior**, sin zebra · cifras a la derecha con `tnum` · última columna de acciones alineada al final.

Estados: `hover` de fila (`--stroke-hairline`) · `selected` (barra de 2px `brass-500` en `border-inline-start`) · `sorted` (glifo + `aria-sort`) · `loading` (3 filas de skeleton) · `empty` (§9.14 dentro del cuerpo, con `colspan`) · `error` (fila con mensaje y reintento).

**Desbordamiento:** contenedor propio con `overflow-x: auto` **y** `tabindex="0"` + `role="region"` + `aria-label` para que se pueda desplazar con teclado. El `<body>` nunca se desplaza en horizontal. Por debajo de `sm`, tablas de más de 4 columnas se apilan en tarjetas de pares etiqueta/valor.

### 9.8 Tabs

`role="tablist"` · `role="tab"` con `aria-selected` y `aria-controls` · `role="tabpanel"` con `aria-labelledby` · flechas ←/→ para moverse, `Home`/`End` a los extremos, sólo la pestaña activa en el orden de tabulación.

Activa: texto `ink-50` + **subrayado de latón de 2px**, no relleno. Con `layoutId` de Framer Motion el subrayado se desliza (`--duration-reveal` / `--ease-travel`). Hoy la pestaña activa se distingue **sólo por color** en `AdminPage`, `ArtifactPanel` y `SettingsPage`.

Desbordamiento: scroll horizontal con **degradado de desvanecimiento en los dos cantos** — hoy la barra de pestañas de `SettingsPage` se desplaza sin ninguna pista visual y a 320px «Contactos» es indescubrible.

### 9.9 Badge / Chip

`--radius-xs`, `--text-micro` versalitas, padding `2px 6px`, filete de 1px del color semántico a 40% + relleno a 12%. Variantes: `neutral` · `success` · `warning` · `danger` · `certify` · `agent` (toma la identidad del director).

Un chip **interactivo** (filtro) es un `<button>` con `aria-pressed` y no puede depender sólo del color: el estado activo añade un glifo `Check`. Hoy los chips de permisos de `ContactsSettings.tsx:168-181` son botones sin `aria-pressed` cuya selección es puramente cromática.

### 9.10 Avatar de agente — la Placa

**No es un círculo con una letra.** Es una placa de latón: `--radius-sm`, relleno `brass-600`, filete interior superior de 1px en `brass-400` (el canto biselado), nombre en Archivo `wdth 78%`, `--text-micro`, versalitas, color **`baize-950` grabado sobre el latón (6.71:1 sobre `brass-600`, medido)** — *(corregido por la auditoría v3 — B5: la versión anterior prescribía `brass-300` sobre `brass-600`, que da 2.00:1 — el «13.45:1» que citaba era contra `baize-950`, el fondo de la página, no el relleno real de la placa. Tinta oscura grabada en metal es además la física correcta de una placa)*.

El **color del director** entra por una barra de 3px en `border-inline-start` de la placa, no por el fondo: así cinco placas leen como cinco asientos de la misma mesa y no como cinco marcas distintas.

Estados: `idle` (opacidad 0.55) · `speaking` (opacidad 1, `translateZ(6px)`, punto de 4px pulsando en su color) · `done` (glifo `Check` en `success` en la esquina + aguja fijada) · `dissenting` (filete completo en `oxblood-500`).

Con imagen: `--radius-sm`, `object-fit: cover`, **`onError` obligatorio** con fallback a placa de texto — hoy hay **6 `<img>` sin `onError`** y un avatar 404 deja un icono roto.

### 9.11 Burbuja de mensaje — el Turno

Anatomía: nombre del director **en el margen** (§8.4), no dentro · cuerpo en Literata `base`/1.55, medida `60ch` (§4.2) · filete de identidad de 2px en `border-inline-start` · pie con hora (`--text-xs`, `ink-400`, **nunca `opacity-30`**), chip de voto y acciones.

| Estado | Tratamiento |
|---|---|
| default (agente) | e2, relleno `baize-850`, filete de identidad a 2px |
| default (usuario) | relleno `agent-user` a 12%, filete de identidad `agent-user` |
| streaming | cursor de bloque de 2×18px en el color del agente, `opacity` 1↔0 a 800ms. **El texto no se anima** |
| razonando | bloque de razonamiento abierto, texto en Literata itálica `ink-400`, con `role="status"` |
| conclusión | superficie a `paper-50`/`graphite-800` (**es un documento, no un mensaje**), bisel de 6px arriba a la izquierda, sello (§8.3) |
| disenso | filete de identidad en `oxblood-500`, la cita clave en Literata itálica `oxblood-400` |
| acciones | visibles con `group-hover` **y** `focus-within` **y** siempre en `(hover: none)` — P5 |
| error | banda inferior en `danger` con el motivo y un botón «Reintentar» |
| **fallo de envío** | el turno se queda con filete `oxblood-500` a 50% de opacidad y una acción **«Reintentar»** que recupera el texto. Hoy (A8) el texto se pierde |

### 9.12 Skeleton

Hoy hay **1 skeleton frente a 17 spinners** y varios `<p>Cargando...</p>` a pelo.

Regla: si la forma del contenido se conoce, **skeleton**; si no, spinner. Un skeleton es un bloque `--radius-xs` en `baize-850` con un barrido de `--stroke-hairline` a 1400ms `--ease-mech`, **igualando la altura real del contenido** para que no haya salto de layout. Como máximo 3 filas de muestra; para listas largas se repite la fila 5 veces y se difumina la última con una máscara. `aria-busy="true"` en el contenedor y `aria-hidden="true"` en los bloques. Con `prefers-reduced-motion` el barrido no se mueve: queda el bloque estático.

### 9.13 Panel lateral

Sidebar (izquierda, `--gutter-sidebar`) y panel de artefactos (derecha, redimensionable).

- e1, filete de 1px en el canto interior, sin sombra en `lg+`.
- Por debajo de `lg` es un cajón: e4, sombra, velo, **`Escape` cierra**, foco atrapado, foco restaurado.
- El tirador de redimensionar es un `<div role="separator" aria-orientation="vertical" aria-valuenow tabIndex={0}>` operable con **←/→** (paso 16px) y `Home`/`End`. Hoy es un `div` con `onMouseDown` y nada más: **no hay forma de redimensionar sin ratón**, y el ancho se lee de `window.innerWidth` en el render (`MainLayout.tsx:118`), así que no reacciona al `resize`.
- El ancho persiste en `localStorage`.

### 9.14 Estado vacío

Nunca un hueco en blanco y nunca sólo un icono. Anatomía: **glifo de línea de 32px** (no ilustración, no emoji) · título en `lg`/550 que dice qué falta · una frase en `xs`/`ink-400` que dice qué hacer · **una** acción primaria · opcionalmente una pista de atajo.

El mejor estado vacío que ya existe en el repo es `ScheduledBoardsSection.tsx:136-140`: es el patrón. Los que faltan: sidebar sin sesiones (hoy la sección entera desaparece), búsqueda sin resultados en `AgentSelectorModal`, `ServiceCredentialsSettings` con lista vacía (hoy página en blanco), `ContactsSettings`, panel de artefactos.

---

## 10. Iconografía e ilustración

**lucide-react**, ya instalado, `stroke-width: 1.5`, tamaños 16 / 20 / 24 px. Nunca dos tamaños en la misma fila.

- Todo icono decorativo: `aria-hidden="true"`.
- Todo icono que es la única etiqueta de un control: `aria-label` en el control. Hoy hay **31 `title=` y 14 `aria-label`** — se invierte.
- **Emojis prohibidos como elementos de interfaz.** Hoy: `⚡` como logo (`ChatPanel.tsx:281`), `🏛️` como avatar de la junta, `🤖` como fallback, `💬`, `🎨`, `👥`, `⚔️`, y `⚡` **portando el significado «créditos»** sin alternativa textual. Cada uno se sustituye por un glifo de lucide con su `aria-label`. Los emojis sobreviven **sólo** en las plantillas de debate (`debateTemplates.ts`), donde son contenido, y ahí van con `role="img"` y `aria-label`.
- **Logo.** No existe. El favicon es todavía `vite.svg`. Se necesita un SVG monocromo de una sola forma que funcione a 16px y grabado en latón: un **anillo de sello con un arco de mesa dentro**. Es un activo pendiente y va en la lista de entregables, no se improvisa con un emoji.
- **Ilustración.** No hay ninguna, y no se inventa: cero *blobs*, cero personajes, cero isométrico. Donde una ilustración parecería tocar (vacíos, onboarding, paywall) manda el glifo de línea con el grano del paño de fondo. Cualquier imagen sintética que se añada se etiqueta como sintética.
- **Diagramas mermaid.** `themeVariables` se deriva de los tokens leyendo `getComputedStyle(document.documentElement)`, nunca con hex literales — hoy `MermaidDiagram.tsx:11-22` tiene **11 hex clavados**, así que un cambio de paleta arreglaría la app y dejaría todos los diagramas en la paleta antigua.

---

## 11. Voz y tono de la UI

SPHERE es el secretario de la junta: preciso, sobrio, nunca pomposo. Español peninsular, segunda persona, presente. La retórica de ciencia ficción se retira: describe un producto que no existe.

| Regla | Bien | Mal |
|---|---|---|
| Los títulos nombran la cosa, no la saludan | «Junta del 12 de julio» | «SPHERE Intelligence» |
| Sin retórica de ciencia ficción | «Conversación cifrada» | «Canal Encriptado de Extremo a Extremo» *(hoy `ChatPanel.tsx:355`)* |
| Sin firma en cada pantalla | *(nada)* | «Powered by SPHERE Neuro-Link v2.0» *(hoy en 2 sitios)* |
| Los objetos se llaman por su nombre | «3 artefactos» | «3 OBJETOS DETECTADOS» *(hoy `ArtifactPanel.tsx:43`)* |
| El error dice qué pasó, qué hacer y qué se conservó | «No se pudo guardar el nombre. Tu texto sigue en el campo. Reintentar» | «Error: Error cargando credenciales» *(hoy, `String(e)` crudo en 19 sitios)* |
| El vacío da la siguiente acción | «Todavía no hay juntas. Convoca la primera y el consejo debatirá tu decisión.» | *(la sección desaparece, como hoy en la sidebar)* |
| La confirmación nombra el objeto y su consecuencia | «¿Eliminar «Precios 2026»? Se borran el debate y su acta. No se puede deshacer.» | «¿Confirmar borrado?» + Sí/No *(hoy `Sidebar.tsx:256`)* |
| El coste se dice en cifras | «Convocar junta · 5 créditos» | «⚡ 5» |
| Éxito en pasado, corto, sin exclamación | «Acta enviada a Notion» | «¡Perfecto! Todo listo 🎉» |
| Los identificadores internos no se muestran | «Enviar mensajes por WhatsApp» | `whatsapp_send_message` *(hoy `ContactsSettings.tsx:179`)* |
| Un idioma | «Anclado» | «Pinned» *(hoy `MessageBubble.tsx:436`)*, «Artifact Workspace», «Document Preview» |
| Español peninsular, consistente | «empieza» | «empezá» *(hoy `RegisterPage.tsx:93`)* |
| El botón dice lo que hace | «Guardar cambios» | «Guardar» cuando en realidad sólo navega atrás *(hoy `ChatSettingsPage.tsx:231`)* |

**Vocabulario canónico** (no se traduce ni se sinonimiza): junta · director · debate · fase · voto · confianza · recuento · acta · próximos pasos · crédito · intervenir · convocar · disenso.

---

## 12. Accesibilidad — reglas no negociables

Objetivo: **WCAG 2.2 nivel AA**, con **AAA en el texto de cuerpo** (`ink-100` sobre `baize-950` = 16.59:1; `graphite-800` sobre `paper-100` = 11.54:1). Cada punto es verificable mecánicamente.

1. **Contraste.** Texto ≥ 4.5:1 (≥ 3:1 sólo a partir de 24px/700). Componentes de interfaz y bordes de estado ≥ 3:1 (`--stroke-control` = 3.47:1). Nada por debajo de `ink-500` / `graphite-600`. Prohibido usar `opacity` para apagar texto: se cambia el token.
2. **Foco.** `:focus-visible` con `outline: 2px solid var(--focus-ring); outline-offset: 2px` en **todos** los elementos accionables. Prohibido `outline: none` sin sustituto — hoy hay **32 `outline-none` y 0 `focus-visible`**, incluido el propio `.glass-input` de `index.css:77`.
3. **Etiquetas.** Todo control de formulario con `<label htmlFor>` o `aria-label`. Hoy: 41 `<label>`, 69 controles, **0 `htmlFor`**.
4. **Teclado.** Todo lo que se puede hacer con ratón se puede hacer con teclado. Concretamente hoy no se puede: subir un documento (las dos zonas de arrastre son `<div onClick>` con el `<input type=file>` en `hidden`), redimensionar el panel de artefactos, alcanzar las acciones de un mensaje, ni abrir el tooltip de herramientas de una credencial.
5. **Diálogos.** `role="dialog"` + `aria-modal` + trampa de foco + `Escape` + foco restaurado + scroll bloqueado. Hoy: **0 `role="dialog"` en 4 modales**.
6. **Regiones vivas.** Todo lo que cambia sin interacción se anuncia: el turno en streaming (`aria-live="polite"` con *throttle* de 1s sobre un resumen, no token a token), el saldo de créditos, los toasts, el resultado de guardar, el recuento de votos. Hoy: **0 `aria-live`** en toda la app.
7. **Semántica de estado.** `aria-pressed` en conmutadores, `role="switch"` + `aria-checked` en interruptores, `aria-current` en navegación, `aria-selected` en pestañas, `aria-expanded` + `aria-controls` en desplegables, `role="progressbar"`/`role="meter"` + `aria-valuenow` en barras y agujas. Ninguno de estos existe hoy.
8. **Sin HTML anidado inválido.** Cero elementos interactivos dentro de elementos interactivos — hoy `Sidebar.tsx:233` mete un `<button>` dentro de un `<Link>`.
9. **Idioma.** `<html lang="es">`. Hoy dice `lang="en"` sobre una interfaz en español, así que los lectores de pantalla la pronuncian con el diccionario equivocado.
10. **Movimiento.** §7.6. Y **cero** bucles infinitos por defecto: hoy hay una decena.
11. **Áreas táctiles.** ≥ 44×44px en `(pointer: coarse)`. Hoy el cierre de `BoardActivationModal` es de ~24px.
12. **Reflujo.** Sin scroll horizontal del `body` hasta 320px de ancho, ni a 400% de zoom. Todo contenido ancho (tablas, diagramas, código) desplaza dentro de su propio contenedor.
13. **Sin dependencia de color.** §P5.
14. **Herramientas.** `eslint-plugin-jsx-a11y` (nueva devDependency, **0 KB de runtime**) en modo error para: `jsx-a11y/label-has-associated-control`, `alt-text`, `aria-props`, `role-has-required-aria-props`, `no-noninteractive-element-interactions`, `click-events-have-key-events`, `no-static-element-interactions`. Sin esto la regresión es cuestión de semanas.
15. **Separación táctil, no sólo tamaño** *(añadida por la auditoría v3)*. Entre dos objetivos táctiles adyacentes: **≥ 8px de espacio muerto** (además del mínimo de 44×44 de la regla 11; WCAG 2.5.8 exige 24px de objetivo — la regla de casa es más dura). Dos acciones de consecuencia opuesta (borrar/confirmar, detener/enviar) **nunca contiguas** sin separación doble (16px) o confirmación. Las filas de acciones de mensaje espacian sus iconos a ≥ 8px, no `gap-1`.
16. **Zona del pulgar** *(añadida)*. En `(pointer: coarse)`: la acción primaria de cada pantalla (enviar, convocar, guardar) vive en el **tercio inferior** del viewport, alcanzable con el pulgar en agarre de una mano; la entrada del chat y su botón de envío se anclan abajo con `padding-bottom: env(safe-area-inset-bottom)`. Las acciones destructivas se colocan FUERA de la zona natural del pulgar (parte superior de menús/sheets) o exigen `<ConfirmDialog>`. Los sheets se cierran con gesto de arrastre hacia abajo además del botón.
17. **Híbridos (tablet con teclado/ratón)** *(añadida)*. La capacidad se detecta con `any-pointer`/`any-hover`, no sólo con `pointer`: si `any-hover: hover`, los extras de hover se AÑADEN pero jamás sustituyen los caminos táctiles y de foco (P5 sigue mandando); la densidad `comfortable` se fuerza sólo cuando el puntero **primario** es `coarse`; y todo lo operable por hover lo es también por foco de teclado en el mismo dispositivo.

---

## 13. Tokens

Bloque completo para `frontend/src/index.css`. Es código real, listo para pegar. Sustituye **íntegramente** el `index.css` actual, y `tailwind.config.js` se **borra** (Tailwind v4 no lo lee sin `@config`, así que hoy es una fuente de verdad muerta cuyos hex, además, contradicen a los del `@theme` vivo).

Patrón *(actualizado por la auditoría v3 — B1)*: los valores crudos viven en `:root` (tema **oscuro, por defecto**: es el tema del producto hoy, y el fallo seguro con el atributo ausente debe ser el tema que existe) y en `[data-theme="light"]` (opt-in, lo activa el conmutador de la fase 6.11); el `@theme inline` los referencia para generar utilidades que **cambian con el tema**. Esto es obligatorio en Tailwind v4: un `@theme` normal congela el valor y el tema claro no funcionaría.

> **Este bloque está compilado y verificado**, no escrito a mano y confiado: se procesó con el `@tailwindcss/postcss` 4.3.3 del propio proyecto contra un fichero sonda que usa cada utilidad. Resultado: 0 avisos de PostCSS, 109.975 bytes emitidos, y las 21 utilidades del contrato generan el valor declarado (`.text-micro` → `0.75rem`, `.rounded-sm` → `4px`, `.max-w-measure` → `60ch` (era `68ch`; corregido y medido en §4.2), `.shadow-e3` → `var(--shadow-e3)`, `.ease-settle` → `cubic-bezier(0.16, 1, 0.30, 1)`, `.duration-(--duration-pop)` → `var(--duration-pop)`), más la variante `dark`, `.doc-prose h2`, el `clip-path` de `.acta-sheet`, el bloque de `prefers-reduced-motion` y la regla base de `:focus-visible`. El comando para repetirlo está en §13.1.

```css
@import "tailwindcss";

/* ─── Oscuro por defecto; el claro es opt-in con data-theme="light" (B1) ── */
@custom-variant dark (&:where(:root:not([data-theme=light]), :root:not([data-theme=light]) *));

/* ─── Fuentes: auto-hospedadas, variables, subseteadas latin+latin-ext ──── */
@font-face{font-family:Archivo;src:url(/fonts/archivo-var.woff2)format("woff2-variations");
  font-weight:100 900;font-stretch:62% 125%;font-style:normal;font-display:swap}
@font-face{font-family:Literata;src:url(/fonts/literata-var.woff2)format("woff2-variations");
  font-weight:200 900;font-style:normal;font-display:swap}
@font-face{font-family:Literata;src:url(/fonts/literata-var-italic.woff2)format("woff2-variations");
  font-weight:200 900;font-style:italic;font-display:swap}
@font-face{font-family:"JetBrains Mono";src:url(/fonts/jetbrains-mono-var.woff2)format("woff2-variations");
  font-weight:100 800;font-style:normal;font-display:swap}

/* ═══ ESCALAS CRUDAS — independientes del tema ═══════════════════════════ */
:root{
  /* paño */
  --baize-950:oklch(0.155 0.018 158); --baize-900:oklch(0.196 0.021 158);
  --baize-850:oklch(0.232 0.023 158); --baize-800:oklch(0.268 0.025 158);
  --baize-700:oklch(0.330 0.027 158); --baize-600:oklch(0.400 0.028 158);
  /* tinta (sobre paño) */
  --ink-50:oklch(0.985 0.004 95);  --ink-100:oklch(0.945 0.006 95);
  --ink-200:oklch(0.885 0.008 95); --ink-300:oklch(0.805 0.010 95);
  --ink-400:oklch(0.700 0.012 95); --ink-500:oklch(0.600 0.012 95);
  /* papel */
  --paper-50:oklch(0.988 0.006 88);  --paper-100:oklch(0.971 0.010 88);
  --paper-200:oklch(0.945 0.014 88); --paper-300:oklch(0.900 0.016 88);
  --paper-400:oklch(0.820 0.018 88);
  /* grafito (sobre papel) */
  --graphite-900:oklch(0.245 0.016 158); --graphite-800:oklch(0.320 0.018 158);
  --graphite-700:oklch(0.405 0.018 158); --graphite-600:oklch(0.500 0.016 158);
  /* latón */
  --brass-300:oklch(0.880 0.075 82); --brass-400:oklch(0.820 0.100 82);
  --brass-500:oklch(0.760 0.120 82); --brass-600:oklch(0.680 0.115 82);
  --brass-700:oklch(0.580 0.100 82);
  --brass-800:oklch(0.520 0.090 82); /* #836323 — latón de texto sobre papel (enlaces del acta): 5.38:1 sobre paper-50, medido */
  /* oxblood */
  --oxblood-400:oklch(0.640 0.170 25); --oxblood-500:oklch(0.550 0.180 25);
  --oxblood-600:oklch(0.470 0.160 25); --oxblood-700:oklch(0.380 0.130 25);
  /* anilina — SÓLO el sello */
  --aniline-400:oklch(0.680 0.180 300); --aniline-500:oklch(0.600 0.200 300);
  --aniline-600:oklch(0.520 0.190 300);

  /* duraciones — NO en @theme: Tailwind v4 no tiene namespace --duration-* */
  --duration-tap:90ms;    --duration-pop:160ms;   --duration-reveal:220ms;
  --duration-panel:320ms; --duration-scene:560ms;

  /* layout (§4.2) — añadidos al bloque por la FASE 8: ya vivían en index.css
     (la corrección R7 de la auditoría del plan) y el bloque no los recogía */
  --measure-doc:min(60ch, 100% - 32px);
  --measure-form:44rem;
  --container-app:100%;
  --rail-order:56px;
  --gutter-sidebar:288px;
  --panel-artifact-min:380px;
  --panel-artifact-default:480px;
  --panel-artifact-max:760px;
}

/* ═══ TEMA OSCURO (POR DEFECTO — B1: el fallo seguro es el tema que existe) ═ */
:root{
  --surface-0:var(--baize-950); --surface-1:var(--baize-900);
  --surface-2:var(--baize-850); --surface-3:var(--baize-800);
  --surface-inset:var(--baize-700); --surface-doc:var(--paper-50);
  /* añadidos por la fase 7, documentados por la FASE 8: */
  --surface-code:var(--baize-950);   /* fondo del visor de código; conmuta con el tema de Prism (lib/resaltado) */
  --content-gutter:color-mix(in oklab, var(--ink-50) 22%, transparent); /* numeración de líneas: regla graduada, no texto */

  --content-strong:var(--ink-50); --content:var(--ink-100);
  --content-muted:var(--ink-300); --content-quiet:var(--ink-500); /* 4.59:1 suelo — SÓLO sobre e0/e1; sobre e2+ usar ink-400 */

  --stroke-highlight:color-mix(in oklab, var(--ink-50) 6%, transparent);
  --stroke-hairline:color-mix(in oklab, var(--ink-50) 14%, transparent);
  --stroke-edge:color-mix(in oklab, var(--ink-50) 24%, transparent);
  --stroke-control:color-mix(in oklab, var(--ink-50) 38%, transparent); /* 3.47:1 */

  --accent:var(--brass-500); --accent-hover:var(--brass-400);
  --accent-fill:var(--brass-500);          /* 8.96:1 con --accent-on-fill */
  --accent-on-fill:var(--baize-950);
  --focus-ring:var(--brass-400);           /* 10.35:1 sobre baize-900 */

  --dissent:var(--oxblood-400); --dissent-strong:var(--oxblood-500);
  --certify:var(--aniline-400);
  --success:oklch(0.72 0.15 150); --warning:oklch(0.72 0.15 75);
  --danger:oklch(0.72 0.16 25);   --info:oklch(0.72 0.13 232);

  --agent-ceo:oklch(0.72 0.135 300); --agent-cto:oklch(0.72 0.135 185);
  --agent-cfo:oklch(0.72 0.135 265); --agent-cmo:oklch(0.72 0.135 345);
  --agent-devil:oklch(0.72 0.135 18); --agent-user:oklch(0.72 0.135 232);

  --shadow-e2:0 8px 24px -8px rgb(0 0 0 / .50);
  --shadow-e3:0 16px 40px -12px rgb(0 0 0 / .60);
  --shadow-e4:0 32px 80px -20px rgb(0 0 0 / .70);
  --lamp:color-mix(in oklab, var(--brass-400) 12%, transparent);

  --row-h:44px; --pad-y:10px; --pad-x:14px;
}

/* ═══ TEMA CLARO (opt-in con data-theme="light"; lo activa el conmutador de la
   fase 6.11 — hasta entonces este bloque es inerte y no hay flash claro) ═══ */
[data-theme="light"]{
  --surface-0:var(--paper-100); --surface-1:var(--paper-200);
  --surface-2:var(--paper-50);  --surface-3:var(--paper-50);
  --surface-inset:var(--paper-300); --surface-doc:var(--paper-50);
  --surface-code:var(--paper-50);
  --content-gutter:color-mix(in oklab, var(--graphite-900) 32%, transparent);

  --content-strong:var(--graphite-900); --content:var(--graphite-800);
  --content-muted:var(--graphite-700);  --content-quiet:var(--graphite-600);

  --stroke-highlight:color-mix(in oklab, var(--paper-50) 60%, transparent);
  --stroke-hairline:color-mix(in oklab, var(--graphite-900) 12%, transparent);
  --stroke-edge:color-mix(in oklab, var(--graphite-900) 16%, transparent);
  --stroke-control:color-mix(in oklab, var(--graphite-900) 50%, transparent); /* 3.13:1 */

  --accent:var(--brass-700);            /* el latón claro es filete, no campo */
  --accent-hover:var(--brass-600);
  --accent-fill:var(--graphite-900);    /* primario invertido: 15.59:1 */
  --accent-on-fill:var(--paper-50);
  --focus-ring:var(--brass-700);        /* 3.96:1 sobre paper-100 */

  --dissent:var(--oxblood-600); --dissent-strong:var(--oxblood-700);
  --certify:var(--aniline-600);
  --success:oklch(0.50 0.14 150); --warning:oklch(0.52 0.19 75);
  --danger:oklch(0.535 0.19 25);  --info:oklch(0.505 0.12 232);

  --agent-ceo:oklch(0.565 0.19 300); --agent-cto:oklch(0.515 0.13 185);
  --agent-cfo:oklch(0.555 0.19 265); --agent-cmo:oklch(0.570 0.19 345);
  --agent-devil:oklch(0.570 0.19 18); --agent-user:oklch(0.535 0.13 232);

  --shadow-e2:0 2px 6px -2px rgb(26 35 30 / .10);
  --shadow-e3:0 8px 20px -6px rgb(26 35 30 / .14);
  --shadow-e4:0 20px 48px -12px rgb(26 35 30 / .18);
  --lamp:transparent;
}

/* Densidad compacta */
[data-density="compact"]{ --row-h:34px; --pad-y:6px; --pad-x:10px; }
@media (pointer: coarse){ [data-density="compact"]{ --row-h:44px; --pad-y:10px; } }

/* ═══ @theme inline — genera las utilidades de Tailwind ══════════════════ */
@theme inline {
  /* superficies y contenido */
  --color-surface-0:var(--surface-0);   --color-surface-1:var(--surface-1);
  --color-surface-2:var(--surface-2);   --color-surface-3:var(--surface-3);
  --color-surface-inset:var(--surface-inset); --color-surface-doc:var(--surface-doc);
  --color-surface-code:var(--surface-code);
  --color-content-gutter:var(--content-gutter);
  --color-content-strong:var(--content-strong); --color-content:var(--content);
  --color-content-muted:var(--content-muted);   --color-content-quiet:var(--content-quiet);

  /* trazos */
  --color-stroke-hairline:var(--stroke-hairline);
  --color-stroke-edge:var(--stroke-edge);
  --color-stroke-control:var(--stroke-control);
  --color-stroke-highlight:var(--stroke-highlight);

  /* acción y semánticos */
  --color-accent:var(--accent); --color-accent-hover:var(--accent-hover);
  --color-accent-fill:var(--accent-fill); --color-accent-on-fill:var(--accent-on-fill);
  --color-dissent:var(--dissent); --color-dissent-strong:var(--dissent-strong);
  --color-certify:var(--certify);
  --color-success:var(--success); --color-warning:var(--warning);
  --color-danger:var(--danger);   --color-info:var(--info);

  /* identidades */
  --color-agent-ceo:var(--agent-ceo); --color-agent-cto:var(--agent-cto);
  --color-agent-cfo:var(--agent-cfo); --color-agent-cmo:var(--agent-cmo);
  --color-agent-devil:var(--agent-devil); --color-agent-user:var(--agent-user);

  /* escalas crudas expuestas — COMPLETAS (B2: §9 las exige por nombre;
     una escala a medias vuelve a fabricar clases muertas) */
  --color-baize-950:var(--baize-950); --color-baize-900:var(--baize-900);
  --color-baize-850:var(--baize-850); --color-baize-800:var(--baize-800);
  --color-baize-700:var(--baize-700); --color-baize-600:var(--baize-600);
  --color-ink-50:var(--ink-50);   --color-ink-100:var(--ink-100);
  --color-ink-200:var(--ink-200); --color-ink-300:var(--ink-300);
  --color-ink-400:var(--ink-400); --color-ink-500:var(--ink-500);
  --color-brass-300:var(--brass-300); --color-brass-400:var(--brass-400);
  --color-brass-500:var(--brass-500); --color-brass-600:var(--brass-600);
  --color-brass-700:var(--brass-700); --color-brass-800:var(--brass-800);
  --color-oxblood-400:var(--oxblood-400); --color-oxblood-500:var(--oxblood-500);
  --color-oxblood-600:var(--oxblood-600); --color-oxblood-700:var(--oxblood-700);
  --color-aniline-400:var(--aniline-400); --color-aniline-500:var(--aniline-500);
  --color-aniline-600:var(--aniline-600);
  --color-graphite-900:var(--graphite-900); --color-graphite-800:var(--graphite-800);
  --color-graphite-700:var(--graphite-700); --color-graphite-600:var(--graphite-600);
  --color-paper-50:var(--paper-50);   --color-paper-100:var(--paper-100);
  --color-paper-200:var(--paper-200); --color-paper-300:var(--paper-300);
  --color-paper-400:var(--paper-400);

  /* tipografía */
  --font-sans:Archivo, ui-sans-serif, system-ui, sans-serif;
  --font-serif:Literata, ui-serif, Georgia, serif;
  --font-mono:"JetBrains Mono", ui-monospace, monospace;

  --text-micro:0.75rem;   --text-micro--line-height:1.35; --text-micro--letter-spacing:0.07em;
  --text-xs:0.8333rem;    --text-xs--line-height:1.45;    --text-xs--letter-spacing:0.005em;
  --text-sm:0.875rem;     --text-sm--line-height:1.5;
  --text-base:1rem;       --text-base--line-height:1.55;
  --text-lg:1.2rem;       --text-lg--line-height:1.45;    --text-lg--letter-spacing:-0.005em;
  --text-xl:1.44rem;      --text-xl--line-height:1.3;     --text-xl--letter-spacing:-0.01em;
  --text-2xl:1.728rem;    --text-2xl--line-height:1.22;   --text-2xl--letter-spacing:-0.015em;
  --text-3xl:2.0736rem;   --text-3xl--line-height:1.15;   --text-3xl--letter-spacing:-0.02em;
  --text-4xl:2.4883rem;   --text-4xl--line-height:1.08;   --text-4xl--letter-spacing:-0.025em;
  /* display fluido, sólo marketing (§3.4): el valor de diseño es el de 390px */
  --text-display:clamp(2.4883rem, 1.867rem + 2.56vw, 3.5831rem);
  --text-display--line-height:1.12; --text-display--letter-spacing:-0.025em;
  --text-hero:clamp(3.2rem, 2.2rem + 4.2vw, 5.16rem);
  --text-hero--line-height:1.05;    --text-hero--letter-spacing:-0.03em;

  /* radios */
  --radius-xs:2px; --radius-sm:4px; --radius-md:8px; --radius-lg:12px;

  /* sombras */
  --shadow-e2:var(--shadow-e2); --shadow-e3:var(--shadow-e3); --shadow-e4:var(--shadow-e4);

  /* movimiento */
  --ease-settle:cubic-bezier(0.16, 1, 0.30, 1);
  --ease-travel:cubic-bezier(0.83, 0, 0.17, 1);
  --ease-exit:cubic-bezier(0.4, 0, 1, 1);
  --ease-impact:cubic-bezier(0.34, 1.42, 0.64, 1);
  --ease-mech:linear; /* §7.1: movimiento de máquina — faltaba en el @theme (auditoría v3) */

  /* animaciones con nombre (auditoría v3): §8.9, §9.12, §9.2 */
  --animate-pulse-ring:pulse-ring 600ms cubic-bezier(0.16, 1, 0.30, 1) 1;
  --animate-sweep:sweep 1400ms linear infinite;
  --animate-indeterminate:indeterminate 1200ms linear infinite;
  @keyframes pulse-ring{ from{ transform:scale(1); opacity:.6 } to{ transform:scale(1.8); opacity:0 } }
  @keyframes sweep{ from{ transform:translateX(-100%) } to{ transform:translateX(100%) } }
  @keyframes indeterminate{ from{ transform:translateX(-100%) scaleX(.4) } to{ transform:translateX(250%) scaleX(.4) } }

  /* NOTA: las duraciones NO van aquí. Tailwind v4 no tiene namespace
     --duration-*; viven en :root (arriba) y se consumen con
     duration-(--duration-pop). Ver §7.2. */

  /* layout */
  --spacing:4px;
  --container-measure:60ch;   /* 72,5 caracteres medidos en Literata 16px — ver §4.2 */
  --breakpoint-sm:40rem;  --breakpoint-md:48rem;  --breakpoint-lg:64rem;
  --breakpoint-xl:80rem;  --breakpoint-2xl:96rem;
}

/* ═══ BASE ═══════════════════════════════════════════════════════════════ */
@layer base{
  html{ color-scheme: dark; }
  html[data-theme="light"]{ color-scheme: light; }

  body{
    background-color: var(--surface-0);
    color: var(--content);
    font-family: var(--font-sans);
    font-size: var(--text-base);
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
    overflow-x: hidden;
    /* §8.5 El grano del paño: un pintado estático, coste cero.
       (Sin background-attachment: el grano tileado puede desplazarse con el
       contenido — imperceptible — y iOS ignora `fixed` de todas formas.) */
    background-image: url("/textures/baize-128.webp");
    background-repeat: repeat;
    background-blend-mode: overlay;
  }
  /* §8.5 La lámpara: fixed REAL — iOS ignora background-attachment: fixed */
  body::before{
    content:""; position: fixed; inset: 0; z-index: -1; pointer-events: none;
    background: radial-gradient(120% 90% at 12% -8%, var(--lamp), transparent 60%);
  }

  /* §12.2 Foco visible en todo lo accionable, sin excepción */
  :where(a, button, input, select, textarea, summary, [tabindex]):focus-visible{
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
    border-radius: var(--radius-xs);
  }

  /* Cifras tabulares donde el número cambia en su sitio (§3.3) */
  :where([data-numeric], td[data-numeric], .tnum){ font-variant-numeric: tabular-nums; }

  ::selection{ background: color-mix(in oklab, var(--accent) 30%, transparent); }

  ::-webkit-scrollbar{ width:10px; height:10px; }
  ::-webkit-scrollbar-track{ background: transparent; }
  ::-webkit-scrollbar-thumb{
    background: var(--stroke-edge);
    border: 3px solid transparent;
    background-clip: content-box;
    border-radius: 9999px;
  }
  ::-webkit-scrollbar-thumb:hover{ background: var(--stroke-control); background-clip: content-box; }
  *{ scrollbar-width: thin; scrollbar-color: var(--stroke-edge) transparent; }

  /* §7.6 Obligatorio */
  @media (prefers-reduced-motion: reduce){
    *, *::before, *::after{
      animation-duration:1ms !important; animation-iteration-count:1 !important;
      transition-duration:1ms !important; scroll-behavior:auto !important;
    }
  }
}

/* ═══ .doc-prose — tipografía de documento propia (§P1) ══════════════════ */
/* Decisión: NO se instala @tailwindcss/typography. El acta necesita las reglas
   de un libro de actas, no las de un artículo de blog, y el Preflight de
   Tailwind pone h1-h6 en font-size:inherit, ol/ul en list-style:none y los
   enlaces en color:inherit — así que sin esta capa el markdown de los agentes
   se renderiza como un muro gris. Cero dependencias nuevas. */
@layer components{
  .doc-prose{
    font-family: var(--font-serif);
    font-size: var(--text-base);
    line-height: 1.55;
    color: var(--content);
    max-inline-size: var(--container-measure);
    text-wrap: pretty;
  }
  .doc-prose > * + *{ margin-block-start: 0.75em; }

  .doc-prose :is(h1,h2,h3,h4,h5,h6){
    font-family: var(--font-serif); font-weight:600;
    color: var(--content-strong); text-wrap: balance;
    /* §4.1 más aire encima que debajo */
    margin-block: 2em 0.75em;
  }
  .doc-prose > :is(h1,h2,h3):first-child{ margin-block-start: 0; }
  .doc-prose h1{ font-size:var(--text-3xl); line-height:1.15; letter-spacing:-0.02em; }
  .doc-prose h2{ font-size:var(--text-2xl); line-height:1.22; letter-spacing:-0.015em;
                 padding-block-end:0.3em; border-block-end:1px solid var(--stroke-hairline); }
  .doc-prose h3{ font-size:var(--text-xl); line-height:1.3; }
  .doc-prose h4{ font-size:var(--text-lg); }
  .doc-prose :is(h5,h6){ font-family:var(--font-sans); font-size:var(--text-micro);
                 text-transform:uppercase; letter-spacing:0.07em; color:var(--content-muted); }

  .doc-prose :is(ul,ol){ padding-inline-start:1.4em; margin-block:0.75em; }
  .doc-prose ul{ list-style: disc; }
  .doc-prose ol{ list-style: decimal; }
  .doc-prose li{ margin-block:0.3em; }
  .doc-prose li::marker{ color: var(--accent); }
  .doc-prose li > :is(ul,ol){ margin-block:0.3em; }

  .doc-prose a{ color: var(--accent); text-decoration: underline;
                text-decoration-thickness:1px; text-underline-offset:2px; }
  .doc-prose a:hover{ color: var(--accent-hover); text-decoration-thickness:2px; }

  .doc-prose strong{ font-weight:650; color: var(--content-strong); }
  .doc-prose em{ font-style: italic; }

  .doc-prose blockquote{
    margin-block:1em; padding: 0.5em 1em;
    border-inline-start: 2px solid var(--dissent);
    background: color-mix(in oklab, var(--dissent) 8%, transparent);
    font-style: italic; color: var(--content);
  }

  .doc-prose code{
    font-family: var(--font-mono); font-size: 0.875em;
    background: var(--surface-inset); color: var(--content-strong);
    padding: 0.1em 0.35em; border-radius: var(--radius-xs);
    border: 1px solid var(--stroke-hairline);
  }
  .doc-prose pre{
    margin-block:1em; padding:1em; overflow-x:auto;
    background: var(--surface-1); border:1px solid var(--stroke-edge);
    border-radius: var(--radius-sm);
  }
  .doc-prose pre code{ background:none; border:none; padding:0; font-size:var(--text-xs); }

  .doc-prose table{
    inline-size:100%; margin-block:1em; border-collapse:collapse;
    font-family: var(--font-sans); font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }
  .doc-prose th{
    text-align:start; font-family:var(--font-sans); font-size:var(--text-micro);
    text-transform:uppercase; letter-spacing:0.07em; color:var(--content-muted);
    padding:0.5em 0.75em; border-block-end:1px solid var(--stroke-control);
  }
  .doc-prose td{ padding:0.5em 0.75em; border-block-end:1px solid var(--stroke-hairline); }

  .doc-prose hr{ margin-block:2em; border:0; border-block-start:1px solid var(--stroke-edge); }
  .doc-prose img{ max-inline-size:100%; height:auto; border-radius:var(--radius-sm);
                  border:1px solid var(--stroke-hairline); }

  /* El acta se lee siempre sobre papel, en los dos temas.
     B9 (auditoría v3): la hoja no re-colorea por elemento — RE-DECLARA EL
     CONTEXTO de variables. .doc-prose consume var(--content/--accent/...):
     sin este bloque, en tema oscuro el blockquote quedaba a 1.13:1, th/h5 a
     1.78:1, las viñetas a 2.10:1 y los enlaces a 4.17:1 sobre el papel
     (medido). Con él, todo lo que se pinte dentro de la hoja — incluido un
     chip semántico — usa la rama clara automáticamente. */
  .acta-sheet{
    background: var(--surface-doc);
    border-radius: var(--radius-lg);
    /* §6 el bisel de la hoja encuadernada */
    clip-path: polygon(6px 0, 100% 0, 100% 100%, 0 100%, 0 6px);
    box-shadow: var(--shadow-e2);

    --content: var(--graphite-800);        --content-strong: var(--graphite-900);
    --content-muted: var(--graphite-700);  --content-quiet: var(--graphite-600);
    --accent: var(--brass-800);            /* enlaces y viñetas: ≥4.5:1 sobre paper-50 */
    --accent-hover: var(--brass-700);
    --dissent: var(--oxblood-600);         --dissent-strong: var(--oxblood-700);
    --certify: var(--aniline-600);
    --surface-inset: var(--paper-300);
    --stroke-hairline: color-mix(in oklab, var(--graphite-900) 12%, transparent);
    --stroke-edge: color-mix(in oklab, var(--graphite-900) 16%, transparent);
    --stroke-control: color-mix(in oklab, var(--graphite-900) 50%, transparent);
    --success: oklch(0.50 0.14 150); --warning: oklch(0.52 0.19 75);
    --danger: oklch(0.535 0.19 25);  --info: oklch(0.505 0.12 232);

    color: var(--content);
  }
}
```

### 13.0 El SHIM de nombres del sistema viejo — deuda declarada, medida en la FASE 8

El `@theme` de `index.css` contiene además **siete alias transicionales** que este bloque no prescribe: `--color-midnight`, `--color-surface`, `--color-surface-highlight`, `--color-electric-cyan`, `--color-luxury-purple`, `--color-user-bubble`, `--color-ai-bubble` — los nombres del sistema anterior apuntados a los tokens nuevos (p. ej. `electric-cyan → var(--accent)`). Se añadieron en la fase 0 para que la app adoptara la paleta de golpe (ver el comentario `SHIM` en `index.css`), con la promesa «se retiran en la fase 6, cuando ya no queden usos». **La fase 6 no los retiró**: al cierre de la FASE 8 quedan ~210 usos en `src` (`electric-cyan` ×80 líneas, `surface-highlight` ×77, `midnight` ×26, `luxury-purple` ×25). Visualmente son la paleta nueva — el alias resuelve al token — pero son vocabulario muerto que permite escribir el sistema viejo sin que nada avise. Retirarlos (un codemod alias→token + borrar el bloque SHIM) queda como deuda para después del despliegue; mientras existan, este párrafo es su única legitimación.

### 13.1 Contrato de tokens — lo prohibido, verificable con grep

| Regla | Comprobación (debe dar 0) |
|---|---|
| Sin clases de token muertas | `grep -rE 'text-text-(primary\|secondary\|muted)\|bg-agent_\|surface-elevated' frontend/src` |
| Sin `prose-*` (no se instala el plugin) | `grep -rE '\bprose(-\|"\| )' frontend/src` |
| Sin hex ni rgb() en TSX (salvo logos OAuth) | `grep -rEn '#[0-9a-fA-F]{6}\|rgba?\(' frontend/src --include=*.tsx` |
| Sin tipografía bajo el suelo de 12px | `grep -rE 'text-\[(8\|9\|10\|11)px\]' frontend/src` |
| Sin radios fuera del sistema | `grep -rE 'rounded-\[[0-9]+px\]\|rounded-(2xl\|3xl)' frontend/src` |
| Sin `outline-none` sin sustituto | `grep -rn 'outline-none' frontend/src` ≤ nº de `focus-visible` adyacentes |
| Sin fuentes remotas | `grep -rn 'fonts.googleapis' frontend/src frontend/index.html` |
| Sin `backdrop-blur` fuera del velo e4 | `grep -rn 'backdrop-blur' frontend/src` ≤ 2 en `.tsx` *(el velo de §5 vive en dos superficies e4: el modal y el cajón móvil de §9.13 — mismo velo, mismo `blur(3px)`; medido en la FASE 8)* |
| Sin `tailwind.config.js` | `test ! -f frontend/tailwind.config.js` |
| Sin emojis como interfaz | revisión manual de `grep -rP '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]' frontend/src` — sólo `debateTemplates.ts` |
| Sin claves de token numéricas | `grep -nE '--(duration\|text\|radius\|shadow\|ease)-[0-9]+\s*:' frontend/src/index.css` |

**Repetir la verificación del bloque de tokens** (desde `frontend/`, sin ejecutar el build de la app):

```bash
node -e "const p=require('postcss'),t=require('@tailwindcss/postcss'),f=require('fs');
p([t()]).process(f.readFileSync('src/index.css','utf8'),{from:process.cwd()+'/src/index.css'})
 .then(r=>{const o=r.css;
  for(const s of ['.text-content','.bg-surface-doc','.border-stroke-control','.text-micro',
                  '.rounded-sm','.shadow-e3','.ease-settle','.max-w-measure','.doc-prose h2'])
    console.log((o.includes(s)?'ok   ':'MISS ')+s);
  console.log('dark:',/\[data-theme=dark\]/.test(o),'| reduced-motion:',/prefers-reduced-motion/.test(o),
              '| focus-visible:',/:focus-visible/.test(o),'| warnings:',r.warnings().length);});"
```

Las utilidades sólo se emiten si algo del código las usa (generación bajo demanda de v4): una `MISS` en esta prueba significa «nadie la usa todavía», no «el token está mal». La prueba autoritativa es la de §13 contra un fichero sonda que las usa todas.

> **Re-verificación (auditoría v3).** Tras las ediciones de la auditoría (default oscuro B1, escalas completas B2, `.acta-sheet` con re-mapeo B9, `--brass-800`, escala display, tokens de motion), el bloque §13 se re-extrajo de este documento y se re-compiló contra el mismo `@tailwindcss/postcss` 4.3.3: **0 warnings**, todas las escalas nuevas emiten (`.text-ink-400`, `.bg-baize-700`, `.text-graphite-800`, `.border-oxblood-500`, `.bg-aniline-500`, `.bg-paper-200`, `.text-brass-800`, `.text-display`, `.text-hero`, `.animate-pulse-ring/sweep/indeterminate`, `.ease-mech`), la variante `dark:` funciona con el default oscuro (`:where(:root:not([data-theme=light]))`), y `brass-800` mide 5.38:1 sobre `paper-50`.
