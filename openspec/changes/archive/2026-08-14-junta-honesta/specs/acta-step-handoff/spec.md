# acta-step-handoff

> **Source**: junta-honesta (F0b) · **TDD**: ACTIVA (vitest)
> **Alcance**: `frontend/src/utils/directorDelPaso.ts` (nuevo), `ActaActions.tsx`, `BoardActivationModal.tsx`, `ChatPanel.tsx`, `agentCatalog.ts`, `PRODUCT.md`.
> **Precedencia**: `lanzamiento-p0` antes (reescribe `actaParser.ts` y el modal de GitHub; zonas distintas). **`tools-seguridad` C3 antes de publicar cualquier copy que diga «bajo tu confirmación»**: hoy solo 5 herramientas consultan el gate.

## Purpose

La junta delibera; la ejecución vive en el chat del director. Esta capacidad convierte cada próximo paso del acta en una apertura del chat de su responsable con el texto **precargado y sin enviar** — sin ruta nueva, sin backend, sin crédito automático.

## Requirements

| ID | Requisito | Esc. |
|----|-----------|------|
| ASH-001 | Cada próximo paso MUST ofrecer abrir el chat de su director con el texto precargado y **no enviado** | 3 |
| ASH-002 | `directorDelPaso` MUST resolver rol o nombre como palabra completa, sin distinguir mayúsculas ni tildes; gana la primera aparición; `null` si no hay | 6 |
| ASH-003 | Un paso sin responsable MUST caer en Oberon (CEO) | 2 |
| ASH-004 | Un paso que nombra a Némesis MUST caer en Oberon (CEO): no es canal de ejecución | 2 |
| ASH-005 | El usuario MUST poder editar el texto antes de enviar; abrir el chat MUST NOT consumir crédito | 2 |
| ASH-006 | Si falla la creación de sesión, la fila MUST mostrar error inline y MUST NOT navegar | 1 |
| ASH-007 | El copy publicado MUST coincidir con los textos fijados y MUST NOT contener las afirmaciones prohibidas | 3 |

### ASH-001: Abrir el paso con su director

- GIVEN un acta con el paso «Nexus (CTO): migrar el pipeline de despliegue»
  WHEN el usuario pulsa «Ejecutar con Nexus»
  THEN se crea una sesión nueva con el agente `cto-1`
  AND se navega a `/chat/{sessionId}` llevando el texto en el `state` de navegación (nunca en la URL ni en query params)

- GIVEN esa navegación
  WHEN el chat monta
  THEN el texto queda **en el compositor, sin enviar**, y el `state` de navegación se limpia para que volver atrás no lo re-pegue
  AND el texto contiene el título del paso, su cuerpo y una línea de procedencia del acta

- **Mutación** — GIVEN un botón que además dispara el envío
  WHEN corre el test THEN FALLA: se observa una llamada de envío que no debería existir

### ASH-002: Resolver el director del paso

- GIVEN «Nexus (CTO): migrar…» WHEN se resuelve THEN devuelve CTO
- GIVEN «**CFO** — revisar el runway» WHEN se resuelve THEN devuelve CFO
- GIVEN «Responsable: CMO» WHEN se resuelve THEN devuelve CMO
- GIVEN «Revisar el informe» (sin rol ni nombre) WHEN se resuelve THEN devuelve `null`
- GIVEN un texto donde `CTO` aparece dentro de otra palabra (p. ej. `CTOS`, `director`)
  WHEN se resuelve THEN NO cuenta como coincidencia (palabra completa)
- GIVEN un texto con dos responsables, CMO primero y CFO después
  WHEN se resuelve THEN gana la primera aparición (CMO)

### ASH-003: Paso sin responsable

- GIVEN un paso cuyo `directorDelPaso` devuelve `null`
  WHEN se pinta la fila
  THEN el botón dice «Ejecutar con Oberon (CEO)» y su `title`/`aria-label` explica por qué (es quien delega)
  AND la fila sigue funcionando: el botón de GitHub y la casilla de hecho no se rompen

- **Mutación** — GIVEN una implementación que oculta el botón cuando no hay responsable
  WHEN corre el test THEN FALLA

