# DIRECCION.md — Landing de marketing de SPHERE

**Contrato de dirección creativa, copy y coreografía. v1.0 · 2026-08-15**
Autoridad: este documento manda sobre la landing igual que `Frontend_SPHERE/DESIGN.md` manda sobre el producto. Donde este documento calle, manda DESIGN.md (rutas citadas abajo son relativas a `/home/jarvis/code/SPHERE/Frontend_SPHERE/`). El builder no improvisa copy ni paleta: implementa lo que hay aquí.

Stack fijado: **Vite 7 + TypeScript strict + vanilla TS (sin React) + Tailwind CSS v4 + GSAP 3.13+** (todos los plugins son gratuitos desde 2025). Página única, español de España, `lang="es"`.

---

## 0. Tesis y anti-patrones

### 0.1 Tesis

> **La landing no describe el producto: lo celebra en sesión.** El visitante no lee que existe una junta — la ve deliberar, ve caer los votos con su aguja de confianza, ve escribirse el acta y ve aterrizar el sello. La página entera se comporta como una sesión de SPHERE: tiene orden del día (el Canto en el borde izquierdo), tiene fases (las secciones), tiene disenso (el capítulo oxblood del voto), y termina en constancia (el acta sobre papel, sellada, con próximos pasos). El «wow futurista» no sale de neón ni de 3D: sale de que una sala capitular de paño y latón esté **viva** — coreografía de scroll milimétrica, tipografía cinética, física en las agujas y un solo momento celebratorio que se gana. Apple no enseña specs: escenifica el objeto. Aquí el objeto es una deliberación.

El arco emocional en una línea: **solo → escuchado → respaldado**. Llega alguien que decide solo; ve una mesa discutir SU tipo de problema; se va con la promesa de un acta que le respalda.

### 0.2 Anti-patrones PROHIBIDOS (herencia de DESIGN.md §0 + propios de landing)

Rechazo automático en revisión si aparece cualquiera:

1. Casi-negro + acento neón + glow. El fondo es **paño verde** (`--baize-950 #060F09`, hue 158), no negro.
2. Degradado violeta→cian, o cualquier degradado como relleno de texto/botón. (El único radial permitido es la lámpara de §8.5.)
3. Glassmorphism: `backdrop-filter`/`backdrop-blur` = **0 usos** (en la landing no hay ni modal, así que ni la excepción del velo aplica).
4. Esferas 3D, órbitas, globos — aunque el producto se llame SPHERE. Prohibido literalizar el nombre.
5. Partículas, redes de nodos, «constelaciones IA», canvas de puntitos conectados.
6. Marquee de logos de clientes, contadores de usuarios, testimonios, estrellas de reseñas, «press». **No existen y no se inventan** (PRODUCT.md «Ausencias que no se deben inventar»).
7. Scroll-jacking: **NO se usa ScrollSmoother** ni ninguna normalización de rueda. El scroll es nativo; GSAP solo lee (`scrub`) o fija (`pin`). Apple no secuestra el scroll y nosotros tampoco.
8. Texto animado token a token o letra a letra en bucle. SplitText anima **entradas una vez**; después el texto es texto.
9. Radios grandes: `rounded-2xl`+, píldoras salvo punto de estado. Radios permitidos: 2/4/8/12px (§6).
10. Emojis como interfaz o como iconos de sección.
11. Tipografías fuera del trío: Inter, Roboto, Space Grotesk, etc., prohibidas (§3). Solo **Literata + Archivo** (JetBrains Mono NI SE CARGA: la landing no enseña código).
12. Retórica sci-fi o hype vacío: «revoluciona», «impulsado por IA de última generación», «el futuro de», exclamaciones. La sobriedad ES la diferenciación.
13. Animar `height/width/top/left/margin`, colores de fondo con scrub, sombras o `filter`. Solo `transform`, `opacity`, `clip-path` y `stroke-dashoffset` (SVG).
14. Bucles decorativos. Presupuesto duro §7 de este documento: los bucles o representan un proceso de la demo en curso o no existen.

### 0.3 Decisiones de dirección (cerradas; el builder no las reabre)

- **D1 — GSAP es el motor, el presupuesto es el juez.** DESIGN.md §7.7 sugería scroll-driven CSS puro; el propietario ha mandatado GSAP explícitamente. Resolución: GSAP core + ScrollTrigger + SplitText + DrawSVGPlugin (nada más), limitado a las propiedades de 0.2.13, y el criterio de aceptación pasa a ser el RESULTADO medido de §7.7 fila 1: p95 ≥ 55 fps en móvil de gama media (CPU 6×), ≤ 6 ms de main thread por frame en scroll. Excepción a favor de CSS: el cursor del Canto usa `animation-timeline: scroll()` con fallback a ScrollTrigger — es gratis y es la firma.
- **D2 — La landing son capítulos de material.** Paño oscuro (baize) como campo por defecto; **un solo capítulo en papel claro** (la sección del Acta): el momento en que el debate se convierte en documento se siente como pasar la página. El cambio de fondo NO se anima: son secciones adyacentes con fondos estáticos distintos, separadas por el canto de la hoja (S6).
- **D3 — La demo es honesta.** La Sesión de Muestra del hero sigue §8.6: una línea de tiempo de eventos con la MISMA gramática SSE del producto, redactada a mano para la demo, reproducida por timestamps a 2×, que TERMINA (≈40 s) y deja el acta sellada + «Reproducir de nuevo». Se rotula «Demostración» en el propio componente y en el footer. **Cero telemetría agregada inventada** («N juntas celebradas» no existe → no aparece).
- **D4 — Sin JS, la página vende igual.** Todo el copy está en el HTML y es visible sin JavaScript (GSAP anima con `gsap.from`/estados iniciales aplicados por JS, jamás `opacity:0` en CSS de un bloque de contenido). La demo sin JS muestra su fotograma final estático. Criterio: con JS deshabilitado, la página es completa, legible y los CTA funcionan.
- **D5 — El lead es el registro.** No hay formulario de email en la landing (no existe backend de leads y no se finge uno). Todos los CTA apuntan a la app con UTM por posición (§3.14). El producto está vivo y regala 30 créditos: el mejor lead magnet es entrar.
- **D6 — Wordmark tipográfico + marca de sello** según §10 de DESIGN.md (spec en §5.2). Nada de escudos ni globos.
- **D7 — Un solo momento `--ease-impact`:** el aterrizaje del sello en S6. Igual que en el producto: si todo golpea, nada golpea.

---

## 1. Arquitectura de la página

Página única `index.html`. Orden y nombres canónicos (los `id` son anclas y segmentos del Canto):

