# artifact-viewers

> **Source**: artefactos-guardarrailes (archived 2026-08-14)
> **TDD**: ACTIVE (vitest)

## Purpose

Define **qué ve el usuario** cuando llega un artefacto (`frontend/src/`): una banda de veredicto cuando el generador ha
detectado algo, visores que aceptan los formatos que el contrato admite, y saneado obligatorio antes de insertar SVG o
markdown en el documento. El juicio lo emite el generador (`artifact-contract`); aquí sólo se presenta, nunca se
corrige ni se oculta.

## Requirements

| ID | Requirement | N |
|----|------------|---|
| AV-001 | El panel MUST mostrar una banda de veredicto única ante `type_status: "unknown"`, `content_status: "mismatch"` o `truncated: true`, sin ocultar el contenido | 5 |
| AV-002 | `DataGrid` MUST leer tablas markdown (`\|`) y valores separados por tabulador, `;` o `,`, con entrecomillado CSV | 5 |
| AV-003 | Un artefacto declarado `svg` MUST llegar al tipo `svg` del cliente y MUST sanearse con DOMPurify antes de insertarse | 4 |
| AV-004 | `MarkdownViewer` MUST aplicar `rehypeSanitize` y MUST NOT aplicar `rehypeRaw` | 4 |
| AV-005 | Los tests de `MermaidDiagram` MUST ejercer un motor que rechaza; `securityLevel` SHALL ser `'strict'` | 3 |

### AV-001: Banda de Veredicto — Un Artefacto Nunca se Pinta Mal en Silencio

El panel de artefactos MUST mostrar una banda de veredicto cuando el artefacto llegue con `type_status: "unknown"`,
`content_status: "mismatch"` o `truncated: true`.

La banda MUST ser única y compartida por todos los visores: MUST NOT duplicarse por visor.

La banda MUST NOT ocultar, recortar ni sustituir el contenido del artefacto.

Los tres casos MUST distinguirse por tono: `type_status: "unknown"` y `truncated` son **avisos de sistema**;
`content_status: "mismatch"` es un **aviso sobre el contenido**. Ninguno MUST presentarse como caída de la aplicación.

- GIVEN un artefacto con `declared_type: "markdwon"` y `type_status: "unknown"`
  WHEN el panel lo muestra
  THEN MUST pintarse con el visor de texto sin formato
  AND MUST verse un texto que nombre el tipo declarado literalmente y explique que no se reconoce
  AND el contenido MUST ser legible por completo

- GIVEN un artefacto con `truncated: true` y `reason: "size_limit"`
  WHEN el panel lo muestra
  THEN MUST verse un aviso que diga que el documento se cortó y que lo mostrado está completo hasta ese punto
  AND el botón de descarga MUST seguir funcionando y descargar lo recibido

- GIVEN un artefacto con `truncated: true` y `reason: "stream_ended"`
  WHEN el panel lo muestra
  THEN MUST verse un aviso de que la generación terminó antes de cerrar el documento

- GIVEN un artefacto `data_table` con `content_status: "mismatch"`
  WHEN el panel lo muestra
  THEN MUST verse un aviso de que se declaró como tabla y no se ha podido leer como tal
  AND el contenido MUST mostrarse tal cual llegó

- GIVEN un artefacto con `type_status: "ok"`, sin `truncated` y con `content_status` distinto de `mismatch`
  WHEN el panel lo muestra
  THEN MUST NOT aparecer ninguna banda de veredicto

### AV-002: La Tabla de Datos Lee Tablas Markdown y Valores Separados

`DataGrid` MUST aceptar tanto tablas markdown delimitadas por `|` como contenido separado por `,`, `;` o tabulador.

La detección del separador MUST ser determinista y SHALL seguir este orden de prioridad sobre la primera línea
no vacía: `|`, luego tabulador, luego `;`, luego `,`.

Cuando el separador es `,` o `;`, `DataGrid` MUST respetar el entrecomillado al estilo CSV: un campo entre comillas
dobles puede contener el separador y saltos de línea, y `""` dentro de un campo entrecomillado representa una comilla
literal.

El comportamiento actual con tablas markdown MUST NOT cambiar: escapes `\|`, celdas vacías conservadas, detección
real de la fila de guiones y relleno por la derecha siguen siendo obligatorios (regresión D35, ya cubierta por
`frontend/tests/components/DataGrid.test.tsx`).

- GIVEN un artefacto `data_table` cuyo contenido es `Director,Voto,Confianza\nCTO,SI,90\nCFO,NO,60`
  WHEN `DataGrid` lo pinta
  THEN las cabeceras MUST ser `["Director", "Voto", "Confianza"]`
  AND MUST haber dos filas de tres celdas cada una
  AND MUST NOT aparecer una única columna con la línea cruda dentro

