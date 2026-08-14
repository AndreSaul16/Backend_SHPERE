# tool-error-remedy

> **Source**: pulido-lanzamiento (archived 2026-08-14)
> **TDD**: ACTIVE (pytest, vitest)

## Purpose

Un fallo de herramienta viaja con **lo que el usuario puede hacer al respecto**, decidido en el
backend y transportado hasta la tarjeta, de modo que nunca se ofrece una acción que no puede
funcionar. Esta capacidad **extiende, no reemplaza, `tool-result-integrity`**: TRI-001 sigue
definiendo los tres estados de una herramienta y sigue siendo el único punto de clasificación;
aquí sólo se dice qué se ofrece **dentro** del estado «fallo» —el estado `confirmation_required` no
entra y no se toca—. Alcance: `_classify_tool_output` y el evento `tool_error` de `stream.py`;
`api.ts`, `streamHandlers.ts`, `parseMessageParts.ts` y `ToolExecutionCard.tsx`; y los códigos de
error de `shared_tools.py`, `oauth_tools.py` y `ceo_tools.py`. Invariante rector: **la tarjeta no
ofrece una acción que no puede funcionar**.

## Requirements

| ID | Requirement | N |
|----|------------|---|
| TER-001 | La falta de contexto de usuario MUST emitirse siempre como `user_context_missing`; el deletreo `missing_user_context` MUST NOT existir en `backend/` | 3 |
| TER-002 | Todo evento `tool_error` MUST incluir `remedy` con exactamente uno de `retry`, `connect`, `none`, `whitelist`, decidido en `_classify_tool_output`; el cliente MUST NOT derivarlo por heurística | 3 |
| TER-003 | `retry` MUST ser el valor por omisión y la lista MUST ser de códigos **no** reintentables; MUST NOT invertirse a una lista de reintentables | 3 |
| TER-004 | Con remedio `connect`, `none` o `whitelist` la tarjeta MUST NOT renderizar «Reintentar»; con `connect` MUST enlazar a Ajustes → Conexiones y con `whitelist` a Ajustes → Contactos | 5 |
| TER-005 | El marcador de fallo MUST llevar el remedio y MUST colocarlo antes del mensaje; el escritor MUST emitir siempre los tres campos | 4 |

### TER-001: Un concepto de error tiene exactamente un código

La falta de contexto de usuario **MUST** emitirse siempre con el código `user_context_missing`, el
que exige ATI-004. El deletreo `missing_user_context` **MUST NOT** existir en `backend/`.

Es un renombrado de contrato **interno**: ningún cliente distingue códigos hoy. Un test que asserte
el literal antiguo se actualiza, y el cambio **MUST** dejar escrito que es un renombrado y no un
cambio de conducta.

- GIVEN el árbol tras el cambio
  WHEN se busca `missing_user_context` en `backend/`
  THEN no hay ninguna aparición
  AND las herramientas de `shared_tools.py` y `oauth_tools.py` emiten `user_context_missing`

- GIVEN que hoy `frontend/src` no contiene ninguno de los dos literales
  WHEN se aplica el renombrado
  THEN no hace falta ningún cambio en el frontend
  AND esa ausencia se verifica, no se supone

- **Mutación**: GIVEN una de las dos herramientas conserva `missing_user_context`
  WHEN se ejecuta la suite
  THEN el primer escenario **MUST** fallar
  AND la regla de TER-003 tendría que nombrar dos códigos para un concepto, que es lo que este
  requisito existe para impedir

### TER-002: Un fallo viaja con su remedio, decidido en el backend

Todo evento `tool_error` **MUST** incluir un campo `remedy` con **exactamente uno** de estos cuatro
valores: `retry`, `connect`, `none`, `whitelist`.

El vocabulario es **cerrado y de cuatro valores** porque la UI tiene exactamente cuatro afordancias:
reintentar, enlazar a Conexiones, enlazar a Contactos, o no ofrecer nada. Un booleano «reintentable»
no distinguiría «enlaza a Conexiones» de «no ofrezcas nada», que es justo la decisión de UX que hay
que tomar; y un solo valor «enlaza» mandaría al usuario a conectar un servicio que ya está conectado
cuando lo que falta es autorizar un destinatario.

La decisión **MUST** tomarse en `_classify_tool_output`, que ya es el único punto de clasificación
(TRI-001) y ya dispone del código del error. El cliente **MUST NOT** derivar la reintentabilidad de
heurísticas sobre el texto del mensaje, ni **MUST** mantener una lista propia de códigos de error del
backend.

- GIVEN payloads `{"error": true, "message": M}`, `{"error": "linkedin_not_configured", "hint": H}`,
  `{"error": "user_context_missing"}` y `{"error": "contact_not_authorized"}`
  WHEN se clasifican
  THEN devuelven remedio `retry`, `connect`, `none` y `whitelist` respectivamente
  AND los cuatro siguen clasificándose como estado «fallo»

- GIVEN una herramienta que devuelve `{"error": "linkedin_not_configured", "hint": H}`
  WHEN se consume el stream
  THEN el evento `tool_error` lleva `remedy: "connect"`
  AND la tarjeta renderizada refleja ese remedio, no el que deduciría del texto

- **Mutación**: GIVEN el remedio se calcula en el cliente a partir del mensaje visible
  WHEN se revisa el cambio
  THEN **MUST** rechazarse: TRI-001 prohíbe distinguir por heurística sobre el texto, y el mensaje es
  copy en castellano que cambia sin avisar

### TER-003: El defecto es `retry`; sólo lo imposible lo pierde