| # | id | Capítulo | Material | Título de segmento en el Canto |
|---|---|---|---|---|
| S0 | `top` | Navegación (sticky) | e1 paño | — (no es segmento) |
| S1 | `hero` | Hero + Sesión de Muestra | e0 paño | «Convocatoria» |
| S2 | `problema` | Agitación del dolor | e0 paño | «El problema» |
| S3 | `procedimiento` | Cómo funciona (5 fases, pinned) | e0 paño | «El procedimiento» |
| S4 | `directores` | La mesa (5 placas) | e0 paño | «La mesa» |
| S5 | `voto` | El disenso como señal | e0 paño (acentos oxblood) | «El voto» |
| S6 | `acta` | El acta + sello | **papel claro** | «El acta» |
| S7 | `despues` | Ejecución e integraciones | e0 paño | «Después de la junta» |
| S8 | `sala` | La sala completa (6 features) | e0 paño | «La sala» |
| S9 | `precios` | Créditos, packs, top-ups | e0 paño | «Precios» |
| S10 | `preguntas` | Preguntas frecuentes | e0 paño | «Preguntas» |
| S11 | `cierre` | CTA final + footer | e0 paño | «Se levanta la sesión» |

**El Canto de la landing** (firma estructural, adaptación de §8.4): filamento de 3px pegado al borde izquierdo del viewport (dentro de `safe-area`), un segmento por sección S1–S11 con muesca en cada juntura, cursor de latón (`--brass-500`) ligado al scroll de la página. En `lg+` se ensancha a 44px al hacer hover/focus y muestra los títulos de segmento; en móvil, mantener pulsado muestra la etiqueta flotante de la sección. Cada segmento es un enlace (`<a href="#id">`) — el Canto ES la navegación de la página. `role="navigation"`, `aria-label="Orden del día de la página"`.

**Enmienda (build 2) — el Canto táctil:** el filamento visual sigue midiendo 3px; lo que crece es la zona sensible: una banda invisible de 28px desde `x=0`, sólo con puntero grueso (con ratón el Canto ya se abre a 44px al pasar por encima, y esa banda le robaría los clics a la primera columna de texto). Empieza en el borde y no más adentro porque el gesto de «atrás» del sistema es un *arrastre* desde el canto, no un toque: no compiten. Cada segmento ocupa toda su altura —con once segmentos, ~76px en una pantalla de 844px—, holgadamente por encima de los 44px de eje mayor que pide §5.6. Mantener pulsado 420ms revela la etiqueta flotante con el título de segmento de la tabla de arriba, que sigue al dedo con un `transform` y desaparece al soltar; ese toque largo lee el índice, no navega. El segmento vivo lo conmuta un `ScrollTrigger` (§3.C) y no la API nativa de intersección, porque el checklist §8.6 la busca por grep sobre `src/`.

**Enmienda (remate) — §8.15 y el primer viewport:** la línea del wireframe de §1 («hero = claim + CTA + demo visible completa en 390×844») prometía más que su contrato padre — DESIGN.md §8.6 contrata «la réplica entera visible sin scroll en 390×844», es decir, la PIEZA entera en una pantalla, no la pieza más todo el texto del hero. Con el copy cerrado de §2 es además aritméticamente imposible: el bloque de texto mide 511px antes de que la demo empiece. El criterio vigente es el del contrato padre: la Sesión de Muestra completa cabe en un pantallazo (772px medidos, techo 775) y no crece al terminar; recortar copy para cumplir la línea del wireframe habría sido la violación real. Medidas y evidencia en el README.

**Wireframe 390px (caso base y de diseño):** una columna; medida de prosa `min(60ch, 100% - 32px)`; padding lateral 16px + el Canto (3px) fuera del flujo; hero = claim + CTA + demo visible completa en 390×844 (§8.6: Palco de 4 placas arriba, 2-3 turnos, acta sellándose); secciones apiladas; placas de directores en columna (una por fila, filete de identidad a la izquierda); precios en tarjetas apiladas; FAQ en acordeón. La acción primaria del hero queda en el tercio inferior del primer viewport (§12.16).

**Escritorio (`lg+`, añade, no repara):** hero a dos columnas (claim izquierda, demo derecha); S3 pinned con el rail de fases vertical a la izquierda y las tarjetas de fase entrando a la derecha; directores en fila de 5 placas; S6 con la hoja del acta a 60ch centrada y el sello a sangre; precios en rejilla 3+2.

---

## 2. COPY FINAL

Reglas de voz (DESIGN.md §11): español peninsular, tú, presente, cero exclamaciones, cero sci-fi, los objetos por su nombre. Vocabulario canónico: junta · director · debate · fase · voto · confianza · recuento · acta · próximos pasos · crédito · intervenir · convocar · disenso. **Este copy es definitivo**: el builder lo pega tal cual, tildes y comillas latinas incluidas. Todo dato factual está respaldado en el Apéndice (§6) — si el builder cree que algo es mentira, consulta el apéndice antes de tocar nada.

### S0 — Navegación

- Marca: [símbolo] + «SPHERE» (wordmark, §5.2).
- Enlaces (solo `lg+`; en móvil los sirve el Canto): «Cómo funciona» `#procedimiento` · «Los directores» `#directores` · «El acta» `#acta` · «Precios» `#precios`.
- Botón fantasma: «Entrar» → `{APP}/login`.
- Botón primario (latón): «Empezar gratis» → CTA registro (§3.14, `utm_content=nav`).

### S1 — Hero

- Eyebrow (Archivo, micro, versalitas, `--ink-400`, tracking 0.07em): «LA JUNTA DIRECTIVA DE IA»
- H1 (`--text-hero`, Literata 600, `opsz` auto, `--ink-50`, máx 3 líneas en 390px):
  **«Deja de decidir solo.»**
- Entradilla (`--text-lg` Literata, `--ink-200`, medida 60ch):
  «SPHERE somete tu decisión a una junta de directores IA que debaten entre sí, se rebaten, votan con su nivel de confianza y firman un acta con los próximos pasos. No busca darte la razón: busca que salgas con una decisión defendible.»
