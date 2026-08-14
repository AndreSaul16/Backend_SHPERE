# Spec (delta): artifact-viewers

> Capacidad **nueva**. Cubre riesgos **#8, #12, #14 (mitad visible), #15 (mitad visible), #17, #18**.
> Ámbito: `frontend/src/`. El juicio lo emite el generador (`artifact-contract`); aquí se define **qué ve el usuario**.
> RFC 2119. Escenarios en Given/When/Then.

---

## AV-001 — Banda de veredicto: un artefacto nunca se pinta mal en silencio

El panel de artefactos **MUST** mostrar una banda de veredicto cuando el artefacto llegue con `type_status: "unknown"`,
`content_status: "mismatch"` o `truncated: true`.

La banda **MUST** ser única y compartida por todos los visores: **MUST NOT** duplicarse por visor.

La banda **MUST NOT** ocultar, recortar ni sustituir el contenido del artefacto.

Los tres casos **MUST** distinguirse por tono: `type_status: "unknown"` y `truncated` son **avisos de sistema**;
`content_status: "mismatch"` es un **aviso sobre el contenido**. Ninguno **MUST** presentarse como caída de la aplicación.

#### Escenario: tipo desconocido

- **Given** un artefacto con `declared_type: "markdwon"` y `type_status: "unknown"`
- **When** el panel lo muestra
- **Then** **MUST** pintarse con el visor de texto sin formato
- **And** **MUST** verse un texto que nombre el tipo declarado literalmente y explique que no se reconoce
- **And** el contenido **MUST** ser legible por completo

#### Escenario: artefacto truncado por tamaño

- **Given** un artefacto con `truncated: true` y `reason: "size_limit"`
- **When** el panel lo muestra
- **Then** **MUST** verse un aviso que diga que el documento se cortó y que lo mostrado está completo hasta ese punto
- **And** el botón de descarga **MUST** seguir funcionando y descargar lo recibido

#### Escenario: artefacto truncado por fin de stream

- **Given** un artefacto con `truncated: true` y `reason: "stream_ended"`
- **When** el panel lo muestra
- **Then** **MUST** verse un aviso de que la generación terminó antes de cerrar el documento

#### Escenario: contenido incoherente con su tipo

- **Given** un artefacto `data_table` con `content_status: "mismatch"`
- **When** el panel lo muestra
- **Then** **MUST** verse un aviso de que se declaró como tabla y no se ha podido leer como tal
- **And** el contenido **MUST** mostrarse tal cual llegó

#### Escenario: un artefacto correcto no lleva banda

- **Given** un artefacto con `type_status: "ok"`, sin `truncated` y con `content_status` distinto de `mismatch`
- **When** el panel lo muestra
- **Then** **MUST NOT** aparecer ninguna banda de veredicto

---

## AV-002 — La tabla de datos lee tablas markdown **y** valores separados

`DataGrid` **MUST** aceptar tanto tablas markdown delimitadas por `|` como contenido separado por `,`, `;` o tabulador.

La detección del separador **MUST** ser determinista y **SHALL** seguir este orden de prioridad sobre la primera línea
no vacía: `|`, luego tabulador, luego `;`, luego `,`.

Cuando el separador es `,` o `;`, `DataGrid` **MUST** respetar el entrecomillado al estilo CSV: un campo entre comillas
dobles puede contener el separador y saltos de línea, y `""` dentro de un campo entrecomillado representa una comilla
literal.

El comportamiento actual con tablas markdown **MUST NOT** cambiar: escapes `\|`, celdas vacías conservadas, detección
real de la fila de guiones y relleno por la derecha siguen siendo obligatorios (regresión D35, ya cubierta por
`frontend/tests/components/DataGrid.test.tsx`).

#### Escenario: un CSV real se pinta con sus columnas

- **Given** un artefacto `data_table` cuyo contenido es `Director,Voto,Confianza\nCTO,SI,90\nCFO,NO,60`
- **When** `DataGrid` lo pinta
- **Then** las cabeceras **MUST** ser `["Director", "Voto", "Confianza"]`
- **And** **MUST** haber dos filas de tres celdas cada una
- **And** **MUST NOT** aparecer una única columna con la línea cruda dentro

#### Escenario: la tabla markdown sigue mandando

- **Given** un contenido cuya primera línea contiene `|` y también comas
- **When** `DataGrid` detecta el separador
- **Then** **MUST** elegir `|`
- **And** las comas **MUST** permanecer dentro de sus celdas

#### Escenario: campo entrecomillado con el separador dentro

- **Given** un contenido CSV `Concepto,Importe\n"Coste, con impuestos",1200`
- **When** `DataGrid` lo pinta
- **Then** la primera fila **MUST** ser `["Coste, con impuestos", "1200"]`

#### Escenario: punto y coma como separador

- **Given** un contenido `A;B;C\n1;2;3`
- **When** `DataGrid` lo pinta
- **Then** **MUST** haber tres columnas

#### Escenario: contenido que no es tabla en ningún formato