- GIVEN un contenido cuya primera línea contiene `|` y también comas
  WHEN `DataGrid` detecta el separador
  THEN MUST elegir `|`
  AND las comas MUST permanecer dentro de sus celdas

- GIVEN un contenido CSV `Concepto,Importe\n"Coste, con impuestos",1200`
  WHEN `DataGrid` lo pinta
  THEN la primera fila MUST ser `["Coste, con impuestos", "1200"]`

- GIVEN un contenido `A;B;C\n1;2;3`
  WHEN `DataGrid` lo pinta
  THEN MUST haber tres columnas

- GIVEN un contenido de una sola línea de prosa sin separadores
  WHEN `DataGrid` lo pinta
  THEN MUST mostrarse el mensaje de tabla ilegible
  AND ese mensaje MUST NOT mencionar markdown como único formato admitido

### AV-003: El SVG Llega al Visor que lo Sanea

El almacén MUST traducir un artefacto declarado `svg` al tipo `svg` del cliente, tanto en streaming
(`store/chat/streamHandlers.ts`) como al recuperar el historial (`store/chat/historyMapper.ts`).

`SvgViewer` MUST sanear el contenido con DOMPurify bajo los perfiles `svg` y `svgFilters` antes de insertarlo en el
documento. El saneado MUST ser condición de la inserción: sin él, la inserción MUST NOT ocurrir.

- GIVEN un evento `artifact_open` con `artifact_type: "svg"`
  WHEN el manejador del stream crea el artefacto
  THEN el artefacto del almacén MUST tener `type: "svg"`
  AND MUST NOT caer al tipo `code`

- GIVEN un mensaje persistido que contiene `<sphere_artifact title="Diagrama" type="svg">…</sphere_artifact>`
  WHEN se carga el historial de la sesión
  THEN el artefacto recuperado MUST tener `type: "svg"`

- GIVEN un artefacto `svg` cuyo contenido es `<svg viewBox="0 0 10 10"><rect width="10" height="10"/><script>alert(1)</script></svg>`
  WHEN el panel lo muestra
  THEN el `rect` MUST estar en el documento
  AND MUST NOT existir ningún elemento `script` dentro del SVG

- GIVEN el escenario anterior
  WHEN se retira la llamada a DOMPurify de `SvgViewer`
  THEN el escenario anterior MUST fallar

### AV-004: El Visor del Acta Sanea por Decisión

`MarkdownViewer` MUST aplicar `rehypeSanitize`, igual que `MessageBubble` y la vista pública compartida.

`MarkdownViewer` MUST NOT aplicar `rehypeRaw` ni ningún otro plugin que reintroduzca HTML crudo.

Las tablas del acta MUST seguir renderizándose a través de `DocTable` con su contenedor desplazable y su foco de
teclado (DESIGN §9.7).

- GIVEN un acta cuyo markdown contiene `<script>window.x=1</script>`
  WHEN el visor la pinta
  THEN MUST NOT existir ningún elemento `script` en el documento

- GIVEN un acta con `[pincha](javascript:alert(1))`
  WHEN el visor la pinta
  THEN el enlace resultante MUST NOT conservar el protocolo `javascript:`

- GIVEN los dos escenarios anteriores
  WHEN se añade `rehypeRaw` a `MarkdownViewer`
  THEN al menos uno de los dos MUST fallar

- GIVEN un acta con una tabla GFM de cuatro columnas
  WHEN el visor la pinta
  THEN MUST existir una tabla con sus cuatro cabeceras
  AND MUST estar dentro de un contenedor con `role="region"` y foco de teclado

### AV-005: El Diagrama se Prueba Contra el Motor, No Contra su Doble

Los tests de `MermaidDiagram` MUST ejercer la rama de fallo con un motor que **rechaza**, y MUST NOT basar la
cobertura de la degradación en un doble que siempre resuelve.

El nivel de seguridad del motor MUST estar aserido: `securityLevel` SHALL ser `'strict'`.

La validez de un texto que el modelo escribe mal SHOULD comprobarse contra el motor real al menos una vez. Si esa
comprobación resulta inestable en jsdom, MUST declararse en el change en vez de sustituirse por un doble.

- GIVEN un motor de diagramas que rechaza el contenido
  WHEN `MermaidDiagram` intenta dibujarlo
  THEN MUST verse el panel de error con el mensaje de Mermaid inválido
  AND el texto fuente MUST seguir visible para copiarlo
  AND MUST NOT quedar en pantalla un SVG de un dibujo anterior

- GIVEN la configuración con la que se inicializa el motor
  WHEN se inspecciona
  THEN `securityLevel` MUST ser `'strict'`

- GIVEN el motor real y el texto `esto no es un diagrama`
  WHEN se le pide analizarlo
  THEN MUST rechazarlo