- CTA primario (latón macizo, único elemento macizo del viewport): «Convoca tu primera junta» (`utm_content=hero`)
- CTA secundario (fantasma con filete): «Ver cómo funciona» → `#procedimiento`
- Microcopy bajo los CTA (Archivo `--text-xs`, `--ink-400`): «30 créditos gratis al verificar tu email · Sin tarjeta · Sin suscripción»
- **La Sesión de Muestra** (componente, §4.S1): rótulo superior (Archivo micro versalitas, `--ink-400`): «DEMOSTRACIÓN · REPRODUCIDA CON LA GRAMÁTICA DE EVENTOS REAL DEL PRODUCTO». Al terminar: botón «Reproducir de nuevo».
  - Pregunta de la sesión demo (la escribe "el usuario" de la demo): «¿Subimos el precio de 29 € a 49 € en enero?»
  - Guion de la demo (resumen; el builder lo expande a timeline respetando fases y voz de cada director, §4.S1): Oberon abre y encuadra; Nexus advierte del coste de migrar a los clientes actuales; Ledger defiende la subida con margen y LTV; Vortex avisa del riesgo de churn en la cohorte antigua; votos: Ledger SÍ·88, Oberon SÍ·74, Nexus CONDICIONAL·66, Vortex NO·71 (su aguja cruza a oxblood); síntesis de Oberon: «Sí, escalonado: nuevos clientes en enero, cartera actual en abril con aviso de 60 días»; el acta se escribe (pluma), el sello aterriza.
  - Accesibilidad: el teatro animado va `aria-hidden="true"`; lo acompaña (visually-hidden) este resumen estático: «Demostración: una junta de cuatro directores debate una subida de precio en cinco fases, vota tres a uno con niveles de confianza a la vista y cierra un acta con próximos pasos.»

### S2 — El problema

- Eyebrow: «EL PROBLEMA»
- Titular (`--text-display`, Literata 600): **«Un chat te da una respuesta. La que querías oír.»**
- Cuerpo (Literata `--text-base`, `--ink-200`, dos párrafos):
  «Pídele opinión a un único modelo y hará lo que hace siempre: completar tu entusiasmo. Te dirá que tu precio es razonable, que tu plan es sólido y que llegas en el momento perfecto. Y mañana defenderá lo contrario con la misma seguridad.»
  «Las decisiones que importan —precio, contratación, runway, lanzamiento— no necesitan un asistente que asiente. Necesitan a alguien enfrente.»
- Pieza visual: una «respuesta de chat» genérica en un bloque gris e2 (texto: «Me parece una gran idea. Tu plan es sólido y el momento no podría ser mejor. Adelante.») que al hacer scroll queda **tachada por un trazo de tinta oxblood** que se dibuja de izquierda a derecha; en el margen derecho, en Literata itálica `--oxblood-400`, la nota manuscrita del margen: «¿Y si no?»
  - `alt`/aria: el bloque es texto real; el trazo es decorativo (`aria-hidden="true"`).

### S3 — El procedimiento (pinned scrollytelling)

- Eyebrow: «EL PROCEDIMIENTO»
- Titular: **«Cinco fases. Cuatro directores. Un acta.»**
- Intro (un párrafo): «Convocas la junta con una pregunta. A partir de ahí hay procedimiento: nadie resume hasta que todos han hablado, y nadie vota sin haber sido rebatido.»
- Las cinco fases (tarjetas; número en Archivo `tnum`, nombre en versalitas, cuerpo Literata):
  1. **APERTURA** — «Cada director fija su posición inicial y su nivel de confianza.»
  2. **ANÁLISIS** — «Cada uno examina el problema desde su cartera: producto, técnica, caja y mercado.»
  3. **RÉPLICAS** — «Se rebaten entre sí. Los argumentos débiles no llegan vivos a la votación.»
  4. **EL ABOGADO DEL DIABLO** — «Némesis entra con un único encargo: romper el consenso. Opcional. Recomendado justo cuando más seguro estás.»
  5. **SÍNTESIS** — «El CEO recoge posiciones y votos y cierra el acta: recomendación, recuento y próximos pasos.»
- Nota de honestidad (Archivo `--text-sm`, `--ink-300`, con filete izquierdo de latón): «Si la junta alcanza consenso pronto, el debate se abrevia y las réplicas se saltan. Pagas deliberación, no teatro.»
- Micro-cierre (Literata itálica): «Y puedes intervenir en cualquier fase. Es tu junta.»

### S4 — La mesa

- Eyebrow: «LA MESA»
- Titular: **«Cuatro carteras. Y un quinto que viene a incomodar.»**
- Cinco placas (placa de latón con nombre en Archivo condensada versalitas + rol + cuerpo; cada una con el relleno de identidad §2.8 y filete de 2px en su color):
  - **OBERON — CEO** · color `#B290EC` — «Preside, sintetiza y firma el acta. La recomendación final lleva su nombre.»
  - **NEXUS — CTO** · `#00BFB0` — «Viabilidad técnica, deuda y plazos. Le da igual lo bonito del plan si no se puede construir.»
  - **LEDGER — CFO** · `#7BA2F9` — «Caja, márgenes y runway. Pone números donde tú pusiste esperanza.»
  - **VORTEX — CMO** · `#DF80B8` — «Mercado, posicionamiento y demanda. Pregunta quién lo compra antes de discutir cómo se construye.»
  - **NÉMESIS — ABOGADO DEL DIABLO** · `#ED7F84`, tratamiento oxblood, cita en Literata itálica — «No tiene cartera. Tiene un encargo: encontrar el fallo del consenso antes de que lo encuentre la realidad.»
- Cierre de sección: «¿Tu decisión pide otra silla —legal, médica, académica—? Crea tus propios especialistas con su base de conocimiento y consúltalos en su despacho.»

### S5 — El voto

- Eyebrow: «EL VOTO»
- Titular: **«El desacuerdo es la señal.»**
- Cuerpo: «Cada director vota SÍ, NO o CONDICIONAL, con su confianza de 0 a 100 a la vista. Una junta 4–0 te dice una cosa; una 3–1 con un NO al 85 te dice otra mucho más interesante. SPHERE no esconde el conflicto: lo mide y te lo pone delante, porque la certeza alta en contra es la información más valiosa de la mesa.»
- Pieza visual: el recuento de la demo (SÍ 2 · CONDICIONAL 1 · NO 1) con cifras de odómetro y las cuatro agujas posándose; la del NO·71 cruza a oxblood. Etiqueta bajo la pieza (micro versalitas): «CONFIANZA 0–100 · PASADO EL 70, LA CERTEZA SE SUBRAYA EN OXBLOOD».

### S6 — El acta (capítulo en papel)

Fondo de sección `--paper-100`; texto `--graphite-800/900`; enlaces y filetes en `--brass-700`/`--brass-800`. La hoja del acta es `--paper-50` con bisel de 6px a 45° en la esquina superior izquierda (§6 DESIGN.md).

- Eyebrow (`--graphite-700`): «LA CONSTANCIA»
- Titular (`--graphite-900`): **«Sales con un acta, no con una charla.»**
- Cuerpo: «Recomendación razonada, recuento de votos con la confianza de cada director y una sección de próximos pasos con su responsable. Exporta el acta, compártela por un enlace de solo lectura o convierte los próximos pasos en issues de GitHub sin salir de la sala.»
- La hoja (contenido demo, tipografía `.doc-prose`):
  - H1 del acta: «Acta — Subida de precio a 49 €»
  - Línea de recuento: «SÍ 2 · CONDICIONAL 1 · NO 1 — Recomendación: aprobar, escalonado»
  - «Próximos pasos» con 3 casillas: «① Anunciar el cambio a la cartera con 60 días de aviso — Vortex · ② Configurar el nuevo precio y el grandfathering en Stripe — Nexus · ③ Modelar el impacto en MRR de las dos cohortes — Ledger»
  - El **sello** de anilina (`--aniline-500` sobre `--paper-50`) aterriza en la cabecera. Texto del anillo: «SPHERE · JUNTA · ACTA».