`retry` **MUST** ser el valor por omisión. Un código **MUST** recibir otro remedio sólo si está
probado que reintentar no puede funcionar:

| Remedio | Regla | Códigos |
|---|---|---|
| `connect` | sufijo `_not_configured` o `_not_connected` | `{service}_not_configured`, `whatsapp_not_configured`, `{provider}_not_connected` |
| `whitelist` | literal | `contact_not_authorized` |
| `none` | literal | `user_context_missing` |
| `retry` | **todo lo demás** | `error: true` de n8n, `{provider}_api_error`, y cualquier código futuro |

`contact_not_authorized` estuvo clasificado como `none` y era una afirmación falsa: sí hay algo que
hacer —dar de alta el destinatario en Ajustes → Contactos— y el propio `hint` lo nombraba, pero la
tarjeta no daba ninguna forma de llegar. `none` queda para lo que de verdad no tiene acción de
usuario.

La lista **MUST** ser de **no** reintentables. **MUST NOT** invertirse a una lista de reintentables:
el campo `error` no siempre contiene un código —hay al menos un caso donde contiene una frase
humana—, y con la lista invertida cualquier error nuevo perdería el botón en silencio.

- GIVEN un fallo de webhook de n8n que devuelve `{"error": true, "message": M}`
  WHEN se renderiza la tarjeta
  THEN ofrece «Reintentar», igual que hoy

- GIVEN una herramienta futura devuelve `{"error": "algo_que_nadie_ha_visto"}`
  WHEN se clasifica
  THEN el remedio es `retry`
  AND la tarjeta se comporta como hoy

- **Mutación**: GIVEN la regla pasa a ser una lista de códigos **reintentables**
  WHEN llega un código no listado
  THEN pierde «Reintentar» sin que nadie lo haya decidido
  AND el escenario anterior **MUST** fallar

### TER-004: Ningún «Reintentar» sobre lo que no puede funcionar

Cuando el remedio es `connect`, `none` o `whitelist`, la tarjeta **MUST NOT** renderizar el botón
«Reintentar», ni deshabilitado ni oculto tras un estado: **no existe**. Pulsarlo envía un mensaje
nuevo al agente y **gasta un crédito**.

Cuando el remedio es `connect`, la tarjeta **MUST** ofrecer en su lugar un enlace a Ajustes →
Conexiones. Cuando es `whitelist`, **MUST** ofrecer un enlace a Ajustes → Contactos
(`/settings/contacts`) y **MUST NOT** enlazar a Conexiones: el servicio ya está conectado, lo que
falta es autorizar al destinatario. Cuando es `none`, **MUST NOT** ofrecer ninguna acción: sólo el
mensaje del error, que ya dice qué pasa.

En los cuatro casos la tarjeta **MUST** seguir viéndose como un fallo (✗, «— falló»): la acción no
ocurrió.

- GIVEN un fallo con remedio `connect`
  WHEN se renderiza la tarjeta
  THEN muestra ✗ y el mensaje del error
  AND no contiene ningún botón «Reintentar»
  AND contiene un enlace a Ajustes → Conexiones

- GIVEN un fallo con remedio `whitelist`
  WHEN se renderiza la tarjeta
  THEN muestra ✗ y el mensaje del error
  AND no contiene ningún botón «Reintentar»
  AND contiene un enlace a `/settings/contacts` y ninguno a Conexiones

- GIVEN un fallo con remedio `none`
  WHEN se renderiza la tarjeta
  THEN muestra ✗ y el mensaje
  AND no contiene «Reintentar» ni enlace alguno

- GIVEN un fallo con remedio `retry`
  WHEN se renderiza la tarjeta
  THEN el botón «Reintentar» aparece exactamente como hoy, con su estado deshabilitado durante el streaming

- **Mutación**: GIVEN la tarjeta vuelve a renderizar «Reintentar» para cualquier estado `failed`
  WHEN se ejecuta la suite
  THEN los dos primeros escenarios de este requisito **MUST** fallar

### TER-005: El remedio sobrevive al transporte de marcadores

El estado viaja como marcador de texto en el contenido de la burbuja. El marcador de fallo **MUST**
llevar el remedio, y **MUST** colocarlo **antes** del mensaje: el mensaje puede contener `:` y sólo
el último campo del patrón puede ser el permisivo. La forma es
`[TOOL_ERROR:name:remedy:msg]`, con el remedio **en medio** y nunca al final.

El escritor del marcador **MUST** emitir siempre los tres campos, aplicando `retry` por omisión si el
evento no trae remedio. La arity la garantiza el escritor, no la red.

Todo consumidor de marcadores **MUST** seguir funcionando: en particular, el que los borra para
generar citas en texto llano **MUST** verificarse, no suponerse.

- GIVEN el contenido contiene `[TOOL_ERROR:whatsapp_send_message:connect:Falta la credencial]`
  WHEN se parte el turno en piezas
  THEN sale una pieza de utensilio en estado `failed` con remedio `connect` y el mensaje completo

- GIVEN el mensaje del error contiene `:`
  WHEN se parsea el marcador
  THEN el remedio se extrae correctamente
  AND el mensaje conserva sus dos puntos

- GIVEN un turno con un marcador de fallo de tres campos
  WHEN se genera su cita en texto llano
  THEN el marcador no aparece en el resultado

- **Mutación**: GIVEN el marcador pasa a ser `[TOOL_ERROR:nombre:mensaje:remedio]`
  WHEN llega un mensaje que contiene `:`
  THEN el remedio extraído es basura o el marcador no casa
  AND el segundo escenario de este requisito **MUST** fallar
