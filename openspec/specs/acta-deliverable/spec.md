# acta-deliverable

> **Source**: lanzamiento-p0 (archived 2026-08-14)
> **TDD**: ACTIVE (pytest, vitest)

## Purpose

El acta de la junta es el entregable. Este spec fija que sobrevive a una recarga
siendo acta —no un bloque de código— con sus acciones intactas, y que sus «Próximos
pasos» se extraen de los formatos que el modelo produce de verdad, con los títulos a
la vista antes de tocar el repositorio del cliente.

Verificado en el árbol fusionado: el backend escribe `<sphere_artifact type="markdown"
title="Acta de la Junta">` (`backend/app/application/board_v2.py:466`) y el frontend
busca `artifact_type="…"` (`frontend/src/store/chat/historyMapper.ts:119`);
`grep -rn 'artifact_type=' backend/app/` → 0. `frontend/src/store/useChatStore.ts` ya
no contiene el mapeo del historial (el store está partido): el único sitio es
`historyMapper.ts`.

## Requirements

| ID | Requirement | N |
|----|------------|---|
| AD-001 | El acta recuperada del historial MUST volver con su tipo real | 4 |
| AD-002 | El backend y el frontend MUST estar atados por un test a la etiqueta emitida | 2 |
| AD-003 | `parseProximosPasos` MUST reconocer los 14 formatos de la auditoría | 4 |
| AD-004 | El usuario MUST ver los títulos antes de crear issues | 3 |

### AD-001: El acta sobrevive a la recarga

Al reconstruir un mensaje del historial, el sistema MUST leer el atributo de tipo con
el nombre que el backend escribe de verdad (`type="…"`) y MUST restaurar el artefacto
con ese tipo. Un acta MUST volver como `markdown`, no como `code`.

Como consecuencia, las acciones del acta (Notion y GitHub, `ActaActions`) MUST estar
presentes tras la recarga, porque sólo se montan cuando el tipo es `markdown`.

El mismo criterio MUST aplicarse a los demás tipos que el backend emite: un
`type="mermaid"` recuperado MUST volver como diagrama, no como texto plano.

- GIVEN el historial contiene `<sphere_artifact type="markdown" title="Acta de la Junta">…</sphere_artifact>`
  WHEN se carga la sesión
  THEN el artefacto restaurado tiene `type: "markdown"`
  AND la vista del artefacto muestra los botones «Enviar a Notion» y «Crear issues en GitHub»

- GIVEN el historial trae la etiqueta con comillas escapadas (`type=\"markdown\"`)
  WHEN se carga la sesión
  THEN el tipo restaurado sigue siendo `markdown`

- GIVEN el historial contiene `<sphere_artifact type="mermaid" …>`
  WHEN se carga la sesión
  THEN el artefacto restaurado tiene `type: "mermaid"`

- **Mutación**: GIVEN se restaura el regex `artifact_type=\\?"([^\\"]+)\\?"` de
  `historyMapper.ts:119`
  WHEN se ejecuta la suite de frontend
  THEN el test del acta recuperada MUST fallar (el tipo cae al default `"code"`)

### AD-002: Backend y frontend atados por test

El nombre del atributo MUST estar fijado por un test **en cada lado**: uno de backend
que afirme que el acta generada contiene `type="markdown"`, y uno de frontend que
afirme que esa misma etiqueta se recupera como `markdown`. Un cambio en un lado sin el
otro MUST romper una suite, no producir un fallo silencioso.

- **Mutación**: GIVEN se cambia la plantilla del acta (`board_v2.py:466`) a
  `artifact_type="markdown"`
  WHEN se ejecuta la suite de backend
  THEN el test que fija la etiqueta emitida MUST fallar

- GIVEN los dos tests
  WHEN se comparan las cadenas que afirman
  THEN ambos afirman sobre `type="markdown"`, sin normalizar ni reescribir la etiqueta

### AD-003: Formatos de «Próximos pasos»

`parseProximosPasos` MUST devolver al menos un item en los 14 formatos de la
auditoría. Los siete primeros ya funcionan y MUST seguir funcionando (regresión); los
siete últimos hoy devuelven cero y MUST empezar a devolver items.