- Caption bajo la hoja (Archivo `--text-xs`, `--graphite-600`): «El sello: una vez por debate, cuando el acta queda cerrada. Documento de demostración.»

### S7 — Después de la junta

- Eyebrow: «DESPUÉS DE LA JUNTA»
- Titular: **«La junta delibera. Tus directores ejecutan.»**
- Cuerpo (la honestidad es el argumento): «Durante el debate no se toca nada: la junta piensa, vota y deja cada acción asignada en el acta. Ejecutar es el segundo acto, en el despacho de cada director, con herramientas conectadas a tus cuentas: enviar el resumen por WhatsApp, llevar el acta a Notion, crear el evento en Google Calendar, abrir las issues en GitHub, publicar en LinkedIn o Instagram, o disparar tus flujos de n8n. Las acciones sensibles piden tu confirmación, y los mensajes solo salen hacia contactos que tú has autorizado.»
- Pieza visual: el telégrafo (§8.7): tres entradas que se deslizan y asientan con su check en `--success`:
  «Acta → Notion · 12:04 ✓» · «Resumen → WhatsApp (Rubén) · 12:05 ✓» · «Issue #142 → GitHub · 12:06 ✓», seguidas del contador «+3 hoy» en odómetro. Rótulo: «SECUENCIA DE DEMOSTRACIÓN».
- Lista de integraciones (chips con glifo lucide + nombre, radio 4px): WhatsApp · Notion · Google Calendar · GitHub · LinkedIn · Instagram · n8n · Jules.

### S8 — La sala completa

- Eyebrow: «LA SALA»
- Titular: **«Todo lo que una junta necesita para serlo.»**
- Seis entradas (rejilla 2 col en `sm+`; glifo de línea + título Archivo 600 + una frase Literata):
  1. **Juntas programadas** — «Deja convocada la revisión semanal: la junta se celebra sola y el acta te espera. Hasta tres a la vez.»
  2. **Compartir en solo lectura** — «Un enlace público y tu socio lee el debate y el acta sin cuenta y sin poder tocar nada.»
  3. **Especialistas propios** — «Crea directores a medida y súbeles conocimiento: hasta 20 MB de tus documentos.»
  4. **Artefactos** — «Código, tablas, diagramas y documentos nacen en su panel, no enterrados en el chat.»
  5. **Intervenir y detener** — «Corta a la junta cuando quieras, aporta el dato que falta y que sigan con él sobre la mesa.»
  6. **Razonamiento a la vista** — «Cuando un director razona antes de hablar, su razonamiento queda disponible, plegado, para quien quiera auditarlo.»

### S9 — Precios

- Eyebrow: «PRECIOS»
- Titular: **«Créditos, no suscripción.»**
- Cuerpo: «Sin cuota mensual y sin permanencia. Cada mes tienes 30 créditos gratis; cuando necesites más, los compras. Un mensaje a un director cuesta 1 crédito; una junta completa, 5 — y si el triaje decide que tu pregunta no necesita a toda la mesa, 3.»
- Tabla de costes (Archivo, `tnum`, cifras con odómetro al entrar):
  | Acción | Créditos |
  |---|---|
  | Mensaje directo a un director | 1 |
  | Junta al completo | 5 |
  | Junta reducida por el triaje | 3 |
  | Junta programada (por ejecución) | 5 |
- Packs (tres tarjetas e2; la central con filete de latón y rótulo «EL MÁS POPULAR»):
  - **Executive Pack** — 150 créditos — **39 €** — «Para seguir trabajando ese mismo día tras quedarte a medias.»
  - **Director Pack** — 500 créditos — **139 €** — «Uso recurrente durante la semana. El más popular.»
  - **Boardroom Pack** — 2.000 créditos — **550 €** — «Uso intensivo de herramientas y junta al completo.»
- Top-ups (dos tarjetas menores): **Quick Meeting** — 25 créditos — **7,99 €** — «5 interacciones extra con la junta al completo.» · **Deep Dive** — 50 créditos — **14,99 €** — «10 interacciones con la junta o una investigación con n8n.»
- Microcopy: «Los precios son los de la aplicación. Los créditos comprados se añaden a tu saldo al momento.»
- CTA de sección (fantasma): «Empieza con los 30 gratis» (`utm_content=precios`).

### S10 — Preguntas

Acordeón (`grid-template-rows 0fr→1fr`, galón 180°, §7.5). Seis entradas:

1. **«¿En qué se diferencia de preguntarle a un chat de IA?»** — «Un modelo solo no puede rebatirse a sí mismo con intereses distintos. Aquí hay cuatro carteras con criterios enfrentados, fases de réplica, un voto con confianza a la vista y un acta que deja constancia de quién dijo qué. El mecanismo es la diferencia: no una personalidad, un procedimiento.»
2. **«¿Necesito tarjeta para empezar?»** — «No. Creas la cuenta, verificas tu email y tienes 30 créditos cada mes. Los packs existen solo para cuando quieras más.»
3. **«¿La junta puede tocar mis cuentas de WhatsApp o Notion?»** — «Durante el debate, no — por diseño. Las herramientas viven en el despacho de cada director: conectas tú los servicios, las acciones sensibles piden tu confirmación explícita y los mensajes solo pueden salir hacia contactos que hayas autorizado en Ajustes.»
4. **«¿Puedo darle contexto de mi empresa?»** — «Sí. Crea especialistas propios y súbeles documentos —hasta 20 MB por cuenta—: responderán con tu contexto delante, no de memoria.»
5. **«¿Y si no estoy de acuerdo con la junta?»** — «Interviene: tu mensaje entra en el debate antes de la siguiente fase. Y si quieres presión de verdad, convoca a Némesis. La decisión sigue siendo tuya; el acta te da el mapa y el disenso.»
6. **«¿Qué pasa cuando gasto los 30 créditos del mes?»** — «Esperas al mes siguiente o recargas desde 7,99 € (25 créditos). No hay suscripción que cancelar porque no hay suscripción.»

### S11 — Cierre + footer