- **Given** un contenido de una sola línea de prosa sin separadores
- **When** `DataGrid` lo pinta
- **Then** **MUST** mostrarse el mensaje de tabla ilegible
- **And** ese mensaje **MUST NOT** mencionar markdown como único formato admitido

---

## AV-003 — El SVG llega al visor que lo sanea

El almacén **MUST** traducir un artefacto declarado `svg` al tipo `svg` del cliente, tanto en streaming
(`store/chat/streamHandlers.ts`) como al recuperar el historial (`store/chat/historyMapper.ts`).

`SvgViewer` **MUST** sanear el contenido con DOMPurify bajo los perfiles `svg` y `svgFilters` antes de insertarlo en el
documento. El saneado **MUST** ser condición de la inserción: sin él, la inserción **MUST NOT** ocurrir.

#### Escenario: el streaming produce un artefacto svg

- **Given** un evento `artifact_open` con `artifact_type: "svg"`
- **When** el manejador del stream crea el artefacto
- **Then** el artefacto del almacén **MUST** tener `type: "svg"`
- **And** **MUST NOT** caer al tipo `code`

#### Escenario: el historial recupera un artefacto svg

- **Given** un mensaje persistido que contiene `<sphere_artifact title="Diagrama" type="svg">…</sphere_artifact>`
- **When** se carga el historial de la sesión
- **Then** el artefacto recuperado **MUST** tener `type: "svg"`

#### Escenario: un script dentro del SVG no llega al documento

- **Given** un artefacto `svg` cuyo contenido es `<svg viewBox="0 0 10 10"><rect width="10" height="10"/><script>alert(1)</script></svg>`
- **When** el panel lo muestra
- **Then** el `rect` **MUST** estar en el documento
- **And** **MUST NOT** existir ningún elemento `script` dentro del SVG

#### Escenario: el saneador es la razón de que sea seguro

- **Given** el escenario anterior
- **When** se retira la llamada a DOMPurify de `SvgViewer`
- **Then** el escenario anterior **MUST** fallar

---

## AV-004 — El visor del acta sanea por decisión

`MarkdownViewer` **MUST** aplicar `rehypeSanitize`, igual que `MessageBubble` y la vista pública compartida.

`MarkdownViewer` **MUST NOT** aplicar `rehypeRaw` ni ningún otro plugin que reintroduzca HTML crudo.

Las tablas del acta **MUST** seguir renderizándose a través de `DocTable` con su contenedor desplazable y su foco de
teclado (DESIGN §9.7).

#### Escenario: HTML crudo en el acta no se ejecuta

- **Given** un acta cuyo markdown contiene `<script>window.x=1</script>`
- **When** el visor la pinta
- **Then** **MUST NOT** existir ningún elemento `script` en el documento

#### Escenario: un enlace con protocolo peligroso se neutraliza

- **Given** un acta con `[pincha](javascript:alert(1))`
- **When** el visor la pinta
- **Then** el enlace resultante **MUST NOT** conservar el protocolo `javascript:`

#### Escenario: el saneado es la razón, no la casualidad

- **Given** los dos escenarios anteriores
- **When** se añade `rehypeRaw` a `MarkdownViewer`
- **Then** al menos uno de los dos **MUST** fallar

#### Escenario: las tablas del acta siguen intactas

- **Given** un acta con una tabla GFM de cuatro columnas
- **When** el visor la pinta
- **Then** **MUST** existir una tabla con sus cuatro cabeceras
- **And** **MUST** estar dentro de un contenedor con `role="region"` y foco de teclado

---

## AV-005 — El diagrama se prueba contra el motor, no contra su doble

Los tests de `MermaidDiagram` **MUST** ejercer la rama de fallo con un motor que **rechaza**, y **MUST NOT** basar la
cobertura de la degradación en un doble que siempre resuelve.

El nivel de seguridad del motor **MUST** estar aserido: `securityLevel` **SHALL** ser `'strict'`.

La validez de un texto que el modelo escribe mal **SHOULD** comprobarse contra el motor real al menos una vez. Si esa
comprobación resulta inestable en jsdom, **MUST** declararse en el change en vez de sustituirse por un doble.

#### Escenario: un diagrama inválido degrada con dignidad

- **Given** un motor de diagramas que rechaza el contenido
- **When** `MermaidDiagram` intenta dibujarlo
- **Then** **MUST** verse el panel de error con el mensaje de Mermaid inválido
- **And** el texto fuente **MUST** seguir visible para copiarlo
- **And** **MUST NOT** quedar en pantalla un SVG de un dibujo anterior

#### Escenario: el nivel de seguridad está fijado

- **Given** la configuración con la que se inicializa el motor
- **When** se inspecciona
- **Then** `securityLevel` **MUST** ser `'strict'`

#### Escenario: el motor real rechaza lo que no es un diagrama

- **Given** el motor real y el texto `esto no es un diagrama`
- **When** se le pide analizarlo
- **Then** **MUST** rechazarlo