| # | Formato | Hoy |
|---|---------|-----|
| 1 | `## Próximos pasos` + bullets `-` | ✅ |
| 2 | `## **Próximos pasos**` | ✅ |
| 3 | `## 4. Próximos pasos:` | ✅ |
| 4 | `## 🚀 Próximos pasos` | ✅ |
| 5 | `## Proximos pasos` (sin tilde) | ✅ |
| 6 | Bullets `*`, `1.`, `1)` | ✅ |
| 7 | Líneas de continuación indentadas → `body` del item anterior | ✅ |
| 8 | Título en inglés: `## Next steps` | ❌ |
| 9 | `## Plan de acción` | ❌ |
| 10 | `## Acciones inmediatas` | ❌ |
| 11 | `**Próximos pasos**` sin `#` | ❌ |
| 12 | La sección escrita como tabla markdown | ❌ |
| 13 | La sección escrita como párrafo, sin bullets | ❌ |
| 14 | Sub-encabezados dentro (`### Corto plazo` / `### Largo plazo`) | ❌ |

Reglas que el parser MUST cumplir:

- El encabezado de sección MUST reconocerse por cualquiera de los títulos 1-11,
  incluida la variante en negrita sin `#`.
- La sección MUST terminar en el siguiente encabezado de nivel **igual o superior** al
  suyo. Un encabezado de nivel inferior MUST tratarse como sub-sección: sus bullets
  entran en el resultado. (Hoy corta en cualquier encabezado, `actaParser.ts:55`.)
- Si el cuerpo de la sección es una tabla, cada fila de datos —excluidas cabecera y
  separador— MUST producir un item cuyo título es su primera celda no vacía; el resto
  de celdas MUST ir al `body`.
- Si el cuerpo no tiene bullets ni tabla, cada línea no vacía que no sea encabezado
  MUST producir un item.
- Si la sección no existe, MUST devolver `[]`. El parser MUST NOT inventar items a
  partir de otra sección del acta.

Escenarios:

- GIVEN un acta con `## Próximos pasos`, luego `### Corto plazo` con 2 bullets y
  `### Largo plazo` con 1 bullet, y después `## Riesgos` con 3 bullets
  WHEN se parsea
  THEN devuelve exactamente 3 items, los de corto y largo plazo
  AND ninguno procede de `## Riesgos`

- GIVEN los 14 casos de la tabla como test parametrizado
  WHEN se parsea cada uno
  THEN los 14 devuelven al menos un item con título no vacío

- GIVEN un acta con `## Resumen` y `## Riesgos` pero sin sección de próximos pasos
  WHEN se parsea
  THEN devuelve `[]`
  AND la UI muestra el aviso de que no se encontró la sección

- **Mutación**: GIVEN se restaura el `break` incondicional ante `HEADING_RE`
  (`actaParser.ts:55`)
  WHEN se ejecuta la suite
  THEN el test de sub-encabezados MUST fallar (devuelve 0 items)

### AD-004: Previsualización de títulos antes de crear issues

Antes de crear issues en el repositorio del cliente, el usuario MUST ver **la lista
completa de títulos** tal y como se van a crear. El sistema MUST NOT ofrecer confirmar
la creación mostrando únicamente cuántos issues serán. Hoy
`ActaActions.tsx:363` dice «Se crearán N issues en el repositorio indicado.» y N es
todo lo que el usuario aprueba.

La lista MUST ser completa: si es larga MUST poder recorrerse entera, y MUST NOT
truncarse con un «y N más» sin acceso al resto. El número anunciado MUST coincidir con
el número de títulos listados.

- GIVEN un acta cuyos próximos pasos dan 6 items
  WHEN el usuario abre «Crear issues en GitHub»
  THEN se muestran los 6 títulos, literales, antes de poder confirmar
  AND el recuento anunciado dice 6

- GIVEN un acta sin próximos pasos reconocibles
  WHEN el usuario abre el diálogo
  THEN no se ofrece crear nada y se explica que no se encontró la sección

- **Mutación**: GIVEN se sustituye la lista de títulos por el texto
  «Se crearán {N} issues»
  WHEN se ejecuta la suite
  THEN el test de previsualización MUST fallar