- Titular (`--text-hero`, centrado): **«La próxima decisión, no la tomes solo.»**
- Sub (Literata `--text-lg`): «Convoca la junta. Escucha el disenso. Llévate el acta.»
- CTA primario: «Empezar gratis — 30 créditos» (`utm_content=cierre`) · CTA fantasma: «Entrar» → `{APP}/login`.
- Junto al CTA, el sello en reposo (estático, pequeño, `--aniline-400` sobre paño: es firma, no botón).
- **Footer** (e1, filete superior hairline): símbolo + «SPHERE — la junta directiva de IA.» · Enlaces: «Abrir la aplicación» · «Crear cuenta» · «Entrar» · Nota legal mínima: «© 2026 SPHERE. Todos los derechos reservados.» · Nota de honestidad (—text-xs, `--ink-500` sobre e1): «Las sesiones que se muestran en esta página son demostraciones generadas con el producto.»

### 2.14 CTA y UTM (constante única)

```ts
// src/config.ts — ÚNICA fuente del destino; el dueño cambiará el dominio aquí.
export const APP_URL = 'https://frontendsphere-production.up.railway.app';
export const CTA_REGISTRO = (content: string) =>
  `${APP_URL}/register?utm_source=landing&utm_medium=web&utm_campaign=lanzamiento&utm_content=${content}`;
// login SIN utm: quien entra ya es usuario.
```
`utm_content` por posición: `nav`, `hero`, `precios`, `cierre`. Nada más lleva UTM.

### 2.15 SEO / metadatos / social

- `<html lang="es">`. `<title>SPHERE — La junta directiva de IA que debate, vota y firma tu decisión</title>`
- `<meta name="description" content="Somete tu decisión a una junta de directores IA: debaten en fases, se rebaten, votan con confianza 0–100 y firman un acta con próximos pasos. 30 créditos gratis al mes.">`
- OG: `og:type=website`, `og:title` = title, `og:description` = description, `og:image=/og.png` (1200×630, §5.5), `og:locale=es_ES`, `twitter:card=summary_large_image`.
- Favicon: `/favicon.svg` (la marca §5.2 sobre `--baize-950`) + `/favicon-32.png` fallback. H1 único; jerarquía h1→h2 estricta (un h2 por sección).

---

## 3. Coreografía GSAP

### 3.0 Reglas globales

- Plugins: `gsap` core, `ScrollTrigger`, `SplitText`, `DrawSVGPlugin`. Registro único en `src/motion/registro.ts`. **Prohibido** importar ScrollSmoother, Observer u otros.
- Curvas (equivalencias EXACTAS de DESIGN.md §7.1, definidas una vez con `CustomEase` NO — sin plugin extra: usar los cubic-bezier nativos de GSAP):
  - `EASE_SETTLE = "cubic-bezier(0.16,1,0.30,1)"` → en GSAP: `"expo.out"` NO — usar `gsap.parseEase("0.16,1,0.30,1")` vía `ease: "0.16,1,0.30,1"` (GSAP acepta cubic-bezier string desde 3.13 con `CustomEase`… si no está disponible sin plugin, aproximaciones fijadas: settle→`"expo.out"`, travel→`"power3.inOut"`, exit→`"power2.in"`, mech→`"none"`). El builder usa estas CUATRO aproximaciones y las declara como constantes en `src/motion/tokens.ts`; no inventa otras.
  - Física de aguja (equivale a `SPRING_NEEDLE`, sobrepasa UNA vez y se posa): `ease: "back.out(1.6)", duration: 0.7`.
  - Física de placa (`SPRING_PLATE`, sin rebote): `ease: "back.out(1.15)", duration: 0.45`.
- Duraciones: tokens de §7.2 en segundos — tap .09, pop .16, reveal .22, panel .32, scene .56. El scrub no tiene duración (la pone el dedo).
- Propiedades permitidas en tween: `x/y/scale/rotation/opacity/clipPath/drawSVG/strokeDashoffset`. Nada más (ver 0.2.13).
- **Reveals estándar de sección** (se repiten, no se reinventa por sección): eyebrow+titular con SplitText por LÍNEAS enmascaradas (`type:"lines", mask:"lines"`), `yPercent:110→0`, stagger 0.08, duración .56/settle, `once:true`, trigger `top 78%`. Cuerpo: `opacity 0→1, y:12→0`, .32/settle. Listas/tarjetas: stagger 0.04, máx 8 con stagger (las demás entran juntas, §7.5).
- `once: true` en todos los reveals de entrada (una landing que re-anima al subir parece un gif). Solo el Canto, S3 (pin) y las piezas-demo son scrub/replay.
- **Gating**: las animaciones solo se montan si `!matchMedia('(prefers-reduced-motion: reduce)').matches`. Con reduce: NINGÚN tween se crea; el CSS no esconde nada; la demo muestra el fotograma final + botón «Reproducir» que despacha los estados por corte (§8.6). Además, todo el motion espera a `document.fonts.ready` (SplitText sobre la fuente fallback parte líneas mal).
- **LCP**: el H1 se pinta con HTML+CSS. SplitText del H1 se ejecuta después de `fonts.ready` y anima DESDE el estado enmascarado en el mismo frame del split (sin frame intermedio invisible). Si JS tarda, el usuario ya está leyendo el claim: la animación simplemente no ocurre para él.

### 3.S1 Hero

1. Al cargar (timeline única, no scroll): marca — el anillo del sello se dibuja (`drawSVG:"0% → 100%"`, .32/travel), el arco interior aparece (`scale .8→1, opacity`, .16/settle); wordmark: letras con máscara, `yPercent 110→0`, stagger .024; eyebrow, H1 (líneas enmascaradas, stagger .08), entradilla, CTAs (`y 8→0 + opacity`, stagger .06). Total ≤ 1.2 s. La demo arranca cuando la timeline de entrada acaba **y** el hero está en viewport (`IntersectionObserver`), lo que llegue más tarde.
2. **Sesión de Muestra** (motor propio, no GSAP-scroll: un despachador rAF por timestamps a 2× sobre `sesionDeMuestra.ts`): turnos entran `opacity+y 6→0` .16/settle stagger 40ms; filamento de deliberación bajo la placa activa (`scaleX` por chunks); agujas al votar `rotation` con back.out(1.6)/.7 (la de Vortex cruza 70 → su arco tiñe a `--oxblood-500` por clase, sin tween de color); recuento con odómetro; pluma avanza por chunks; sello aterriza `scale 1.18→1 + rotate -1.5°→0`, .16 con `"back.out(2.2)"` (equivalente impact — ÚNICO uso, compartido con S6 que es el mismo efecto). Pausa fuera de viewport (`ScrollTrigger` `onLeave/onEnterBack` sobre el hero). Al terminar: botón «Reproducir de nuevo» (focusable). El cursor de streaming de la demo es EL bucle nº1 del presupuesto y muere al terminar la reproducción.
3. Micro-parallax del hero al hacer scroll (scrub): la demo `y: 0→-24`, el bloque de texto `y: 0→-8`. Nada más. (Profundidad sí, mareo no.)