### ASH-004: Némesis no es un canal de ejecución

- GIVEN el paso «Némesis: cuestionar la proyección de ingresos»
  WHEN se resuelve el destino
  THEN es Oberon (CEO), **no** `devil-1`

- GIVEN cualquier paso
  WHEN se resuelve el destino
  THEN el `agentId` resultante pertenece siempre a `MOCK_AGENTS` (`agentCatalog.ts:78-135`); `BOARD_DEVIL_AGENT` nunca es destino

### ASH-005: El crédito lo dispara el usuario

- GIVEN el usuario pulsa «Ejecutar con {director}»
  WHEN se abre el chat con el texto precargado
  THEN no se ha realizado ninguna llamada de stream ni descuento de crédito

- GIVEN el texto precargado en el compositor
  WHEN el usuario lo edita y pulsa enviar
  THEN se envía el texto **editado**, no el original

### ASH-006: Fallo al crear la sesión

- GIVEN `createNewSession` rechaza con `SessionError` (`sessionsSlice.ts:166-170`)
  WHEN el usuario pulsa el botón
  THEN la fila muestra el error inline, no se navega, y el resto de la lista sigue operativa

### ASH-007: Copy de la Junta — guarda de regresión

**Esto es una guarda de regresión de copy y NO sustituye a la cobertura del gate de confirmación** (`tools-seguridad` C3). Comprobar que un texto está en pantalla no comprueba que el sistema haga lo que el texto promete.

Textos auditables, literales:

1. `BoardActivationModal.tsx`: «La junta **delibera**: no consulta datos en vivo ni ejecuta acciones. Cada próximo paso del acta se abre con un clic en el chat de su director, y lo lanzas tú.»
2. `ChatPanel.tsx` (bienvenida): «Deliberan y firman el acta; cada próximo paso se abre en el chat de su director, y lo lanzas tú.»
3. `agentCatalog.ts:13` (saludo del canal Junta): «Bienvenido a la **Junta Directiva**. Tus directores debaten en fases, votan y el CEO firma el acta. Aquí se decide: cada próximo paso se ejecuta después, en el chat de su director.»
4. `ActaActions.tsx`, bajo «Próximos pasos»: «La junta decide; el paso lo lanzas tú con su director.» · Botón: «Ejecutar con {Nombre}» · `aria-label`: «Abrir el chat de {Nombre} ({ROL}) con este paso preparado».
5. `PRODUCT.md`: «…disponibles en el **chat individual** de cada director. **En la junta no se ejecuta ninguna herramienta**: la junta delibera y el acta deja cada acción con su responsable.»

Afirmaciones **prohibidas**: «la junta ejecuta» · «28 integraciones» · «los directores consultan datos en tiempo real» · «tus agentes actúan por ti mientras debaten».

- GIVEN el modal de activación de la junta renderizado
  WHEN se lee su texto visible
  THEN contiene el texto 1 y ninguna de las afirmaciones prohibidas

- GIVEN el acta renderizada con al menos un próximo paso
  WHEN se lee el texto visible del bloque «Próximos pasos»
  THEN contiene el texto 4 y el `aria-label` del botón nombra al director y su rol

- **Mutación** — GIVEN se reintroduce «tu junta con 28 integraciones» en cualquiera de las superficies cubiertas
  WHEN corre el test THEN FALLA

**Riesgo declarado de test fantasma**: si estos escenarios se escriben afirmando una constante exportada contra sí misma, o mirando solo el fichero donde vive el literal, **no pueden fallar nunca**. Se escriben **sobre el texto renderizado** del componente (`getByText`/`textContent`), no sobre la constante.

## Lo que NO queda cubierto

| # | No cubierto | Por qué |
|---|-------------|---------|
| 1 | Que el copy sea verdad | ASH-007 comprueba presencia de texto, no comportamiento del sistema. El gate real es C3 de `tools-seguridad` |
| 2 | Sesiones huérfanas | Cada clic crea una sesión; declarado y borrable desde el sidebar |
| 3 | Calidad del texto precargado | Depende del parser de `lanzamiento-p0`: mejor parser, mejor `body`; no se garantiza aquí |