### 3.S2 Problema

- Reveal estándar. La «respuesta de chat» entra como tarjeta (.32/settle). El **tachón**: `<path>` SVG sobre el bloque, `drawSVG 0→100%` con scrub suave (`scrub: 0.5`) entre `top 70%` y `top 35%` del bloque; la nota «¿Y si no?» aparece al completarse (`opacity+x 8→0`, .22/settle, disparada por `onLeave` del scrub). Reduced-motion: tachón ya dibujado.

### 3.S3 Procedimiento (EL set-piece de scroll)

- `lg+`: sección pinned (`pin: true`, `end: "+=2600"`, scrub 0.6). Rail vertical de 5 muescas a la izquierda (hermano del Canto, más grueso: 3px→ segmento activo 5px); el cursor de latón RECORRE el rail con el scrub (travel). Las 5 tarjetas de fase entran secuencialmente: cada una `opacity 0→1, y 28→0, scale .985→1`; la saliente se apaga a `--ink-500` y `y→-16` (exit). El número de fase grande (Archivo `tnum`, `--text-display`) rueda como odómetro al cambiar. La nota de honestidad y el micro-cierre entran tras la fase 5, dentro del mismo pin.
- Móvil (<1024px): **SIN pin** (pinear en táctil castiga). Las 5 tarjetas apiladas con reveal estándar; el rail es horizontal sticky bajo el título (3px) y su cursor avanza con scrub del bloque completo. La información es idéntica; solo cambia la escenografía (§4.3: cada breakpoint añade).
- Reduced-motion: sin pin, tarjetas visibles, rail estático completo.

### 3.S4 La mesa

- Placas: entran con stagger 0.06, `y 16→0 + opacity`, back.out(1.15)/.45 (física de placa). Al entrar cada placa, su **aguja** hace un sweep de presentación 0→(74/66/88/71/—) con back.out(1.6)/.7 — la de Némesis no tiene aguja: tiene un filete oxblood que se dibuja (drawSVG .22).
- Hover (any-hover): la placa alza `y -2`, su relleno de identidad pasa de 12%→16% por clase (sin tween de color), filete 2→3px. Focus-visible: mismo tratamiento (P5).

### 3.S5 El voto

- El recuento entra con odómetros (cada cifra rueda una vez al entrar en viewport, .16/settle). Las 4 agujas se posan escalonadas (.12 entre ellas). La aguja NO·71: al cruzar 70 su arco gana la clase oxblood y el subrayado de latón del odómetro parpadea una vez (`opacity 1→0`, .22). `once:true`.

### 3.S6 El acta (papel)

- La hoja entra como documento: `clip-path: inset(0 0 100% 0)` → `inset(0 0 0% 0)` con scrub corto (top 80%→top 45%) — la hoja «se desenrolla» al llegar; las casillas de próximos pasos se marcan una a una (stroke del check con `strokeDashoffset`, .16 cada, stagger .12, disparadas al fijarse la hoja).
- **El sello**: cuando la hoja termina de fijarse (`onLeave` del scrub de la hoja), aterriza una vez: `scale 1.18→1, rotate -1.5°→0, opacity 0→1`, .16 + `"back.out(2.2)"`. ÚNICO momento impact de la página junto con su gemelo de la demo (D7). Reduced-motion: sello ya asentado.

### 3.S7 Después de la junta

- Telégrafo: las 3 entradas se deslizan `x 24→0 + opacity` .16/settle, escalonadas .5 s entre sí al entrar la sección (una vez); su check se dibuja (strokeDashoffset .16); el contador «+3 hoy» rueda con odómetro al asentarse la tercera. Chips de integraciones: reveal estándar con stagger 0.04.

### 3.S8 / S9 / S10

- S8: reveal estándar por celdas (stagger 0.04, cap 8).
- S9: tabla de costes — las cifras ruedan con odómetro al entrar (una vez); tarjetas de packs entran con stagger; la central («EL MÁS POPULAR») entra la última y su filete de latón se dibuja (drawSVG del rect del borde, .32/travel).
- S10: acordeón `grid-template-rows 0fr→1fr` + opacity del contenido (.22/settle), galón rota 180° — esto es CSS/clase, NO GSAP (estado, no coreografía). Reveal estándar de las preguntas.

### 3.S11 Cierre

- Titular con el reveal del hero (SplitText líneas). El sello en reposo NO anima (ya celebró en S6; aquí es firma).

### 3.C El Canto (global)

- Cursor: `animation-timeline: scroll()` en CSS (`@supports`); fallback: un `quickSetter` de GSAP sobre `scaleY` del cursor dentro de un `ScrollTrigger scrub` del `body`. Segmento activo: `IntersectionObserver` conmuta clase (engrosa 3→5px y pasa de `--ink-500` a `--brass-500`). Click/tap: `scrollIntoView({behavior:'smooth'})` (auto con reduce). Coste: 1 transform compositor.

### 3.P Presupuesto de motion de la página (vinculante, §7.4/§7.7 fila «Landing»)

- **Bucles simultáneos: ≤ 2 en móvil** de los 4 permitidos (1 = cursor de streaming de la demo mientras reproduce; 2 = barra indeterminada del telégrafo demo si está en vuelo). En reposo (demo terminada): **0 bucles**. Escritorio idéntico (no usamos el extra).
- Tweens tipo muelle simultáneos: ≤ 2 (agujas escalonadas cuentan 1 cada una: el stagger las separa).
- Capas compuestas: ≤ 10 móvil / 14 escritorio (contar con Layer borders).
- Main thread por frame en scroll: ≤ 6 ms en CPU 6×; p95 ≥ 55 fps en 10 s de scroll con pulgar.
- `will-change` solo lo pone GSAP (`force3D` por defecto); prohibido en CSS manual.

---

## 4. Piezas y datos

### 4.1 `sesionDeMuestra.ts`

Array tipado de eventos `{ t: number; tipo: 'fase'|'turno'|'chunk'|'voto'|'recuento'|'acta_chunk'|'acta_cierre'|'tool'; ... }` siguiendo la gramática SSE del producto (onBoardPhase/Vote/Consensus, onArtifactChunk… — PRODUCT.md:113-115). Duración total reproducida ≈ 40 s a 2×. Contenido: el guion de S1 (§2.S1) desarrollado con la voz de cada director (Nexus técnico y seco; Ledger numérico; Vortex de mercado; Oberon presidencial). Los textos de los turnos son cortos (≤ 2 frases por chunk visible). Este fichero es CONTENIDO editorial: el builder lo redacta siguiendo el guion y las voces, y el revisor lo lee entero.

### 4.2 Componentes de firma reutilizados (reimplementación vanilla, misma receta)

- **Aguja** (§8.2): SVG 40×24 (32×20 en placas), arco stroke 2 butt + aguja `<line>` rotada; >70 → segundo path oxblood. `role="meter" aria-valuenow`.
- **Odómetro** (§8.12): máscara 1em, dígito saliente en pseudo-elemento `attr()`, texto real = solo cifra vigente, subrayado latón como elemento remontable, **cero timers**.
- **Placa** (§3.3): Archivo `wdth 78`, micro versalitas 600, texto `--baize-950` sobre `--brass-600`.
- **Relleno de identidad** (§2.8): `color-mix(in oklab, var(--agent) 12%, var(--baize-900))` (10% + paper-100 en S6 si aplica).
- **Filete/burbujas**: `border-inline-start` 2px color de agente; SIN pico de bocadillo (§6).
- **Sello** (§8.3): activo SVG pre-horneado (§5.4), máscara estática; jamás `feTurbulence` en runtime.
- **Grano del paño** (§8.5): tile WebP 128×128 ≤ 3 KB, opacidad efectiva 4% + lámpara `radial-gradient` cálido 12% desde `12% -8%` en pseudo-elemento `position:fixed`.

### 4.3 Tokens

Copiar de DESIGN.md §13 el bloque `:root` de escalas crudas (baize/ink/paper/graphite/brass/oxblood/aniline + duraciones) y de §3.4 la escala display:
`--text-display: clamp(2.4883rem, 1.867rem + 2.56vw, 3.5831rem)` (lh 1.12, tracking -0.025em) · `--text-hero: clamp(3.2rem, 2.2rem + 4.2vw, 5.16rem)` (lh 1.05, tracking -0.03em). Easings en `@theme` (`--ease-settle` etc.), duraciones en `:root` (§7.2, el namespace `--duration-*` NO existe en Tailwind v4). Colores de agente: `--agent-ceo:#B290EC; --agent-cto:#00BFB0; --agent-cfo:#7BA2F9; --agent-cmo:#DF80B8; --agent-devil:#ED7F84;`. Solo tema oscuro global + capítulo papel local (S6): NO hay conmutador de tema en la landing.

---

## 5. Sistema visual propio de la landing

### 5.1 Botones

- Primario sobre paño: relleno `--brass-500`, texto `--baize-950` (8.96:1), radio 4px, hover `--brass-400` (.09s), press `scale .985`. Sin sombra, sin degradado: es el único macizo.
- Primario sobre papel (S6 si lo hubiera — no hay CTA en S6; regla por si acaso): relleno `--graphite-900`, texto `--paper-50`, filete `--brass-600` (§2.6: el latón en claro es filete, nunca campo).
- Fantasma: filete `--stroke-control`, texto `--ink-100`; hover: filete `--brass-400`.

### 5.2 Marca y wordmark (activo nuevo; concepto sancionado por DESIGN.md §10)

- **Símbolo «el sello de la mesa»**: SVG monocromo de UNA forma compuesta: anillo de sello (circunferencia, stroke 1.5 a 24px de caja) con un **arco de mesa** dentro (arco inferior de ~150° con una muesca central: la mesa vista en planta con el asiento que preside). Legible a 16px. Color: `--brass-500` sobre paño, `--graphite-900` sobre papel. Es favicon y og-mark. Prohibido: esfera con meridianos, globo, átomo.
- **Wordmark**: «SPHERE» en Archivo, mayúsculas, `wght 600`, `wdth 110`, `tracking 0.14em`, color `--ink-50` (nav) / `--ink-300` (footer). Es una placa grabada: generoso de aire, nunca condensado en la marca (la condensada 78 es de las placas de asiento).
- Lockup: símbolo + wordmark separados por 12px, alineados a la óptica del anillo.

### 5.3 Grano y lámpara

Generar el tile de grano (128×128, ruido monocromo suave, WebP ≤ 3 KB) en build o a mano; NUNCA un PNG de 1 MB de «textura de tela» de stock.

### 5.4 El sello (activo)

Un SVG pre-horneado (≤ 4 KB): anillo con texto circular «SPHERE · JUNTA · ACTA», borde con sangrado de tinta YA horneado (irregularidades en el path, no filtros), `--aniline-500`. Dos usos: demo del hero y S6 (mismo activo, tamaños 72/96px) + versión mini en reposo en S11.

### 5.5 og.png

1200×630. Composición: fondo `--baize-950` con grano+lámpara; a la izquierda el claim «Deja de decidir solo.» en Literata 600 (~88px, `--ink-50`) con el lockup arriba; a la derecha la esquina de la hoja del acta en papel con el sello de anilina y el recuento «SÍ 2 · COND 1 · NO 1». Texto legible a miniatura de LinkedIn. Generar en build (SVG plantilla → PNG con `sharp` o `resvg`; si el entorno no lo permite, exportar una vez a mano y commitear el PNG — documentar cuál de las dos vías se usó en el README).

### 5.6 Accesibilidad (además de §12 de DESIGN.md, que aplica entero)

Skip-link al contenido; landmarks (`header/nav/main/footer`); un `h1`; foco visible `2px --brass-400 offset 2px` en TODO accionable; áreas táctiles ≥ 44px y separación ≥ 8px; el Canto operable por teclado (enlaces reales); la demo `aria-hidden` con resumen alternativo (§2.S1); acordeón con `aria-expanded/aria-controls`; contraste: los pares de este documento ya cumplen (están calculados en DESIGN.md §2); cero texto bajo 12px; `prefers-reduced-motion` según §3.0.

---

## 6. Apéndice factual — claim → evidencia (rutas relativas a `Frontend_SPHERE/`)

| Claim del copy | Evidencia |
|---|---|
| 30 créditos gratis al mes al verificar el email | `backend/app/core/config.py:145-151` («free»: 30, «créditos mensuales»); `backend/app/core/auth.py:245-251` (grant al verificar) |
| Sin tarjeta al registrarse | Registro = Firebase Auth (email/Google/GitHub/Microsoft), sin paso de pago: `frontend/src/contexts/AuthContext.tsx`; Stripe solo en checkout de billing (`backend/app/infrastructure/stripe_client.py:50-58`) |
| Mensaje 1 crédito · junta 5 · reducida 3 | `backend/app/application/credit_manager.py:36-40,227-229` (BOARD_MEETING_COST=5, BOARD_REDUCED_COST=3, chat=1) |
| Fases apertura→análisis→réplicas→diablo→síntesis | `PRODUCT.md:47-49` (tipo `BoardPhase`, `frontend/src/types/index.ts`) |
| Consenso temprano abrevia el debate | `PRODUCT.md:53-56` (`tally`, `unanimous`, `earlyExit`) |
| Intervenir en mitad del debate | `PRODUCT.md:58-59` (`chatService.intervene`) |
| Voto SÍ/NO/CONDICIONAL con confianza 0-100 | `PRODUCT.md:34-36`; voto persistido `additional_kwargs.board_vote` (`PRODUCT.md:52`) |
| Directores y colores | Nombres: `PRODUCT.md:135-140`; colores normativos: `DESIGN.md §2.8` (tabla) |
| Némesis opcional, rompe consenso | `PRODUCT.md:34-35,57` |
| Herramientas SOLO en el chat individual, nunca durante la junta; el acta asigna responsables | `PRODUCT.md:76-85` («En la junta no se ejecuta ninguna herramienta») |
| Integraciones: WhatsApp, Notion, Google Calendar, GitHub (issues desde el acta), LinkedIn, Instagram, n8n, Jules | `PRODUCT.md:76-80` |
| Confirmación explícita en acciones sensibles | `backend/app/infrastructure/tools/confirmation.py` (gate de confirmación + pre-check de autorización) |
| WhatsApp solo a contactos autorizados en Ajustes | `backend/app/core/contacts_service.py` (whitelist `is_authorized`) |
| Juntas programadas, máx 3, 5 créditos/ejecución | `backend/app/presentation/api/v1/scheduled_boards.py:4` |
| Compartir en solo lectura por enlace público | `PRODUCT.md:72-74` (`/share/:token`) |
| Especialistas propios + subir documentos, 20 MB | `PRODUCT.md:86-88`; cuota: `backend/app/core/plan_limits.py:20-24` (20 MB) |
| Artefactos: código/markdown/mermaid/tablas/SVG | `PRODUCT.md:89-90` |
| Razonamiento plegado visible | `PRODUCT.md:116-117` (`reasoning_content`) |
| Packs: Executive 150/39 € · Director 500/139 € (popular) · Boardroom 2.000/550 € | `frontend/src/pages/BillingPage.tsx:14-17` |
| Top-ups: Quick Meeting 25/7,99 € · Deep Dive 50/14,99 € | `frontend/src/pages/BillingPage.tsx:21-23` |
| «Créditos, no suscripción», nada que cancelar | `backend/app/core/plan_limits.py:13-17` («Modelo solo-créditos… no hay tiers») |
| Créditos comprados se añaden al momento | Webhook de Stripe acredita el wallet (`backend/app/presentation/api/v1/billing.py`, ciclo grant-huérfano auditado) |

**No verificado → esquivado así:** caducidad de los créditos comprados (no encontrada regla de expiración; el copy NO dice «no caducan» — la frase de S9 lo evita); cifras agregadas de uso (no existen → no aparecen); «grandfathering en Stripe» solo existe DENTRO del guion demo como decisión de la junta ficticia, no como feature de SPHERE.

---

## 7. Presupuestos de rendimiento

- **LCP < 2.5 s** en móvil 4G medio: LCP = el H1 (texto HTML, fuentes preload + `font-display: swap` + `size-adjust`). La demo se hidrata en `requestIdleCallback` tras `fonts.ready`.
- **CLS < 0.1**: alturas reservadas para demo y hoja del acta (`aspect-ratio`/`min-height`); las máscaras de SplitText no reflowan (líneas ya medidas).
- **INP < 200 ms**; TBT Lighthouse móvil < 200 ms.
- **Peso**: JS total ≤ 90 KB gzip (gsap core ~24 + ScrollTrigger ~14 + SplitText ~9 + DrawSVG ~3 + app ≤ 40); CSS ≤ 30 KB gz; fuentes 3 ficheros ≈ 335 KB (presupuesto ya aceptado; JetBrains Mono NO se incluye); grano ≤ 3 KB; sello ≤ 4 KB; og.png fuera del critical path. **Primera carga total ≤ 550 KB** transferidos.
- Lighthouse móvil: Performance ≥ 90 · Accesibilidad ≥ 95 · Best Practices ≥ 95 · SEO ≥ 95.

---

## 8. Checklist de aceptación (auditable)

Mecánicos (deben dar **0**, ejecutados sobre `src/` + `index.html` de la landing):
1. `grep -riE "backdrop-(blur|filter)"` = 0
2. `grep -riE "rounded-(2xl|3xl)|rounded-\[[0-9]+px\]"` = 0
3. `grep -rE "text-\[(8|9|10|11)px\]"` = 0
4. `grep -riE "fonts\.googleapis|@import url\(http"` = 0
5. `grep -riE "\b(inter|roboto|poppins|space grotesk|jakarta)\b" index.html src/styles` = 0 (fuentes)
6. `grep -riE "scrollsmoother|observer" src` = 0 (imports GSAP prohibidos)
7. `grep -riE "linear-gradient" src index.html` = 0 (el único gradiente es el `radial-gradient` de la lámpara)
8. `grep -riE "tween.*(width|height|top:|left:|margin)" src/motion` = 0 — y revisión manual: ningún tween anima propiedades fuera de 0.2.13
9. `grep -c 'lang="es"' index.html` = 1 · `grep -c "<h1" index.html` = 1
10. `grep -riE "testimoni|clientes felices|usuarios activos|★|4\.[0-9]/5" src index.html` = 0
11. Cada CTA de registro lleva `utm_content` ∈ {nav, hero, precios, cierre} y usa `CTA_REGISTRO()` — grep de `register?` fuera de `config.ts` = 0
12. `tsc --noEmit` limpio · ESLint limpio · 0 dependencias más allá de gsap (+dev tooling)

Manuales/instrumentados:
13. Con JS deshabilitado: todo el copy visible, CTAs navegan, demo muestra fotograma final.
14. `prefers-reduced-motion: reduce`: cero tweens creados (comprobar en la pestaña Animations), demo con botón «Reproducir», nada oculto.
15. 390×844: sin scroll horizontal; H1 ≤ 3 líneas; demo completa visible en el primer viewport con el CTA en el tercio inferior; Canto operable.
16. Bucles en Animations panel: ≤ 2 durante la demo, **0** con la demo terminada y la página en reposo.
17. CPU 6×: 10 s de scroll → p95 ≥ 55 fps, sin frames > 16.6 ms por estilo/layout.
18. Lighthouse móvil ≥ 90/95/95/95; LCP < 2.5 s; CLS < 0.1.
19. Teclado: tab recorre nav → CTAs → Canto → acordeón → footer con foco visible siempre; skip-link funciona.
20. El copy renderizado coincide con §2 de este documento (diff manual sección a sección; cero ediciones no autorizadas).
21. El sello usa `--aniline-500` y aterriza UNA vez por superficie (demo y S6); ningún otro elemento usa anilina.
22. Fondo del body = `--baize-950` con grano+lámpara; S6 = `--paper-100`; ningún negro puro `#000`.

---

*Fin del contrato. Dudas de implementación que este documento no resuelva: se resuelven a favor de DESIGN.md; si tampoco, a favor de la sobriedad.*
